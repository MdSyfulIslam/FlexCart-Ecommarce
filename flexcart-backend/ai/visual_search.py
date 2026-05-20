"""
FlexCart Visual Search Service — v5 (CLIP ONNX / free-tier)
============================================================
Semantic image search using a quantized CLIP ViT-B/32 visual encoder
loaded via ONNX Runtime — NO PyTorch dependency at runtime.

Primary path (when ai/models/clip_vision_int8.onnx exists):
  Model:     Xenova/clip-vit-base-patch32 — ONNX INT8 quantized
  Source:    https://huggingface.co/Xenova/clip-vit-base-patch32
  Dataset:   OpenAI WIT (400M image-text pairs from the web)
  Embedding: 512-D L2-normalised CLIP vectors
  Runtime:   onnxruntime-cpu (~80 MB) + model (~100 MB) = ~180 MB Python RSS

Fallback path (if model file absent or corrupt):
  608-D PIL histogram features — color + spatial + texture, no model needed
  Fits any memory budget; lower accuracy than CLIP.

Hybrid scoring (image + text):
  image only  → score = image_similarity
  image+text  → score = 0.70 × image_sim + 0.30 × text_relevance
  text_relevance = keyword token-overlap in [0, 1]
  (CLIP text encoder not included to save RAM; keyword overlap is sufficient
   for product-name boosting and works correctly for "Samsung Galaxy S20 Ultra".)

API endpoints (unchanged — backward compatible):
  POST   /search             Search by image + optional text
  POST   /index-product      Index a single product
  DELETE /index-product/<id> Remove from index
  POST   /bulk-index         Index multiple products
  POST   /reindex-all        Background re-index from DB
  GET    /health             Status, model info, indexed count

Env vars:
  DATABASE_URL       PostgreSQL connection string
  VS_PORT or PORT    Bind port (default 5001)
  BACKEND_PUBLIC_URL Resolve relative /uploads/… paths to absolute URLs
"""

import sys
import os

# Add the vendor directory (pip install --target) to sys.path before any
# third-party imports. This is needed when the script is spawned as a
# subprocess by Node.js and PYTHONPATH is not guaranteed to be inherited.
_vendor_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor')
if _vendor_dir not in sys.path:
    sys.path.insert(0, _vendor_dir)

import io
import json
import logging
import re
import threading
import time
from pathlib import Path
from typing import Optional

import numpy as np
import requests
from flask import Flask, jsonify, request
from PIL import Image

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [VS] %(levelname)s %(message)s',
)
logger = logging.getLogger(__name__)

# ── Model paths ───────────────────────────────────────────────────────────────
_MODEL_DIR  = Path(__file__).parent / 'models'
_MODEL_PATH = _MODEL_DIR / 'clip_vision_int8.onnx'

# ── ONNX Runtime state ────────────────────────────────────────────────────────
_onnx_session    = None   # ort.InferenceSession
_onnx_input_name = None   # str
_onnx_emb_idx    = 0      # index into session.run() output list

# ── Active mode flags (set at startup) ───────────────────────────────────────
_use_clip             = False   # True → CLIP ONNX; False → PIL histograms
_FEAT_DIM             = 608     # 512 for CLIP, 608 for histogram fallback
_EXACT_IMG_THRESHOLD  = 0.88    # exact_match threshold; 0.65 for CLIP, 0.88 for histograms

# ── In-memory index ───────────────────────────────────────────────────────────
_index: dict      = {}
_index_lock       = threading.Lock()

BACKEND_PUBLIC_URL = (
    os.environ.get('BACKEND_PUBLIC_URL') or
    os.environ.get('PUBLIC_BASE_URL') or ''
).rstrip('/')

app = Flask(__name__)


# ── URL helpers ───────────────────────────────────────────────────────────────

def to_absolute_url(path_or_url: str) -> str:
    """Convert a relative /uploads/… path to an absolute URL."""
    v = str(path_or_url or '')
    if not v:
        return v
    if v.startswith('http://') or v.startswith('https://'):
        return v
    if BACKEND_PUBLIC_URL:
        p = v if v.startswith('/') else f'/{v}'
        return f'{BACKEND_PUBLIC_URL}{p}'
    return v


# ── CLIP ONNX initialisation ──────────────────────────────────────────────────

# CLIP preprocessing constants (from openai/clip on GitHub)
_CLIP_MEAN = np.array([0.48145466, 0.4578275,  0.40821073], dtype=np.float32)
_CLIP_STD  = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)


def _clip_preprocess(img: Image.Image, size: int = 224) -> np.ndarray:
    """
    CLIP image preprocessing — resize shortest side → size, center-crop,
    normalise with CLIP mean/std, return CHW float32 batch tensor.
    """
    img = img.convert('RGB')
    w, h = img.size
    scale = size / min(w, h)
    new_w, new_h = max(size, int(round(w * scale))), max(size, int(round(h * scale)))
    img = img.resize((new_w, new_h), Image.BICUBIC)
    # Center crop
    w, h = img.size
    left = (w - size) // 2
    top  = (h - size) // 2
    img  = img.crop((left, top, left + size, top + size))
    # Normalise
    arr  = np.array(img, dtype=np.float32) / 255.0
    arr  = (arr - _CLIP_MEAN) / _CLIP_STD
    # HWC → CHW → add batch dimension
    return arr.transpose(2, 0, 1)[np.newaxis]   # (1, 3, 224, 224)


def _init_clip_onnx() -> bool:
    """
    Load the quantized CLIP ONNX visual encoder.
    Probes the session to find the 512-D embedding output automatically,
    so it works regardless of the exact output node names.
    Returns True on success.
    """
    global _onnx_session, _onnx_input_name, _onnx_emb_idx
    global _use_clip, _FEAT_DIM, _EXACT_IMG_THRESHOLD

    if not _MODEL_PATH.exists():
        logger.info('CLIP ONNX model not found — using PIL histogram fallback')
        return False

    try:
        import onnxruntime as ort
    except ImportError:
        logger.warning('onnxruntime not installed — using PIL histogram fallback')
        return False

    try:
        logger.info(f'Loading CLIP ONNX model from {_MODEL_PATH} …')
        t0   = time.time()
        sess = ort.InferenceSession(
            str(_MODEL_PATH),
            providers=['CPUExecutionProvider'],
        )
        input_name  = sess.get_inputs()[0].name
        output_info = sess.get_outputs()

        # Probe with a dummy input to discover which output is the 512-D embedding
        dummy     = np.zeros((1, 3, 224, 224), dtype=np.float32)
        test_outs = sess.run(None, {input_name: dummy})

        emb_idx = None
        for i, out in enumerate(test_outs):
            if len(out.shape) == 2 and out.shape[-1] == 512:
                emb_idx = i
                break

        if emb_idx is None:
            logger.warning(
                f'CLIP ONNX outputs {[o.shape for o in test_outs]} — '
                'no 512-D embedding found; using PIL fallback'
            )
            return False

        _onnx_session    = sess
        _onnx_input_name = input_name
        _onnx_emb_idx    = emb_idx
        _use_clip             = True
        _FEAT_DIM             = 512
        _EXACT_IMG_THRESHOLD  = 0.65   # CLIP cosine sims are on a different scale

        logger.info(
            f'CLIP ONNX ready in {time.time() - t0:.1f}s '
            f'(input={input_name!r}, emb_output_idx={emb_idx})'
        )
        return True

    except Exception as exc:
        logger.error(f'CLIP ONNX init failed: {exc} — using PIL histogram fallback')
        return False


# ── Feature extraction ────────────────────────────────────────────────────────

def encode_features(img: Image.Image) -> Optional[np.ndarray]:
    """
    Extract a visual embedding from a PIL image.
    CLIP path (512-D): semantic cross-category embeddings via ONNX Runtime.
    Histogram path (608-D): colour + spatial + texture features, no model needed.
    Both outputs are L2-normalised float32 vectors ready for cosine similarity.
    """
    if _use_clip:
        return _encode_clip(img)
    return _extract_histograms(img)


def _encode_clip(img: Image.Image) -> Optional[np.ndarray]:
    """CLIP visual encoder: (1, 3, 224, 224) → 512-D L2-normalised embedding."""
    try:
        tensor = _clip_preprocess(img)
        outputs = _onnx_session.run(None, {_onnx_input_name: tensor})
        emb     = outputs[_onnx_emb_idx][0].astype(np.float32)   # (512,)
        norm    = np.linalg.norm(emb)
        return (emb / (norm + 1e-8)).astype(np.float32)
    except Exception as e:
        logger.debug(f'_encode_clip error: {e}')
        return None


# ── PIL histogram fallback (608-D) ────────────────────────────────────────────

def _pad_to_square(img: Image.Image, size: int = 64) -> Image.Image:
    """Aspect-ratio-preserving square pad then resize — prevents shape distortion."""
    w, h   = img.size
    side   = max(w, h)
    canvas = Image.new('RGB', (side, side), (255, 255, 255))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def _rgb_to_hsv(arr: np.ndarray) -> np.ndarray:
    """Convert float32 RGB (H,W,3) in [0,1] to HSV in [0,1]. Pure NumPy."""
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    cmax  = np.maximum(np.maximum(r, g), b)
    cmin  = np.minimum(np.minimum(r, g), b)
    delta = cmax - cmin
    h     = np.zeros_like(r)
    m_r   = (delta > 0) & (cmax == r)
    m_g   = (delta > 0) & (cmax == g)
    m_b   = (delta > 0) & (cmax == b)
    h[m_r] = ((g[m_r] - b[m_r]) / delta[m_r]) % 6
    h[m_g] =  (b[m_g] - r[m_g]) / delta[m_g] + 2
    h[m_b] =  (r[m_b] - g[m_b]) / delta[m_b] + 4
    h /= 6.0
    s = np.where(cmax > 0, delta / (cmax + 1e-8), 0.0)
    return np.stack([h, s, cmax], axis=-1)


def _extract_histograms(img: Image.Image) -> Optional[np.ndarray]:
    """
    608-D feature vector: RGB histograms (96) + HSV histograms (64)
    + spatial 8×8 RGB grid (192) + grayscale 16×16 thumbnail (256).
    L2-normalised float32.
    """
    try:
        base = _pad_to_square(img.convert('RGB'), size=64)
        arr  = np.array(base, dtype=np.float32) / 255.0

        r_h = np.histogram(arr[:, :, 0], bins=32, range=(0.0, 1.0))[0]
        g_h = np.histogram(arr[:, :, 1], bins=32, range=(0.0, 1.0))[0]
        b_h = np.histogram(arr[:, :, 2], bins=32, range=(0.0, 1.0))[0]
        rgb_hist = np.concatenate([r_h, g_h, b_h]).astype(np.float32)

        hsv = _rgb_to_hsv(arr)
        h_h = np.histogram(hsv[:, :, 0], bins=32, range=(0.0, 1.0))[0]
        s_h = np.histogram(hsv[:, :, 1], bins=16, range=(0.0, 1.0))[0]
        v_h = np.histogram(hsv[:, :, 2], bins=16, range=(0.0, 1.0))[0]
        hsv_hist = np.concatenate([h_h, s_h, v_h]).astype(np.float32)

        spatial = np.array(
            base.resize((8, 8), Image.LANCZOS), dtype=np.float32
        ).flatten() / 255.0

        thumb = np.array(
            base.convert('L').resize((16, 16), Image.LANCZOS), dtype=np.float32
        ).flatten() / 255.0

        feat = np.concatenate([rgb_hist, hsv_hist, spatial, thumb])
        norm = np.linalg.norm(feat)
        return (feat / (norm + 1e-8)).astype(np.float32)
    except Exception as e:
        logger.debug(f'_extract_histograms error: {e}')
        return None


# ── Text scoring ──────────────────────────────────────────────────────────────

_STOP_WORDS = frozenset([
    'a', 'an', 'the', 'is', 'are', 'in', 'on', 'at', 'to', 'for', 'of',
    'with', 'and', 'or', 'by', 'this', 'that', 'it', 'its', 'be', 'as',
    'from', 'was', 'but', 'not', 'have',
])


def _tokenize(text: str) -> list:
    tokens = re.findall(r'[a-z0-9]+', text.lower())
    return [t for t in tokens if len(t) > 2 and t not in _STOP_WORDS]


def _text_relevance(query: str, product_name: str) -> float:
    """Keyword token-overlap in [0, 1]. Boosts exact product-name matches."""
    if not query or not product_name:
        return 0.0
    q_tokens = set(_tokenize(query))
    if not q_tokens:
        return 0.0
    haystack = product_name.lower()
    matches  = sum(1 for t in q_tokens if t in haystack)
    return min(1.0, matches / len(q_tokens))


def _combined_score(img_sim: float, text_rel: float) -> float:
    """
    Blend visual similarity and text relevance.
    No text → pure visual score.
    With text → 70 % visual + 30 % text, so image is always the primary signal.
    """
    if text_rel <= 0.0:
        return img_sim
    return 0.70 * img_sim + 0.30 * text_rel


# ── Image loading ─────────────────────────────────────────────────────────────

def _load_image(url_or_path: str) -> Optional[Image.Image]:
    """Load a PIL Image from a URL or local path. Returns None on failure."""
    try:
        abs_url = to_absolute_url(url_or_path)
        local   = Path(__file__).parent.parent / url_or_path.lstrip('/')
        if local.exists():
            return Image.open(local).convert('RGB')
        if abs_url.startswith('http'):
            resp = requests.get(abs_url, timeout=15, stream=True)
            resp.raise_for_status()
            return Image.open(io.BytesIO(resp.content)).convert('RGB')
    except Exception as e:
        logger.debug(f'Image load failed ({url_or_path}): {e}')
    return None


# ── Database persistence ──────────────────────────────────────────────────────

def _get_db_conn():
    """Open a psycopg2 connection from DATABASE_URL, or return None."""
    try:
        import psycopg2
        db_url = os.environ.get('DATABASE_URL', '')
        if not db_url:
            return None
        ssl_mode = 'require' if any(
            x in db_url for x in ['.supabase.co', '.supabase.com', '.render.com', 'postgres.']
        ) else 'prefer'
        return psycopg2.connect(db_url, sslmode=ssl_mode)
    except Exception as e:
        logger.debug(f'DB connect failed: {e}')
        return None


def _ensure_db_table():
    """Create product_embeddings table and add model_name column if missing."""
    conn = _get_db_conn()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS product_embeddings (
                product_id   INTEGER       PRIMARY KEY,
                embedding    TEXT          NOT NULL,
                image_url    VARCHAR(1000),
                product_name VARCHAR(500),
                model_name   VARCHAR(100),
                indexed_at   TIMESTAMP     DEFAULT NOW()
            )
        """)
        conn.commit()
        # Add model_name column when upgrading from v4 schema
        try:
            cur.execute(
                "ALTER TABLE product_embeddings ADD COLUMN IF NOT EXISTS model_name VARCHAR(100)"
            )
            conn.commit()
        except Exception:
            conn.rollback()
        cur.close()
    except Exception as e:
        logger.warning(f'ensure_db_table: {e}')
        try:
            conn.rollback()
        except Exception:
            pass
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _save_to_db(product_id: str, embedding: np.ndarray, image_url: str, name: str):
    """Upsert one product embedding into PostgreSQL."""
    model_tag = 'clip-vitb32-int8' if _use_clip else 'histogram-v4'
    conn = _get_db_conn()
    if not conn:
        return
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO product_embeddings
                        (product_id, embedding, image_url, product_name, model_name)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (product_id) DO UPDATE SET
                        embedding    = EXCLUDED.embedding,
                        image_url    = EXCLUDED.image_url,
                        product_name = EXCLUDED.product_name,
                        model_name   = EXCLUDED.model_name,
                        indexed_at   = NOW()
                """, (int(product_id), json.dumps(embedding.tolist()), image_url, name, model_tag))
    except Exception as e:
        logger.warning(f'save_to_db ({product_id}): {e}')
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _delete_from_db(product_id: str):
    """Delete a product embedding from PostgreSQL."""
    conn = _get_db_conn()
    if not conn:
        return
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    'DELETE FROM product_embeddings WHERE product_id = %s',
                    (int(product_id),)
                )
    except Exception as e:
        logger.warning(f'delete_from_db ({product_id}): {e}')
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _load_index_from_db() -> int:
    """
    Load embeddings from PostgreSQL into the in-memory index.
    If any stored embedding has the wrong dimension (different model version),
    the table is truncated so _auto_index_missing() rebuilds with the current model.
    """
    conn = _get_db_conn()
    if not conn:
        logger.warning('No DATABASE_URL — index will be in-memory only (lost on restart)')
        return 0
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT product_id, embedding, image_url, product_name FROM product_embeddings'
            )
            rows = cur.fetchall()

        # Detect stale embeddings from a different model version
        stale = False
        for _, emb_text, _, _ in rows:
            if not emb_text:
                continue
            try:
                if len(json.loads(emb_text)) != _FEAT_DIM:
                    stale = True
                    break
            except Exception:
                stale = True
                break

        if stale:
            with conn:
                with conn.cursor() as cur:
                    cur.execute('TRUNCATE product_embeddings')
            model_name = 'CLIP ViT-B/32 INT8' if _use_clip else 'PIL histograms'
            logger.info(
                f'Cleared {len(rows)} stale embeddings (wrong dimension) '
                f'— will re-index with {model_name}'
            )
            conn.close()
            return 0

        new_index: dict = {}
        for pid, emb_text, img_url, name in rows:
            if not emb_text:
                continue
            try:
                arr = np.array(json.loads(emb_text), dtype=np.float32)
                new_index[str(pid)] = {
                    'embedding': arr,
                    'image_url': img_url or '',
                    'name':      name   or '',
                }
            except Exception:
                pass

        with _index_lock:
            _index.update(new_index)
        conn.close()
        mode = 'CLIP' if _use_clip else 'histogram'
        logger.info(f'Loaded {len(new_index)} {mode} embeddings from PostgreSQL')
        return len(new_index)

    except Exception as e:
        logger.warning(f'load_index_from_db: {e}')
        try:
            conn.close()
        except Exception:
            pass
        return 0


# ── Auto-startup indexing ─────────────────────────────────────────────────────

def _auto_index_missing():
    """
    Background thread: encode any active product that has no embedding yet.
    Runs once on startup; new products are indexed on-demand via /index-product.
    """
    time.sleep(2)   # let Flask finish binding

    conn = _get_db_conn()
    if not conn:
        logger.info('Auto-index: skipped (no DATABASE_URL)')
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT p.id, p.name, p.image_url
                FROM products p
                WHERE p.status = 'active'
                  AND p.image_url IS NOT NULL
                  AND p.image_url != ''
                  AND p.id NOT IN (SELECT product_id FROM product_embeddings)
                LIMIT 500
            """)
            unindexed = cur.fetchall()
        conn.close()

        if not unindexed:
            logger.info('Auto-index: all products already indexed')
            return

        mode = 'CLIP ViT-B/32 INT8' if _use_clip else 'PIL histograms'
        logger.info(f'Auto-index: encoding {len(unindexed)} products with {mode}…')
        done = 0
        for pid, name, image_url in unindexed:
            try:
                img = _load_image(to_absolute_url(image_url or '') or image_url or '')
                if img is None:
                    continue
                emb = encode_features(img)
                if emb is None:
                    continue
                pid_s = str(pid)
                with _index_lock:
                    _index[pid_s] = {
                        'embedding': emb,
                        'image_url': image_url,
                        'name':      name or '',
                    }
                _save_to_db(pid_s, emb, image_url, name or '')
                done += 1
            except Exception as e:
                logger.debug(f'Auto-index skip {pid}: {e}')

        logger.info(f'Auto-index complete: {done}/{len(unindexed)} products indexed')
    except Exception as e:
        logger.warning(f'auto_index_missing error: {e}')


# ── Flask routes ──────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    with _index_lock:
        n = len(_index)
    return jsonify({
        'status':           'ok',
        'model':            ('CLIP ViT-B/32 INT8 (ONNX)' if _use_clip
                             else 'PIL histograms (fallback)'),
        'model_loaded':     True,
        'embedding_dim':    _FEAT_DIM,
        'indexed_products': n,
    })


@app.route('/index-product', methods=['POST'])
def index_product():
    """
    Index a single product image.
    JSON: { "product_id", "image_url", "name" }
    OR multipart: product_id + name + image_url fields (or image file upload).
    """
    try:
        if request.is_json:
            data       = request.get_json()
            product_id = str(data['product_id'])
            image_url  = data.get('image_url', '')
            name       = data.get('name', '')
            img = _load_image(to_absolute_url(image_url) or image_url)
        else:
            product_id = str(request.form.get('product_id', ''))
            name       = request.form.get('name', '')
            image_url  = request.form.get('image_url', '')
            f   = request.files.get('image')
            img = (Image.open(f.stream).convert('RGB') if f
                   else _load_image(to_absolute_url(image_url) or image_url))

        if img is None:
            return jsonify({'success': False, 'message': 'Could not load image'}), 400
        if not product_id:
            return jsonify({'success': False, 'message': 'product_id is required'}), 400

        emb = encode_features(img)
        if emb is None:
            return jsonify({'success': False, 'message': 'Feature extraction failed'}), 500

        with _index_lock:
            _index[product_id] = {'embedding': emb, 'image_url': image_url, 'name': name}
        _save_to_db(product_id, emb, image_url, name)
        return jsonify({'success': True, 'product_id': product_id})
    except Exception as e:
        logger.error(f'index-product error: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/index-product/<product_id>', methods=['DELETE'])
def remove_from_index(product_id):
    """Remove a product from the visual search index."""
    with _index_lock:
        removed = _index.pop(product_id, None) is not None
    _delete_from_db(product_id)
    if removed:
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'Product not in index'}), 404


@app.route('/search', methods=['POST'])
def search():
    """
    Hybrid image + text search.

    Multipart: image file + optional description text field.
    JSON:      { "image_url": "…", "description": "…" }

    Query params:
      top_k     (default 20)   max results
      min_score (default 0.15) minimum combined score (CLIP scale)
                               use 0.20 if serving histogram-only fallback

    Scoring:
      image only  → score = cosine_sim(query_emb, product_emb)
      image+text  → score = 0.70 × img_sim + 0.30 × text_relevance

    exact_match when img_sim ≥ threshold OR (high text_rel AND plausible img_sim).
    """
    try:
        top_k     = int(request.args.get('top_k', 20))
        min_score = float(request.args.get('min_score', 0.15))

        # ── Parse request ─────────────────────────────────────────────────────
        if request.is_json:
            data        = request.get_json()
            description = data.get('description', '') or data.get('text', '')
            url         = data.get('image_url', '')
            img         = _load_image(to_absolute_url(url) or url)
        else:
            f           = request.files.get('image')
            description = request.form.get('description', '') or request.form.get('text', '')
            image_url   = request.form.get('image_url', '')
            if f:
                img = Image.open(f.stream).convert('RGB')
            elif image_url:
                img = _load_image(to_absolute_url(image_url) or image_url)
            else:
                return jsonify({'success': False, 'message': 'No image provided'}), 400

        if img is None:
            return jsonify({'success': False, 'message': 'Could not load image'}), 400

        # ── Encode query image ────────────────────────────────────────────────
        query_emb = encode_features(img)
        if query_emb is None:
            return jsonify({'success': False, 'message': 'Feature extraction failed'}), 500

        description = (description or '').strip()

        with _index_lock:
            snapshot = dict(_index)

        if not snapshot:
            return jsonify({
                'success': True, 'data': [],
                'message': 'Index is empty — products are still being indexed',
            })

        # ── Score every indexed product ───────────────────────────────────────
        results = []
        for pid, entry in snapshot.items():
            prod_emb = entry['embedding']

            # Cosine similarity (both vectors are L2-normalised → dot == cosine)
            img_sim  = float(np.dot(query_emb, prod_emb))
            text_rel = _text_relevance(description, entry.get('name', ''))
            score    = _combined_score(img_sim, text_rel)

            # Include if score or raw image similarity meets threshold
            raw_threshold = 0.18 if _use_clip else 0.22
            if score >= min_score or img_sim >= raw_threshold:
                exact_text = bool(description) and text_rel >= 0.60 and img_sim >= 0.25
                results.append({
                    'product_id':       pid,
                    'image_similarity': round(img_sim,   4),
                    'text_relevance':   round(text_rel,  4),
                    'score':            round(score,     4),
                    'image_url':        entry['image_url'],
                    'name':             entry['name'],
                    'exact_match':      img_sim >= _EXACT_IMG_THRESHOLD or exact_text,
                })

        results.sort(key=lambda x: x['score'], reverse=True)
        results = results[:top_k]
        return jsonify({'success': True, 'data': results, 'total': len(results)})

    except Exception as e:
        logger.error(f'search error: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/bulk-index', methods=['POST'])
def bulk_index():
    """
    Index multiple products at once.
    JSON body: { "products": [ { "product_id", "image_url", "name" }, … ] }
    """
    try:
        products        = (request.get_json() or {}).get('products', [])
        indexed, failed = 0, []

        for p in products:
            pid       = str(p.get('product_id', ''))
            image_url = p.get('image_url', '')
            name      = p.get('name', '')
            if not pid or not image_url:
                continue
            try:
                img = _load_image(to_absolute_url(image_url) or image_url)
                if img is None:
                    failed.append({'product_id': pid, 'error': 'image not found'})
                    continue
                emb = encode_features(img)
                if emb is None:
                    failed.append({'product_id': pid, 'error': 'feature extraction failed'})
                    continue
                with _index_lock:
                    _index[pid] = {'embedding': emb, 'image_url': image_url, 'name': name}
                _save_to_db(pid, emb, image_url, name)
                indexed += 1
            except Exception as e:
                failed.append({'product_id': pid, 'error': str(e)})

        return jsonify({'success': True, 'indexed': indexed, 'failed': failed})
    except Exception as e:
        logger.error(f'bulk-index error: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/reindex-all', methods=['POST'])
def reindex_all():
    """Trigger a background re-index of all unindexed products."""
    threading.Thread(target=_auto_index_missing, daemon=True).start()
    return jsonify({'success': True, 'message': 'Reindex started in background'})


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    logger.info('Starting FlexCart Visual Search Service v5…')

    # 1. Try to load quantized CLIP ONNX model (downloaded at build time).
    #    Falls back to PIL histograms silently if model file is absent.
    _init_clip_onnx()

    mode = 'CLIP ViT-B/32 INT8 (ONNX)' if _use_clip else 'PIL histograms (fallback)'
    logger.info(f'Feature extraction mode: {mode}  |  dim={_FEAT_DIM}')

    # 2. Ensure PostgreSQL table exists
    _ensure_db_table()

    # 3. Load existing embeddings from DB.
    #    Stale embeddings from a different model version are auto-cleared.
    n = _load_index_from_db()

    # 4. Background: encode any products not yet in the DB
    threading.Thread(target=_auto_index_missing, daemon=True).start()

    port = int(os.environ.get('VS_PORT') or os.environ.get('PORT') or 5001)
    logger.info(f'Visual Search Service v5 ready on :{port} ({n} products loaded)')
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
