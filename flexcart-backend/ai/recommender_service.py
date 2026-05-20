"""\
FlexCart Recommendation Service (Python)

A lightweight Flask microservice that ranks products for a user based on:
- Recent interactions: view, search, favourite, request, cart, order, reviews
- Similarity to a seed product (e.g., last viewed or search result)
- Boosts: best reviewed, best discount, newest products

This service is intentionally dependency-light (Flask only). It expects the
Node.js backend to provide product + interaction context as JSON.

Run:
  python recommender_service.py

Env:
  REC_PORT=5003

Endpoints:
  GET  /health
  POST /recommend
"""

from __future__ import annotations

import os
import math
import json
import logging
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)


STOP_WORDS = {
    "the", "a", "an", "and", "or", "for", "with", "this", "that", "from", "your", "our",
    "you", "are", "was", "were", "have", "has", "had", "will", "can", "not", "but", "all",
    "any", "new", "best", "top", "its", "his", "her", "their", "they", "them", "into", "out",
    "about", "over", "under", "more", "less", "than", "too", "very", "item", "product", "buy",
}


RECOMMENDER_CONFIG: Dict[str, Any] = {
    "interactionWeights": {
        "order": 7.0,
        "favourite": 3.0,
        "cart": 2.0,
        "view": 2.2,
        "search": 2.4,
        "request": 2.8,
        "reviewPositive": 4.0,
        "reviewNegative": -1.0,
        "seed": 6.0,
    },
    "recencyHalfLifeDays": {
        "order": 180.0,
        "favourite": 240.0,
        "cart": 45.0,
        "view": 21.0,
        "search": 14.0,
        "request": 120.0,
        "review": 240.0,
    },
    "contentWeights": {
        "category": 0.26,
        "brand": 0.16,
        "token": 0.17,
        "price": 0.10,
        "quality": 0.15,
        "freshness": 0.08,
        "discount": 0.08,
    },
    "seedWeights": {
        "category": 0.45,
        "brand": 0.25,
        "token": 0.20,
        "price": 0.10,
    },
    "blendWeights": {
        "contentOnly": {"content": 0.90, "qualityBoost": 0.10},
    },
    "maxTokenFeatures": 80,
    "bayesianPriorCount": 6.0,
}


def to_number(value: Any, fallback: float = 0.0) -> float:
    try:
        num = float(value)
        if math.isfinite(num):
            return num
        return fallback
    except Exception:
        return fallback


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def to_int_or_none(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return int(value)
    try:
        s = str(value).strip()
        if not s:
            return None
        # tolerate "3.0" or "3 "
        return int(float(s))
    except Exception:
        return None


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        # millis or seconds?
        ts = float(value)
        if ts > 10_000_000_000:  # milliseconds
            ts /= 1000.0
        try:
            return datetime.fromtimestamp(ts)
        except Exception:
            return None

    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None

        # Common MySQL formats: "YYYY-MM-DD HH:MM:SS" or ISO-ish
        for fmt in (
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%d %H:%M:%S.%f",
        ):
            try:
                return datetime.strptime(s, fmt)
            except Exception:
                pass

        # Best-effort: try fromisoformat
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None

    return None


def get_age_days(dt: Optional[datetime]) -> float:
    if not dt:
        return 9999.0
    try:
        delta = datetime.now(dt.tzinfo) - dt
        return max(0.0, delta.total_seconds() / (60.0 * 60.0 * 24.0))
    except Exception:
        return 9999.0


def recency_decay(dt: Any, half_life_days: float) -> float:
    d = _parse_datetime(dt)
    age = get_age_days(d)
    if not math.isfinite(age):
        return 0.0
    return math.pow(0.5, age / max(half_life_days, 1.0))


def tokenize(text: str) -> List[str]:
    if not text:
        return []
    tokens = []
    current = []
    for ch in text.lower():
        if ch.isalnum():
            current.append(ch)
        else:
            if current:
                token = "".join(current)
                current = []
                if len(token) > 2 and token not in STOP_WORDS:
                    tokens.append(token)
    if current:
        token = "".join(current)
        if len(token) > 2 and token not in STOP_WORDS:
            tokens.append(token)

    # unique, stable
    seen = set()
    uniq = []
    for t in tokens:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


def get_product_tokens(product: Dict[str, Any]) -> List[str]:
    parts: List[str] = []
    for key in ("name", "description", "brand", "model", "color", "category_name"):
        val = product.get(key)
        if isinstance(val, str) and val.strip():
            parts.append(val)

    tags = product.get("tags")
    if tags:
        if isinstance(tags, list):
            parts.append(" ".join([str(x) for x in tags]))
        elif isinstance(tags, str):
            try:
                parsed = json.loads(tags)
                if isinstance(parsed, list):
                    parts.append(" ".join([str(x) for x in parsed]))
                else:
                    parts.append(tags)
            except Exception:
                parts.append(tags)

    return tokenize(" ".join(parts))


def normalize_by_max(score_map: Dict[Any, float]) -> Dict[Any, float]:
    if not score_map:
        return {}
    max_v = max(score_map.values())
    if not max_v:
        return {k: 0.0 for k in score_map.keys()}
    return {k: (v / max_v) for k, v in score_map.items()}


def compute_discount_pct(product: Dict[str, Any]) -> float:
    price = to_number(product.get("current_price"), 0.0)
    old_price = to_number(product.get("old_price"), 0.0)
    explicit = to_number(product.get("discount_percentage"), 0.0)
    if explicit > 0:
        return explicit
    if old_price > 0 and old_price > price:
        return ((old_price - price) / old_price) * 100.0
    return 0.0


def compute_quality_score(product: Dict[str, Any], *, global_avg_rating: float, max_sold: float) -> float:
    rating_norm = clamp01(to_number(product.get("rating"), 0.0) / 5.0)
    vote_count = max(to_number(product.get("total_ratings"), 0.0), 0.0)
    m = float(RECOMMENDER_CONFIG["bayesianPriorCount"])
    bayesian = ((vote_count / (vote_count + m)) * rating_norm) + ((m / (vote_count + m)) * global_avg_rating)

    sold = to_number(product.get("total_sold"), 0.0)
    popularity = clamp01(math.log1p(sold) / math.log1p(max_sold + 1.0))
    return clamp01((bayesian * 0.7) + (popularity * 0.3))


def compute_seed_score(seed: Dict[str, Any], candidate: Dict[str, Any]) -> float:
    seed_tokens = get_product_tokens(seed)
    cand_tokens = get_product_tokens(candidate)

    intersection = len([t for t in cand_tokens if t in set(seed_tokens)])
    union = len(set(seed_tokens).union(cand_tokens)) or 1
    token_score = clamp01(intersection / union)

    seed_cat = to_int_or_none(seed.get("category_id"))
    cand_cat = to_int_or_none(candidate.get("category_id"))
    category_score = 1.0 if seed_cat is not None and cand_cat is not None and seed_cat == cand_cat else 0.0

    seed_brand = str(seed.get("brand") or "").strip().lower()
    cand_brand = str(candidate.get("brand") or "").strip().lower()
    brand_score = 1.0 if seed_brand and cand_brand and seed_brand == cand_brand else 0.0

    seed_price = to_number(seed.get("current_price"), 0.0)
    price = to_number(candidate.get("current_price"), 0.0)
    price_score = clamp01(1.0 - (abs(seed_price - price) / max(seed_price, 1.0)))

    w = RECOMMENDER_CONFIG["seedWeights"]
    return (
        category_score * w["category"]
        + brand_score * w["brand"]
        + token_score * w["token"]
        + price_score * w["price"]
    )


def rank_popular(products: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    scored: List[Tuple[float, Dict[str, Any]]] = []
    for p in products:
        rating_score = clamp01(to_number(p.get("rating"), 0.0) / 5.0)
        popularity_score = clamp01(math.log1p(to_number(p.get("total_sold"), 0.0)) / 8.0)
        freshness = clamp01(recency_decay(p.get("created_at"), 120.0))
        score = (rating_score * 0.45) + (popularity_score * 0.45) + (freshness * 0.10)
        pp = dict(p)
        pp["recommendation_score"] = round(score, 4)
        pp["recommendation_source"] = "popular_fallback_python"
        scored.append((pp["recommendation_score"], pp))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:limit]]


def build_recommendations(payload: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    products = payload.get("products") or []
    if not isinstance(products, list) or len(products) == 0:
        return [], {"strategy": "empty_catalog"}

    user_id = payload.get("user_id")
    seed_product_id = payload.get("seed_product_id")
    limit = int(payload.get("limit") or 12)
    limit = min(max(limit, 1), 60)

    interactions = payload.get("interactions") or {}
    orders = interactions.get("orders") or []
    favourites = interactions.get("favourites") or []
    cart = interactions.get("cart") or []
    reviews = interactions.get("reviews") or []
    requests = interactions.get("requests") or []
    tracked = interactions.get("tracked") or []

    product_by_id = {int(p.get("id")): p for p in products if p.get("id") is not None}

    global_avg = 0.5
    try:
        global_avg = sum([clamp01(to_number(p.get("rating"), 0.0) / 5.0) for p in products]) / max(len(products), 1)
    except Exception:
        global_avg = 0.5

    max_sold = max([to_number(p.get("total_sold"), 0.0) for p in products] + [1.0])

    seed_product: Optional[Dict[str, Any]] = None
    if seed_product_id is not None:
        try:
            seed_product = product_by_id.get(int(seed_product_id))
        except Exception:
            seed_product = None

    seed_cat = to_int_or_none(seed_product.get("category_id")) if seed_product else None

    # Cold start (not logged in)
    if not user_id:
        if seed_product:
            scored: List[Dict[str, Any]] = []
            for p in products:
                if seed_product and p.get("id") == seed_product.get("id"):
                    continue

                seed_score = compute_seed_score(seed_product, p)
                quality = compute_quality_score(p, global_avg_rating=global_avg, max_sold=max_sold)
                freshness = clamp01(recency_decay(p.get("created_at"), 180.0))
                discount_score = clamp01(compute_discount_pct(p) / 70.0)

                final = clamp01((seed_score * 0.55) + (quality * 0.25) + (discount_score * 0.10) + (freshness * 0.10))
                pp = dict(p)
                pp["recommendation_score"] = round(final, 4)
                pp["recommendation_source"] = "cold_start_seeded_python"
                scored.append(pp)

            # Force same-category first
            scored.sort(key=lambda x: x.get("recommendation_score", 0.0), reverse=True)
            if seed_cat is not None:
                same = [p for p in scored if to_int_or_none(p.get("category_id")) == seed_cat]
                other = [p for p in scored if to_int_or_none(p.get("category_id")) != seed_cat]
                scored = same + other

            return scored[:limit], {"strategy": "cold_start_seeded", "userPersonalized": False, "usedSeedProduct": True}

        return rank_popular(products, limit), {"strategy": "cold_start_popular", "userPersonalized": False, "usedSeedProduct": False}

    # Personalized
    interaction_weight: Dict[int, float] = {}
    interacted_ids = set()
    search_token_pref: Dict[str, float] = {}

    def add_signal(pid: Any, w: float):
        try:
            product_id = int(pid)
        except Exception:
            return
        if product_id not in product_by_id:
            return
        if not math.isfinite(w) or w == 0:
            return
        interaction_weight[product_id] = interaction_weight.get(product_id, 0.0) + w
        interacted_ids.add(product_id)

    w = RECOMMENDER_CONFIG["interactionWeights"]
    hl = RECOMMENDER_CONFIG["recencyHalfLifeDays"]

    for row in orders:
        base = min(to_number(row.get("total_qty"), 0.0), 6.0) * w["order"]
        rec = recency_decay(row.get("last_at"), hl["order"])
        add_signal(row.get("product_id"), base * rec)

    for row in favourites:
        rec = recency_decay(row.get("created_at"), hl["favourite"])
        add_signal(row.get("product_id"), w["favourite"] * rec)

    for row in cart:
        base = min(to_number(row.get("quantity"), 0.0), 5.0) * w["cart"]
        rec = recency_decay(row.get("last_at"), hl["cart"])
        add_signal(row.get("product_id"), base * rec)

    for row in reviews:
        rating = to_number(row.get("rating"), 0.0)
        if rating >= 3:
            base = ((rating - 2.0) / 3.0) * w["reviewPositive"]
        else:
            base = ((rating - 3.0) / 2.0) * abs(w["reviewNegative"])
        rec = recency_decay(row.get("last_at"), hl["review"])
        add_signal(row.get("product_id"), base * rec)

    for row in requests:
        rec = recency_decay(row.get("last_at"), hl["request"])
        add_signal(row.get("product_id"), w["request"] * rec)

    for row in tracked:
        t = str(row.get("interaction_type") or "").lower()
        created_at = row.get("created_at")

        if t == "view" and row.get("product_id"):
            rec = recency_decay(created_at, hl["view"])
            add_signal(row.get("product_id"), w["view"] * rec)
            continue

        if t == "search":
            rec = recency_decay(created_at, hl["search"])
            if row.get("product_id"):
                add_signal(row.get("product_id"), w["search"] * rec)

            token_weight = w["search"] * rec
            for tok in tokenize(str(row.get("search_query") or "")):
                search_token_pref[tok] = search_token_pref.get(tok, 0.0) + token_weight

    if seed_product and seed_product.get("id") is not None:
        add_signal(seed_product.get("id"), w["seed"])

    # Preferences from interacted products
    category_pref: Dict[Any, float] = {}
    brand_pref: Dict[str, float] = {}
    token_pref: Dict[str, float] = {}
    weighted_price_sum = 0.0
    weight_total = 0.0

    for pid, weight in interaction_weight.items():
        if weight <= 0:
            continue
        p = product_by_id.get(pid)
        if not p:
            continue

        cat = p.get("category_id")
        if cat is not None:
            category_pref[cat] = category_pref.get(cat, 0.0) + weight

        brand = str(p.get("brand") or "").strip().lower()
        if brand:
            brand_pref[brand] = brand_pref.get(brand, 0.0) + weight

        for tok in get_product_tokens(p):
            token_pref[tok] = token_pref.get(tok, 0.0) + weight

        weighted_price_sum += to_number(p.get("current_price"), 0.0) * weight
        weight_total += weight

    # Search token preferences (even without clicking a product)
    for tok, weight in search_token_pref.items():
        token_pref[tok] = token_pref.get(tok, 0.0) + weight

    norm_cat = normalize_by_max(category_pref)
    norm_brand = normalize_by_max(brand_pref)

    token_items = sorted(token_pref.items(), key=lambda kv: kv[1], reverse=True)[: int(RECOMMENDER_CONFIG["maxTokenFeatures"])]
    top_tokens = dict(token_items)
    top_token_total = sum([v for _, v in token_items]) or 1.0

    avg_price = (weighted_price_sum / weight_total) if weight_total > 0 else None

    cw = RECOMMENDER_CONFIG["contentWeights"]
    blend = RECOMMENDER_CONFIG["blendWeights"]["contentOnly"]

    candidates: List[Dict[str, Any]] = []

    for p in products:
        pid = p.get("id")
        if pid is None:
            continue
        try:
            pid_int = int(pid)
        except Exception:
            continue

        if pid_int in interacted_ids:
            continue
        if seed_product and pid_int == int(seed_product.get("id")):
            continue

        category_score = norm_cat.get(p.get("category_id"), 0.0)
        brand_key = str(p.get("brand") or "").strip().lower()
        brand_score = norm_brand.get(brand_key, 0.0) if brand_key else 0.0

        ptokens = get_product_tokens(p)
        token_affinity_raw = sum([top_tokens.get(t, 0.0) for t in ptokens])
        token_score = clamp01(token_affinity_raw / top_token_total)

        price = to_number(p.get("current_price"), 0.0)
        price_score = 0.5
        if avg_price is not None:
            price_score = clamp01(1.0 - (abs(price - avg_price) / max(avg_price, 1.0)))

        quality_score = compute_quality_score(p, global_avg_rating=global_avg, max_sold=max_sold)
        freshness_score = clamp01(recency_decay(p.get("created_at"), 180.0))
        discount_score = clamp01(compute_discount_pct(p) / 70.0)

        seed_score = 0.0
        if seed_product:
            seed_score = compute_seed_score(seed_product, p)

        content_score = clamp01(
            (category_score * cw["category"])
            + (brand_score * cw["brand"])
            + (token_score * cw["token"])
            + (price_score * cw["price"])
            + (quality_score * cw["quality"])
            + (freshness_score * cw["freshness"])
            + (discount_score * cw["discount"])
            + (seed_score * 0.45)
        )

        final = (content_score * blend["content"]) + (quality_score * blend["qualityBoost"])

        pp = dict(p)
        pp["recommendation_score"] = round(float(final), 4)
        pp["recommendation_source"] = "personalized_python"
        candidates.append(pp)

    # Sort by score + tie breakers
    candidates.sort(
        key=lambda x: (
            float(x.get("recommendation_score", 0.0)),
            to_number(x.get("total_sold"), 0.0),
            to_number(x.get("id"), 0.0),
        ),
        reverse=True,
    )

    # Force same-category items first if we have a seed product category
    if seed_cat is not None:
        same = [p for p in candidates if to_int_or_none(p.get("category_id")) == seed_cat]
        other = [p for p in candidates if to_int_or_none(p.get("category_id")) != seed_cat]
        candidates = same + other

    if not candidates:
        remaining = [p for p in products if int(p.get("id")) not in interacted_ids]
        candidates = rank_popular(remaining, limit)

    return candidates[:limit], {
        "strategy": "personalized_content_python",
        "userPersonalized": True,
        "usedSeedProduct": bool(seed_product_id),
        "interactionsUsed": {
            "products": len(interacted_ids),
            "orders": len(orders),
            "favourites": len(favourites),
            "cart": len(cart),
            "reviews": len(reviews),
            "requests": len(requests),
            "tracked": len(tracked),
        },
    }


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/recommend")
def recommend():
    try:
        if not request.is_json:
            return jsonify({"success": False, "message": "JSON body required"}), 400

        payload = request.get_json(force=True) or {}
        recommendations, meta = build_recommendations(payload)
        return jsonify({"success": True, "data": {"recommendations": recommendations, "meta": meta}})
    except Exception as exc:
        logger.exception("Recommendation error")
        return jsonify({"success": False, "message": str(exc)}), 500


def main():
    # Railway (and many PaaS) provide the port via PORT.
    port = int(os.environ.get("REC_PORT") or os.environ.get("PORT") or "5003")
    logger.info("Starting recommender service on port %s", port)
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()
