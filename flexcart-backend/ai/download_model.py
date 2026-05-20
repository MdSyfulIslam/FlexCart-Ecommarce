"""
Build-time script: download the quantized CLIP ViT-B/32 visual encoder (ONNX INT8).

Run once during Render's buildCommand — the model is baked into the runtime image
so startup is instant (~2 s load) instead of downloading on first request.

Model: Xenova/clip-vit-base-patch32 — quantized ONNX visual encoder
Source: https://huggingface.co/Xenova/clip-vit-base-patch32
Size:   ~86 MB (INT8 quantized, down from ~340 MB float32 PyTorch checkpoint)
Output: 512-D L2-normalised CLIP image embeddings

This script is intentionally non-fatal: if the download fails the build still
succeeds and the Python service falls back to the PIL histogram approach.
"""

import os
import sys
import urllib.request
from pathlib import Path

MODEL_DIR  = Path(__file__).parent / 'models'
MODEL_PATH = MODEL_DIR / 'clip_vision_int8.onnx'

# Minimum expected file size — anything smaller is a corrupt/partial download
MIN_SIZE_BYTES = 40 * 1024 * 1024  # 40 MB

# Primary + mirror URLs for the quantized CLIP vision encoder
DOWNLOAD_URLS = [
    # Xenova's transformers.js ONNX exports on HuggingFace Hub
    'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx',
    # Direct CDN mirror (no auth required)
    'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx?download=true',
]


def _download(url: str, dest: Path) -> bool:
    """Download url → dest. Returns True on success."""
    tmp = dest.with_suffix('.tmp')
    try:
        print(f'  Downloading from {url} …', flush=True)
        urllib.request.urlretrieve(url, tmp)
        size = tmp.stat().st_size
        if size < MIN_SIZE_BYTES:
            print(f'  File too small ({size / 1024 / 1024:.1f} MB) — likely corrupt, skipping')
            tmp.unlink(missing_ok=True)
            return False
        tmp.rename(dest)
        print(f'  Saved → {dest}  ({size / 1024 / 1024:.1f} MB)', flush=True)
        return True
    except Exception as exc:
        print(f'  Download failed: {exc}')
        tmp.unlink(missing_ok=True)
        return False


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    # Already present and valid
    if MODEL_PATH.exists() and MODEL_PATH.stat().st_size >= MIN_SIZE_BYTES:
        size_mb = MODEL_PATH.stat().st_size / 1024 / 1024
        print(f'CLIP ONNX model already cached ({size_mb:.1f} MB) — skipping download')
        return

    # Remove any leftover partial file
    MODEL_PATH.unlink(missing_ok=True)

    print('Downloading quantized CLIP ViT-B/32 vision encoder (ONNX INT8, ~86 MB)…')
    for url in DOWNLOAD_URLS:
        if _download(url, MODEL_PATH):
            print('CLIP ONNX model ready.')
            return

    # All attempts failed — non-fatal, service falls back to PIL histograms
    print(
        'WARNING: CLIP ONNX model download failed.\n'
        'The visual search service will start with PIL histogram features (lower accuracy).\n'
        'Re-deploy or run `python3 ai/download_model.py` manually to retry.'
    )


if __name__ == '__main__':
    main()
