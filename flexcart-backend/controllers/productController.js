const { pool } = require('../config/db');
const { getPythonRecommendations } = require('../middleware/recommenderClient');

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'for', 'with', 'this', 'that', 'from', 'your', 'our',
    'you', 'are', 'was', 'were', 'have', 'has', 'had', 'will', 'can', 'not', 'but', 'all',
    'any', 'new', 'best', 'top', 'its', 'his', 'her', 'their', 'they', 'them', 'into', 'out',
    'about', 'over', 'under', 'more', 'less', 'than', 'too', 'very', 'item', 'product', 'buy'
]);

const RECOMMENDER_CONFIG = {
    interactionWeights: {
        order: 7,
        favourite: 3,
        cart: 2,
        view: 2.2,
        search: 2.4,
        request: 2.8,
        reviewPositive: 4,
        reviewNegative: -1,
        seed: 6
    },
    recencyHalfLifeDays: {
        order: 180,
        favourite: 240,
        cart: 45,
        view: 21,
        search: 14,
        request: 120,
        review: 240
    },
    contentWeights: {
        category: 0.26,
        brand: 0.16,
        token: 0.17,
        price: 0.1,
        quality: 0.15,
        freshness: 0.08,
        discount: 0.08
    },
    seedWeights: {
        category: 0.45,
        brand: 0.25,
        token: 0.2,
        price: 0.1
    },
    blendWeights: {
        hybrid: { content: 0.58, collaborative: 0.32, qualityBoost: 0.1 },
        contentOnly: { content: 0.9, qualityBoost: 0.1 }
    },
    minCollaborativePurchases: 2,
    minNeighborOverlap: 2,
    maxTokenFeatures: 80,
    bayesianPriorCount: 6
};

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toIntOrNull = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const getAgeInDays = (inputDate) => {
    const ts = new Date(inputDate).getTime();
    if (!Number.isFinite(ts)) return 9999;
    return Math.max(0, (Date.now() - ts) / (1000 * 60 * 60 * 24));
};

const recencyDecay = (inputDate, halfLifeDays) => {
    const ageDays = getAgeInDays(inputDate);
    if (!Number.isFinite(ageDays)) return 0;
    return Math.pow(0.5, ageDays / Math.max(halfLifeDays, 1));
};

const getProductTokens = (product) => {
    const parts = [
        product.name,
        product.description,
        product.brand,
        product.model,
        product.color,
        product.category_name
    ];

    if (product.tags) {
        try {
            const parsedTags = typeof product.tags === 'string' ? JSON.parse(product.tags) : product.tags;
            if (Array.isArray(parsedTags)) {
                parts.push(parsedTags.join(' '));
            }
        } catch (_) {
        }
    }

    const tokens = (parts.join(' ').toLowerCase().match(/[a-z0-9]+/g) || [])
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

    return [...new Set(tokens)];
};

const normalizeScoreMap = (scoreMap) => {
    const values = [...scoreMap.values()];
    const max = values.length ? Math.max(...values) : 0;
    if (!max) return new Map();

    const normalized = new Map();
    for (const [key, value] of scoreMap.entries()) {
        normalized.set(key, value / max);
    }
    return normalized;
};

const normalizeMapByMax = (scoreMap) => {
    const values = [...scoreMap.values()];
    const max = values.length ? Math.max(...values) : 0;
    const min = values.length ? Math.min(...values) : 0;
    const spread = max - min;
    if (!values.length || spread === 0) {
        const neutral = new Map();
        for (const key of scoreMap.keys()) {
            neutral.set(key, 0);
        }
        return neutral;
    }

    const normalized = new Map();
    for (const [key, value] of scoreMap.entries()) {
        normalized.set(key, (value - min) / spread);
    }
    return normalized;
};

const rankPopularProducts = (products, limit) => {
    return products
        .map((product) => {
            const ratingScore = clamp01(toNumber(product.rating) / 5);
            const popularityScore = clamp01(Math.log1p(toNumber(product.total_sold)) / 8);
            const ageMs = Date.now() - new Date(product.created_at).getTime();
            const freshnessScore = Number.isFinite(ageMs)
                ? clamp01(1 - (ageMs / (1000 * 60 * 60 * 24 * 120)))
                : 0;
            const score = (ratingScore * 0.45) + (popularityScore * 0.45) + (freshnessScore * 0.1);

            return {
                ...product,
                recommendation_score: Number(score.toFixed(4)),
                recommendation_source: 'popular_fallback'
            };
        })
        .sort((a, b) => b.recommendation_score - a.recommendation_score)
        .slice(0, limit);
};

const toClientRecommendation = (scoredProduct) => {
    const { scoring_breakdown, ...rest } = scoredProduct;
    return rest;
};

const ALLOWED_INTERACTION_TYPES = new Set(['view', 'search']);
let userInteractionTableReady = false;

const tokenizeSearchQuery = (query) => {
    if (!query || typeof query !== 'string') return [];
    const tokens = query
        .toLowerCase()
        .match(/[a-z0-9]+/g) || [];

    return [...new Set(tokens.filter((token) => token.length > 1 && !STOP_WORDS.has(token)))];
};

const ensureUserInteractionTable = async () => {
    if (userInteractionTableReady) return;

    await pool.query(
        `CREATE TABLE IF NOT EXISTS user_product_interactions (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            interaction_type VARCHAR(20) NOT NULL CHECK (interaction_type IN ('view', 'search')),
            product_id INT DEFAULT NULL,
            search_query VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
        )`
    );

    // Create indexes separately (PostgreSQL does not support inline INDEX in CREATE TABLE)
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_upi_user_type_created ON user_product_interactions(user_id, interaction_type, created_at)`
    ).catch(() => {});
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_upi_user_created ON user_product_interactions(user_id, created_at)`
    ).catch(() => {});
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_upi_product ON user_product_interactions(product_id)`
    ).catch(() => {});

    userInteractionTableReady = true;
};

const trackUserInteraction = async ({ userId, interactionType, productId = null, searchQuery = null }) => {
    if (!userId || !ALLOWED_INTERACTION_TYPES.has(interactionType)) return;

    await ensureUserInteractionTable();

    await pool.query(
        `INSERT INTO user_product_interactions (user_id, interaction_type, product_id, search_query)
         VALUES (?, ?, ?, ?)`,
        [
            userId,
            interactionType,
            productId || null,
            typeof searchQuery === 'string' && searchQuery.trim()
                ? searchQuery.trim().slice(0, 255)
                : null
        ]
    );
};

// Get Products (home page)
const getProducts = async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const category = req.query.category;
        const sort = req.query.sort || 'newest';
        const search = req.query.search ? req.query.search.trim() : null;

        let query = `
            SELECT p.*, 
                   c.company_name, c.company_logo, c.badge as company_badge,
                   c.user_id as company_owner_id,
                   cat.name as category_name
            FROM products p
            JOIN companies c ON p.company_id = c.id
            LEFT JOIN categories cat ON p.category_id = cat.id
            WHERE p.status = 'active' AND c.status = 'active'
        `;
        const params = [];

        if (category) {
            query += ' AND p.category_id = ?';
            params.push(category);
        }

        const excludeId = parseInt(req.query.exclude) || null;
        if (excludeId) {
            query += ' AND p.id != ?';
            params.push(excludeId);
        }

        if (search) {
            query += ' AND (p.name LIKE ? OR p.brand LIKE ? OR c.company_name LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        switch (sort) {
            case 'price_low_high':
                query += ' ORDER BY p.current_price ASC';
                break;
            case 'price_high_low':
                query += ' ORDER BY p.current_price DESC';
                break;
            case 'most_sold':
                query += ' ORDER BY p.total_sold DESC';
                break;
            case 'most_rated':
                query += ' ORDER BY p.rating DESC';
                break;
            case 'discount':
                query += ' ORDER BY p.discount_percentage DESC';
                break;
            default:
                query += ' ORDER BY p.created_at DESC';
        }

        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [products] = await pool.query(query, params);

        if (userId && search && search.length >= 2) {
            try {
                await trackUserInteraction({
                    userId,
                    interactionType: 'search',
                    productId: products[0]?.id || null,
                    searchQuery: search
                });
            } catch (trackError) {
                console.warn('Track list-search interaction warning:', trackError.message || trackError);
            }
        }

        // Get total count
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM products p
            JOIN companies c ON p.company_id = c.id
            WHERE p.status = 'active' AND c.status = 'active'
        `;
        const countParams = [];

        if (category) {
            countQuery += ' AND p.category_id = ?';
            countParams.push(category);
        }

        if (search) {
            countQuery += ' AND (p.name LIKE ? OR p.brand LIKE ? OR c.company_name LIKE ?)';
            const term = `%${search}%`;
            countParams.push(term, term, term);
        }

        const [total] = await pool.query(countQuery, countParams);
        const totalCount = total[0].total;

        res.json({
            success: true,
            data: {
                products,
                pagination: {
                    page,
                    limit,
                    total: totalCount,
                    totalPages: Math.ceil(totalCount / limit),
                    hasMore: page < Math.ceil(totalCount / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};

// Get Product By ID (detailed view)
const getProductById = async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.user?.id;

        const [products] = await pool.query(
            `SELECT p.*, 
                    c.id as company_id, c.user_id as company_owner_id, c.company_name, c.company_logo, 
                    c.badge as company_badge, c.rating as company_rating,
                    c.follower_count, c.total_sales as company_total_sales,
                    cat.name as category_name, cat.id as category_id
             FROM products p
             JOIN companies c ON p.company_id = c.id
             LEFT JOIN categories cat ON p.category_id = cat.id
             WHERE p.id = ? AND p.status = 'active'`,
            [productId]
        );

        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const product = products[0];

        // --- Run all independent queries in parallel ---
        const [
            [images],
            [reviews],
            [comments],
            [[productCompanyRank]],
        ] = await Promise.all([
            pool.query(
                'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC',
                [productId]
            ),
            pool.query(
                `SELECT pr.*,
                        COALESCE(u.username, 'Deleted User') AS username,
                        u.profile_image,
                        (SELECT COUNT(DISTINCT o.id) FROM orders o
                         WHERE o.user_id = pr.user_id AND o.payment_status = 'paid') AS order_count
                 FROM product_reviews pr
                 LEFT JOIN users u ON pr.user_id = u.id
                 WHERE pr.product_id = ?
                 ORDER BY pr.created_at DESC
                 LIMIT 20`,
                [productId]
            ),
            pool.query(
                `SELECT pc.*, u.username, u.profile_image
                 FROM product_comments pc
                 JOIN users u ON pc.user_id = u.id
                 WHERE pc.product_id = ? AND pc.status = 'active' AND pc.parent_id IS NULL
                 ORDER BY pc.created_at DESC
                 LIMIT 20`,
                [productId]
            ),
            pool.query(
                `SELECT (SELECT COUNT(*)
                   FROM companies cx
                   WHERE cx.status = 'active'
                   AND (
                     COALESCE(cx.total_sales, 0) * 10 +
                     COALESCE((SELECT AVG(rx.rating) FROM product_reviews rx JOIN products px ON rx.product_id = px.id WHERE px.company_id = cx.id), 0) * 200 +
                     COALESCE(cx.follower_count, 0) * 5
                   ) > (
                     COALESCE(c.total_sales, 0) * 10 +
                     COALESCE((SELECT AVG(ry.rating) FROM product_reviews ry JOIN products py ON ry.product_id = py.id WHERE py.company_id = c.id), 0) * 200 +
                     COALESCE(c.follower_count, 0) * 5
                   )
                ) + 1 AS company_rank
                FROM companies c WHERE c.id = ?`,
                [product.company_id]
            ),
        ]);

        // Fetch all comment replies in ONE query (fix N+1)
        if (comments.length > 0) {
            const parentIds = comments.map(c => c.id);
            const placeholders = parentIds.map(() => '?').join(',');
            const [allReplies] = await pool.query(
                `SELECT pc.*, u.username, u.profile_image
                 FROM product_comments pc
                 JOIN users u ON pc.user_id = u.id
                 WHERE pc.parent_id IN (${placeholders}) AND pc.status = 'active'
                 ORDER BY pc.created_at ASC`,
                parentIds
            );
            const repliesMap = {};
            allReplies.forEach(reply => {
                if (!repliesMap[reply.parent_id]) repliesMap[reply.parent_id] = [];
                repliesMap[reply.parent_id].push(reply);
            });
            comments.forEach(c => { c.replies = repliesMap[c.id] || []; });
        }

        let isFavourite = false;
        let isFollowingCompany = false;
        let userPurchaseHistory = null;
        let isSeller = false;

        if (userId) {
            // Run all user-specific queries in parallel
            const [
                [favCheck],
                [followCheck],
                [purchaseHistory],
                [sellerCheck],
            ] = await Promise.all([
                pool.query(
                    'SELECT id FROM favourites WHERE user_id = ? AND product_id = ?',
                    [userId, productId]
                ),
                pool.query(
                    'SELECT id FROM company_followers WHERE user_id = ? AND company_id = ?',
                    [userId, product.company_id]
                ),
                pool.query(
                    `SELECT COUNT(DISTINCT o.id) as order_count,
                            COALESCE(SUM(oi.total_price), 0) as total_spent
                     FROM order_items oi
                     JOIN orders o ON oi.order_id = o.id
                     WHERE o.user_id = ? AND oi.company_id = ?
                     AND o.payment_status = 'paid'`,
                    [userId, product.company_id]
                ),
                pool.query(
                    'SELECT id FROM companies WHERE id = ? AND user_id = ?',
                    [product.company_id, userId]
                ),
            ]);

            isFavourite = favCheck.length > 0;
            isFollowingCompany = followCheck.length > 0;
            userPurchaseHistory = purchaseHistory[0];
            isSeller = sellerCheck.length > 0;

            try {
                await trackUserInteraction({
                    userId,
                    interactionType: 'view',
                    productId: Number(productId) || null
                });
            } catch (trackError) {
                console.warn('Track view interaction warning:', trackError.message || trackError);
            }
        }

        let displayPrice = product.current_price;
        if (product.max_price && product.discount_percentage > 0) {
            displayPrice = product.max_price - (product.max_price * product.discount_percentage / 100);
        }

        res.json({
            success: true,
            data: {
                ...product,
                company_rank: Number(productCompanyRank.company_rank),
                images,
                reviews,
                comments,
                isFavourite,
                isFollowingCompany,
                isSeller,
                displayPrice,
                userPurchaseHistory: isSeller ? null : userPurchaseHistory
            }
        });

    } catch (error) {
        console.error('Get product by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product'
        });
    }
};

// Compare Similar Products
const compareSimilarProducts = async (req, res) => {
    try {
        const productId = req.params.id;
        const limit = parseInt(req.query.limit) || 10;

        const [product] = await pool.query(
            'SELECT category_id, current_price, name, brand FROM products WHERE id = ?',
            [productId]
        );

        if (product.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const { category_id, current_price, brand } = product[0];

        // Find similar products by category and price range
        const [similar] = await pool.query(
            `SELECT p.*, 
                    c.company_name, c.company_logo, c.badge as company_badge,
                    c.user_id as company_owner_id,
                    cat.name as category_name
             FROM products p
             JOIN companies c ON p.company_id = c.id
             LEFT JOIN categories cat ON p.category_id = cat.id
             WHERE p.id != ? 
             AND p.status = 'active' 
             AND c.status = 'active'
             AND (p.category_id = ? OR p.brand = ?)
             ORDER BY 
                 CASE WHEN p.category_id = ? THEN 0 ELSE 1 END,
                 ABS(p.current_price - ?) ASC
             LIMIT ?`,
            [productId, category_id, brand, category_id, current_price, limit]
        );

        res.json({
            success: true,
            data: similar
        });

    } catch (error) {
        console.error('Compare similar products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to find similar products'
        });
    }
};

const buildHybridRecommendations = async ({ userId, limit, seedProductId, includeBreakdown = false }) => {
    const [allProducts] = await pool.query(
        `SELECT p.*,
                c.company_name, c.company_logo, c.badge as company_badge,
                c.user_id as company_owner_id,
                cat.name as category_name
         FROM products p
         JOIN companies c ON p.company_id = c.id
         LEFT JOIN categories cat ON p.category_id = cat.id
         WHERE p.status = 'active' AND c.status = 'active'`
    );

    if (!allProducts.length) {
        return {
            recommendations: [],
            meta: { strategy: 'empty_catalog', userPersonalized: Boolean(userId) }
        };
    }

    const normalizedLimit = Math.min(Math.max(limit || 12, 1), 60);
    const productById = new Map();
    for (const product of allProducts) {
        const pid = toIntOrNull(product?.id);
        if (pid !== null) productById.set(pid, product);
    }
    const globalAvgRating = allProducts.length
        ? allProducts.reduce((sum, product) => sum + clamp01(toNumber(product.rating) / 5), 0) / allProducts.length
        : 0.5;
    const maxSold = allProducts.reduce((max, product) => Math.max(max, toNumber(product.total_sold)), 0) || 1;

    if (!userId) {
        const seedId = toIntOrNull(seedProductId);
        const seedProduct = seedId !== null && productById.has(seedId)
            ? productById.get(seedId)
            : null;
        const seedCategoryId = toIntOrNull(seedProduct?.category_id);

        let recommendations;

        if (seedProduct) {
            const seedTokens = getProductTokens(seedProduct);

            const scored = allProducts
                .filter((product) => toIntOrNull(product.id) !== seedId)
                .map((product) => {
                    const productTokens = getProductTokens(product);
                    const tokenIntersection = productTokens.filter((token) => seedTokens.includes(token)).length;
                    const tokenUnion = new Set([...productTokens, ...seedTokens]).size || 1;
                    const seedTokenScore = clamp01(tokenIntersection / tokenUnion);
                    const seedCategoryScore = seedCategoryId !== null && seedCategoryId === toIntOrNull(product.category_id) ? 1 : 0;
                    const seedBrandScore = seedProduct.brand && product.brand && String(seedProduct.brand).toLowerCase() === String(product.brand).toLowerCase() ? 1 : 0;

                    const price = toNumber(product.current_price);
                    const seedPrice = toNumber(seedProduct.current_price);
                    const seedPriceScore = clamp01(1 - (Math.abs(seedPrice - price) / Math.max(seedPrice, 1)));

                    const seedScore = (
                        seedCategoryScore * RECOMMENDER_CONFIG.seedWeights.category +
                        seedBrandScore * RECOMMENDER_CONFIG.seedWeights.brand +
                        seedTokenScore * RECOMMENDER_CONFIG.seedWeights.token +
                        seedPriceScore * RECOMMENDER_CONFIG.seedWeights.price
                    );

                    const ratingNorm = clamp01(toNumber(product.rating) / 5);
                    const voteCount = Math.max(toNumber(product.total_ratings), 0);
                    const m = RECOMMENDER_CONFIG.bayesianPriorCount;
                    const bayesianRating = ((voteCount / (voteCount + m)) * ratingNorm) + ((m / (voteCount + m)) * globalAvgRating);
                    const popularityScore = clamp01(Math.log1p(toNumber(product.total_sold)) / Math.log1p(maxSold + 1));
                    const qualityScore = clamp01((bayesianRating * 0.7) + (popularityScore * 0.3));
                    const freshnessScore = clamp01(recencyDecay(product.created_at, 180));

                    const oldPrice = toNumber(product.old_price);
                    const discountPct = (() => {
                        const explicit = toNumber(product.discount_percentage);
                        if (explicit > 0) return explicit;
                        if (oldPrice > 0 && oldPrice > price) return ((oldPrice - price) / oldPrice) * 100;
                        return 0;
                    })();
                    const discountScore = clamp01(discountPct / 70);

                    const finalScore = clamp01(
                        (seedScore * 0.55) +
                        (qualityScore * 0.25) +
                        (discountScore * 0.1) +
                        (freshnessScore * 0.1)
                    );

                    const recommendation = {
                        ...product,
                        recommendation_score: Number(finalScore.toFixed(4)),
                        recommendation_source: 'seed_content_cold_start'
                    };

                    if (includeBreakdown) {
                        recommendation.scoring_breakdown = {
                            strategy: 'cold_start_seeded',
                            content: {
                                seedScore: Number(seedScore.toFixed(4)),
                                qualityScore: Number(qualityScore.toFixed(4)),
                                discountScore: Number(discountScore.toFixed(4)),
                                freshnessScore: Number(freshnessScore.toFixed(4))
                            },
                            collaborative: null,
                            final: Number(finalScore.toFixed(4))
                        };
                    }

                    return recommendation;
                })
                .sort((a, b) => b.recommendation_score - a.recommendation_score);

            let ordered = scored;
            if (seedCategoryId !== null) {
                const sameCategory = scored.filter((product) => toIntOrNull(product.category_id) === seedCategoryId);
                const otherCategories = scored.filter((product) => toIntOrNull(product.category_id) !== seedCategoryId);
                ordered = [...sameCategory, ...otherCategories];
            }

            recommendations = ordered.slice(0, normalizedLimit);
        } else {
            recommendations = rankPopularProducts(allProducts, normalizedLimit).map((product) => {
                if (!includeBreakdown) return product;
                return {
                    ...product,
                    scoring_breakdown: {
                        strategy: 'cold_start_popular',
                        content: null,
                        collaborative: null,
                        final: product.recommendation_score
                    }
                };
            });
        }

        return {
            recommendations,
            meta: {
                strategy: seedProduct ? 'cold_start_seeded' : 'cold_start_popular',
                userPersonalized: false,
                usedSeedProduct: Boolean(seedProductId)
            }
        };
    }

    const [orderedRows, favouriteRows, cartRows, reviewRows, requestRows, interactionRows] = await Promise.all([
        pool.query(
            `SELECT oi.product_id,
                    SUM(oi.quantity) AS total_qty,
                    MAX(o.created_at) AS last_at
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             WHERE o.user_id = ? AND o.payment_status = 'paid'
             GROUP BY oi.product_id`,
            [userId]
        ),
        pool.query('SELECT product_id, created_at FROM favourites WHERE user_id = ?', [userId]),
        pool.query('SELECT product_id, quantity, updated_at AS last_at FROM cart WHERE user_id = ?', [userId]),
        pool.query('SELECT product_id, rating, updated_at AS last_at FROM product_reviews WHERE user_id = ?', [userId]),
        pool.query('SELECT product_id, created_at AS last_at FROM product_requests WHERE user_id = ?', [userId]),
        (async () => {
            try {
                await ensureUserInteractionTable();
                return pool.query(
                    `SELECT interaction_type, product_id, search_query, created_at
                     FROM user_product_interactions
                     WHERE user_id = ?
                     ORDER BY created_at DESC
                     LIMIT 200`,
                    [userId]
                );
            } catch (_) {
                return [[]];
            }
        })()
    ]);

    const ordered = orderedRows[0];
    const favourites = favouriteRows[0];
    const cart = cartRows[0];
    const reviews = reviewRows[0];
    const requests = requestRows[0];
    const trackedInteractions = interactionRows[0];

    const interactionWeightByProduct = new Map();
    const interactionTraceByProduct = new Map();
    const searchTokenPref = new Map();

    const addInteractionSignal = (productId, signal, signalWeight) => {
        const pid = toIntOrNull(productId);
        if (pid === null) return;
        if (!productById.has(pid) || !Number.isFinite(signalWeight) || signalWeight === 0) return;

        interactionWeightByProduct.set(pid, (interactionWeightByProduct.get(pid) || 0) + signalWeight);

        if (!interactionTraceByProduct.has(pid)) {
            interactionTraceByProduct.set(pid, {
                order: 0,
                favourite: 0,
                cart: 0,
                review: 0,
                request: 0,
                view: 0,
                search: 0,
                seed: 0
            });
        }
        interactionTraceByProduct.get(pid)[signal] += signalWeight;
    };

    for (const row of ordered) {
        const base = Math.min(toNumber(row.total_qty), 6) * RECOMMENDER_CONFIG.interactionWeights.order;
        const recency = recencyDecay(row.last_at, RECOMMENDER_CONFIG.recencyHalfLifeDays.order);
        addInteractionSignal(row.product_id, 'order', base * recency);
    }

    for (const row of favourites) {
        const base = RECOMMENDER_CONFIG.interactionWeights.favourite;
        const recency = recencyDecay(row.created_at, RECOMMENDER_CONFIG.recencyHalfLifeDays.favourite);
        addInteractionSignal(row.product_id, 'favourite', base * recency);
    }

    for (const row of cart) {
        const base = Math.min(toNumber(row.quantity), 5) * RECOMMENDER_CONFIG.interactionWeights.cart;
        const recency = recencyDecay(row.last_at, RECOMMENDER_CONFIG.recencyHalfLifeDays.cart);
        addInteractionSignal(row.product_id, 'cart', base * recency);
    }

    for (const row of reviews) {
        const rating = toNumber(row.rating, 0);
        const base = rating >= 3
            ? ((rating - 2) / 3) * RECOMMENDER_CONFIG.interactionWeights.reviewPositive
            : ((rating - 3) / 2) * Math.abs(RECOMMENDER_CONFIG.interactionWeights.reviewNegative);
        const recency = recencyDecay(row.last_at, RECOMMENDER_CONFIG.recencyHalfLifeDays.review);
        addInteractionSignal(row.product_id, 'review', base * recency);
    }

    for (const row of requests) {
        const base = RECOMMENDER_CONFIG.interactionWeights.request;
        const recency = recencyDecay(row.last_at, RECOMMENDER_CONFIG.recencyHalfLifeDays.request);
        addInteractionSignal(row.product_id, 'request', base * recency);
    }

    for (const row of trackedInteractions) {
        const type = String(row.interaction_type || '').toLowerCase();
        if (!ALLOWED_INTERACTION_TYPES.has(type)) continue;

        if (type === 'view' && row.product_id) {
            const base = RECOMMENDER_CONFIG.interactionWeights.view;
            const recency = recencyDecay(row.created_at, RECOMMENDER_CONFIG.recencyHalfLifeDays.view);
            addInteractionSignal(row.product_id, 'view', base * recency);
            continue;
        }

        if (type === 'search') {
            const recency = recencyDecay(row.created_at, RECOMMENDER_CONFIG.recencyHalfLifeDays.search);

            if (row.product_id) {
                addInteractionSignal(row.product_id, 'search', RECOMMENDER_CONFIG.interactionWeights.search * recency);
            }

            const queryTokens = tokenizeSearchQuery(row.search_query);
            const tokenWeight = RECOMMENDER_CONFIG.interactionWeights.search * recency;
            for (const token of queryTokens) {
                searchTokenPref.set(token, (searchTokenPref.get(token) || 0) + tokenWeight);
            }
        }
    }

    const seedId = toIntOrNull(seedProductId);
    if (seedId !== null && productById.has(seedId)) {
        addInteractionSignal(seedId, 'seed', RECOMMENDER_CONFIG.interactionWeights.seed);
    }

    const interactedProductIds = new Set([...interactionWeightByProduct.keys()]);

    const categoryPref = new Map();
    const brandPref = new Map();
    const tokenPref = new Map();
    let weightedPriceSum = 0;
    let weightTotal = 0;

    for (const [productId, weight] of interactionWeightByProduct.entries()) {
        if (weight <= 0) continue;
        const product = productById.get(productId);
        if (!product) continue;

        if (product.category_id) {
            const catId = toIntOrNull(product.category_id);
            if (catId !== null) {
                categoryPref.set(catId, (categoryPref.get(catId) || 0) + weight);
            }
        }

        if (product.brand) {
            const brand = String(product.brand).trim().toLowerCase();
            if (brand) {
                brandPref.set(brand, (brandPref.get(brand) || 0) + weight);
            }
        }

        for (const token of getProductTokens(product)) {
            tokenPref.set(token, (tokenPref.get(token) || 0) + weight);
        }

        weightedPriceSum += toNumber(product.current_price) * weight;
        weightTotal += weight;
    }

    for (const [token, weight] of searchTokenPref.entries()) {
        tokenPref.set(token, (tokenPref.get(token) || 0) + weight);
    }

    const normalizedCategoryPref = normalizeScoreMap(categoryPref);
    const normalizedBrandPref = normalizeScoreMap(brandPref);

    const sortedTokenPref = [...tokenPref.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, RECOMMENDER_CONFIG.maxTokenFeatures);
    const topTokenMap = new Map(sortedTokenPref);
    const topTokenTotal = sortedTokenPref.reduce((sum, [, tokenWeight]) => sum + tokenWeight, 0) || 1;

    const averagePreferredPrice = weightTotal > 0 ? (weightedPriceSum / weightTotal) : null;

    const purchasedProductIds = [...new Set(ordered.map((row) => toIntOrNull(row.product_id)).filter((id) => id !== null))];
    const collaborativeRaw = new Map();
    let collaborativeReady = false;

    if (purchasedProductIds.length >= RECOMMENDER_CONFIG.minCollaborativePurchases) {
        const placeholders = purchasedProductIds.map(() => '?').join(',');
        const [overlapRows] = await pool.query(
            `SELECT o.user_id, COUNT(DISTINCT oi.product_id) AS overlap_count
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             WHERE o.payment_status = 'paid'
               AND o.user_id != ?
               AND oi.product_id IN (${placeholders})
             GROUP BY o.user_id
             HAVING overlap_count >= ?
             ORDER BY overlap_count DESC
             LIMIT 150`,
            [userId, ...purchasedProductIds, RECOMMENDER_CONFIG.minNeighborOverlap]
        );

        const similarUserIds = overlapRows.map((row) => row.user_id);
        if (similarUserIds.length > 0) {
            const similarPlaceholders = similarUserIds.map(() => '?').join(',');
            const [similarUserProductCountRows, similarUserProductRows] = await Promise.all([
                pool.query(
                    `SELECT o.user_id, COUNT(DISTINCT oi.product_id) AS total_products
                     FROM orders o
                     JOIN order_items oi ON oi.order_id = o.id
                     WHERE o.payment_status = 'paid' AND o.user_id IN (${similarPlaceholders})
                     GROUP BY o.user_id`,
                    similarUserIds
                ),
                pool.query(
                    `SELECT o.user_id,
                            oi.product_id,
                            SUM(oi.quantity) AS total_qty,
                            MAX(o.created_at) AS last_at
                     FROM orders o
                     JOIN order_items oi ON oi.order_id = o.id
                     WHERE o.payment_status = 'paid' AND o.user_id IN (${similarPlaceholders})
                     GROUP BY o.user_id, oi.product_id`,
                    similarUserIds
                )
            ]);

            const overlapByUser = new Map(overlapRows.map((row) => [row.user_id, toNumber(row.overlap_count)]));
            const totalProductsByUser = new Map(similarUserProductCountRows[0].map((row) => [row.user_id, toNumber(row.total_products, 1)]));
            const targetPurchaseCount = Math.max(purchasedProductIds.length, 1);

            for (const row of similarUserProductRows[0]) {
                if (interactedProductIds.has(row.product_id)) continue;
                if (!productById.has(row.product_id)) continue;

                const overlap = overlapByUser.get(row.user_id) || 0;
                const totalProducts = totalProductsByUser.get(row.user_id) || 1;
                const similarity = overlap / Math.sqrt(totalProducts * targetPurchaseCount);
                const confidence = clamp01(overlap / 5);
                if (similarity <= 0 || confidence <= 0) continue;

                const recency = recencyDecay(row.last_at, RECOMMENDER_CONFIG.recencyHalfLifeDays.order);
                const contribution = similarity * confidence * Math.log1p(toNumber(row.total_qty)) * recency;
                collaborativeRaw.set(row.product_id, (collaborativeRaw.get(row.product_id) || 0) + contribution);
            }

            collaborativeReady = collaborativeRaw.size > 0;
        }
    }

    const normalizedCollaborative = normalizeMapByMax(collaborativeRaw);

    const seedProduct = seedId !== null && productById.has(seedId)
        ? productById.get(seedId)
        : null;
    const seedCategoryId = toIntOrNull(seedProduct?.category_id);

    const scoredCandidates = allProducts
        .filter((product) => !interactedProductIds.has(toIntOrNull(product.id)))
        .filter((product) => seedId === null || toIntOrNull(product.id) !== seedId)
        .map((product) => {
            const categoryScore = normalizedCategoryPref.get(toIntOrNull(product.category_id)) || 0;
            const brandKey = product.brand ? String(product.brand).trim().toLowerCase() : null;
            const brandScore = brandKey ? (normalizedBrandPref.get(brandKey) || 0) : 0;

            const productTokens = getProductTokens(product);
            const tokenAffinityRaw = productTokens.reduce((sum, token) => sum + (topTokenMap.get(token) || 0), 0);
            const tokenScore = clamp01(tokenAffinityRaw / topTokenTotal);

            const price = toNumber(product.current_price);
            const priceScore = averagePreferredPrice
                ? clamp01(1 - (Math.abs(price - averagePreferredPrice) / Math.max(averagePreferredPrice, 1)))
                : 0.5;

            const ratingNorm = clamp01(toNumber(product.rating) / 5);
            const voteCount = Math.max(toNumber(product.total_ratings), 0);
            const m = RECOMMENDER_CONFIG.bayesianPriorCount;
            const bayesianRating = ((voteCount / (voteCount + m)) * ratingNorm) + ((m / (voteCount + m)) * globalAvgRating);
            const popularityScore = clamp01(Math.log1p(toNumber(product.total_sold)) / Math.log1p(maxSold + 1));
            const qualityScore = clamp01((bayesianRating * 0.7) + (popularityScore * 0.3));
            const freshnessScore = clamp01(recencyDecay(product.created_at, 180));

            const oldPrice = toNumber(product.old_price);
            const discountPct = (() => {
                const explicit = toNumber(product.discount_percentage);
                if (explicit > 0) return explicit;
                if (oldPrice > 0 && oldPrice > price) return ((oldPrice - price) / oldPrice) * 100;
                return 0;
            })();
            const discountScore = clamp01(discountPct / 70);

            let seedScore = 0;
            if (seedProduct) {
                const seedTokens = getProductTokens(seedProduct);
                const tokenIntersection = productTokens.filter((token) => seedTokens.includes(token)).length;
                const tokenUnion = new Set([...productTokens, ...seedTokens]).size || 1;
                const seedTokenScore = clamp01(tokenIntersection / tokenUnion);
                const seedCategoryScore = seedCategoryId !== null && seedCategoryId === toIntOrNull(product.category_id) ? 1 : 0;
                const seedBrandScore = seedProduct.brand && product.brand && String(seedProduct.brand).toLowerCase() === String(product.brand).toLowerCase() ? 1 : 0;
                const seedPriceScore = clamp01(1 - (Math.abs(toNumber(seedProduct.current_price) - price) / Math.max(toNumber(seedProduct.current_price), 1)));

                seedScore = (
                    seedCategoryScore * RECOMMENDER_CONFIG.seedWeights.category +
                    seedBrandScore * RECOMMENDER_CONFIG.seedWeights.brand +
                    seedTokenScore * RECOMMENDER_CONFIG.seedWeights.token +
                    seedPriceScore * RECOMMENDER_CONFIG.seedWeights.price
                );
            }

            const contentScore = clamp01(
                (categoryScore * RECOMMENDER_CONFIG.contentWeights.category) +
                (brandScore * RECOMMENDER_CONFIG.contentWeights.brand) +
                (tokenScore * RECOMMENDER_CONFIG.contentWeights.token) +
                (priceScore * RECOMMENDER_CONFIG.contentWeights.price) +
                (qualityScore * RECOMMENDER_CONFIG.contentWeights.quality) +
                (freshnessScore * RECOMMENDER_CONFIG.contentWeights.freshness) +
                (discountScore * RECOMMENDER_CONFIG.contentWeights.discount) +
                (seedScore * 0.45)
            );

            const collaborativeScore = normalizedCollaborative.get(product.id) || 0;
            const blend = collaborativeReady ? RECOMMENDER_CONFIG.blendWeights.hybrid : RECOMMENDER_CONFIG.blendWeights.contentOnly;
            const finalScore = collaborativeReady
                ? (contentScore * blend.content) + (collaborativeScore * blend.collaborative) + (qualityScore * blend.qualityBoost)
                : (contentScore * blend.content) + (qualityScore * blend.qualityBoost);

            const recommendation = {
                ...product,
                recommendation_score: Number(finalScore.toFixed(4)),
                recommendation_source: collaborativeReady ? 'hybrid' : 'content_fallback'
            };

            if (includeBreakdown) {
                recommendation.scoring_breakdown = {
                    content: {
                        categoryScore: Number(categoryScore.toFixed(4)),
                        brandScore: Number(brandScore.toFixed(4)),
                        tokenScore: Number(tokenScore.toFixed(4)),
                        priceScore: Number(priceScore.toFixed(4)),
                        qualityScore: Number(qualityScore.toFixed(4)),
                        freshnessScore: Number(freshnessScore.toFixed(4)),
                        discountScore: Number(discountScore.toFixed(4)),
                        seedScore: Number(seedScore.toFixed(4)),
                        weighted: Number(contentScore.toFixed(4))
                    },
                    collaborative: {
                        weighted: Number(collaborativeScore.toFixed(4)),
                        enabled: collaborativeReady
                    },
                    final: Number(finalScore.toFixed(4))
                };
            }

            return recommendation;
        })
        .sort((a, b) => {
            if (b.recommendation_score !== a.recommendation_score) {
                return b.recommendation_score - a.recommendation_score;
            }
            if (toNumber(b.total_sold) !== toNumber(a.total_sold)) {
                return toNumber(b.total_sold) - toNumber(a.total_sold);
            }
            return toNumber(b.id) - toNumber(a.id);
        });

    // If we have a concrete seed product with a category, force similar-category items to appear first.
    // This matches the expected UX: viewing/searching a Sunglass should mostly recommend Sunglass products.
    let candidates = scoredCandidates;
    if (seedCategoryId !== null) {
        const sameCategory = scoredCandidates.filter((product) => toIntOrNull(product.category_id) === seedCategoryId);
        const otherCategories = scoredCandidates.filter((product) => toIntOrNull(product.category_id) !== seedCategoryId);
        candidates = [...sameCategory, ...otherCategories];
    }

    candidates = candidates.slice(0, normalizedLimit);

    const finalRecommendations = candidates.length > 0
        ? candidates
        : rankPopularProducts(
            allProducts.filter((product) => !interactedProductIds.has(toIntOrNull(product.id))),
            normalizedLimit
        );

    return {
        recommendations: finalRecommendations,
        meta: {
            strategy: collaborativeReady ? 'hybrid' : (weightTotal > 0 ? 'content_fallback' : 'popular_fallback'),
            userPersonalized: true,
            usedSeedProduct: Boolean(seedProductId),
            interactionsUsed: {
                products: interactedProductIds.size,
                purchases: purchasedProductIds.length,
                favourites: favourites.length,
                cart: cart.length,
                reviews: reviews.length,
                requests: requests.length,
                trackedEvents: trackedInteractions.length
            },
            config: includeBreakdown ? RECOMMENDER_CONFIG : undefined
        },
        debug: includeBreakdown ? {
            interactionWeightByProduct: Object.fromEntries([...interactionWeightByProduct.entries()].map(([k, v]) => [k, Number(v.toFixed(4))])),
            interactionTraceByProduct: Object.fromEntries(
                [...interactionTraceByProduct.entries()].map(([k, signals]) => [
                    k,
                    Object.fromEntries(Object.entries(signals).map(([signal, value]) => [signal, Number(value.toFixed(4))]))
                ])
            )
        } : undefined
    };
};

const getHybridRecommendations = async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const limit = parseInt(req.query.limit, 10) || 12;
        const seedProductId = req.query.seed_product_id ? parseInt(req.query.seed_product_id, 10) : null;

        // Prefer Python recommender service when available.
        // If the service is down/unreachable, fall back to the in-process JS recommender.
        try {
            const [allProducts] = await pool.query(
                `SELECT p.*,
                        c.company_name, c.company_logo, c.badge as company_badge,
                        c.user_id as company_owner_id,
                        cat.name as category_name
                 FROM products p
                 JOIN companies c ON p.company_id = c.id
                 LEFT JOIN categories cat ON p.category_id = cat.id
                 WHERE p.status = 'active' AND c.status = 'active'`
            );

            let interactions = {
                orders: [],
                favourites: [],
                cart: [],
                reviews: [],
                requests: [],
                tracked: []
            };

            if (userId) {
                const [orderedRows, favouriteRows, cartRows, reviewRows, requestRows, interactionRows] = await Promise.all([
                    pool.query(
                        `SELECT oi.product_id,
                                SUM(oi.quantity) AS total_qty,
                                MAX(o.created_at) AS last_at
                         FROM orders o
                         JOIN order_items oi ON oi.order_id = o.id
                         WHERE o.user_id = ? AND o.payment_status = 'paid'
                         GROUP BY oi.product_id`,
                        [userId]
                    ),
                    pool.query('SELECT product_id, created_at FROM favourites WHERE user_id = ?', [userId]),
                    pool.query('SELECT product_id, quantity, updated_at AS last_at FROM cart WHERE user_id = ?', [userId]),
                    pool.query('SELECT product_id, rating, updated_at AS last_at FROM product_reviews WHERE user_id = ?', [userId]),
                    pool.query('SELECT product_id, created_at AS last_at FROM product_requests WHERE user_id = ?', [userId]),
                    (async () => {
                        try {
                            await ensureUserInteractionTable();
                            return pool.query(
                                `SELECT interaction_type, product_id, search_query, created_at
                                 FROM user_product_interactions
                                 WHERE user_id = ?
                                 ORDER BY created_at DESC
                                 LIMIT 200`,
                                [userId]
                            );
                        } catch (_) {
                            return [[]];
                        }
                    })()
                ]);

                interactions = {
                    orders: orderedRows[0] || [],
                    favourites: favouriteRows[0] || [],
                    cart: cartRows[0] || [],
                    reviews: reviewRows[0] || [],
                    requests: requestRows[0] || [],
                    tracked: interactionRows[0] || []
                };
            }

            const pythonResult = await getPythonRecommendations({
                user_id: userId,
                seed_product_id: seedProductId,
                limit,
                products: allProducts,
                interactions
            });

            if (pythonResult && Array.isArray(pythonResult.recommendations)) {
                return res.json({
                    success: true,
                    data: {
                        recommendations: pythonResult.recommendations.map(toClientRecommendation),
                        meta: {
                            ...(pythonResult.meta || {}),
                            engine: 'python'
                        }
                    }
                });
            }
        } catch (pythonError) {
            console.warn('Python recommender unavailable, falling back:', pythonError.message || pythonError);
        }

        const result = await buildHybridRecommendations({
            userId,
            limit,
            seedProductId,
            includeBreakdown: false
        });

        res.json({
            success: true,
            data: {
                recommendations: result.recommendations.map(toClientRecommendation),
                meta: { ...result.meta, engine: 'js' }
            }
        });
    } catch (error) {
        console.error('Get hybrid recommendations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recommendations'
        });
    }
};

const getHybridRecommendationsDebug = async (req, res) => {
    try {
        if (!req.user || Number(req.user.is_seller) !== 1) {
            return res.status(403).json({ success: false, message: 'Debug recommendations access denied' });
        }

        const configuredKey = process.env.RECOMMENDER_DEBUG_KEY;
        if (configuredKey) {
            const incomingKey = req.headers['x-debug-key'] || req.query.debug_key;
            if (!incomingKey || incomingKey !== configuredKey) {
                return res.status(403).json({ success: false, message: 'Invalid debug key' });
            }
        }

        const userId = req.query.user_id ? parseInt(req.query.user_id, 10) : req.user.id;
        const limit = parseInt(req.query.limit, 10) || 20;
        const seedProductId = req.query.seed_product_id ? parseInt(req.query.seed_product_id, 10) : null;

        if (configuredKey === undefined && userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Cross-user debug requires RECOMMENDER_DEBUG_KEY'
            });
        }

        const result = await buildHybridRecommendations({
            userId,
            limit,
            seedProductId,
            includeBreakdown: true
        });

        res.json({
            success: true,
            data: {
                recommendations: result.recommendations,
                meta: result.meta,
                debug: result.debug
            }
        });
    } catch (error) {
        console.error('Get hybrid recommendations debug error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch hybrid recommendation debug data'
        });
    }
};

// Get Comments for Product (nested: top-level + replies)
const getComments = async (req, res) => {
    try {
        const productId = req.params.id;
        // Only top-level comments
        const [comments] = await pool.query(
            `SELECT pc.*, u.username, u.profile_image
             FROM product_comments pc
             JOIN users u ON pc.user_id = u.id
             WHERE pc.product_id = ? AND pc.status = 'active' AND pc.parent_id IS NULL
             ORDER BY pc.created_at ASC`,
            [productId]
        );
        // Attach replies to each comment
        for (const comment of comments) {
            const [replies] = await pool.query(
                `SELECT pc.*, u.username, u.profile_image
                 FROM product_comments pc
                 JOIN users u ON pc.user_id = u.id
                 WHERE pc.parent_id = ? AND pc.status = 'active'
                 ORDER BY pc.created_at ASC`,
                [comment.id]
            );
            comment.replies = replies;
        }
        res.json({ success: true, data: comments });
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch comments' });
    }
};

// Get Reviews for Product
const getReviews = async (req, res) => {
    try {
        const productId = req.params.id;
        const [reviews] = await pool.query(
            `SELECT pr.*,
                    COALESCE(u.username, 'Deleted User') AS username,
                    u.profile_image,
                    (SELECT COUNT(DISTINCT o.id) FROM orders o
                     WHERE o.user_id = pr.user_id AND o.payment_status = 'paid') AS order_count
             FROM product_reviews pr
             LEFT JOIN users u ON pr.user_id = u.id
             WHERE pr.product_id = ?
             ORDER BY pr.created_at DESC`,
            [productId]
        );
        res.json({ success: true, data: reviews });
    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
    }
};

// Add Comment to Product
const addComment = async (req, res) => {
    try {
        const userId = req.user.id;
        const productId = req.params.id;
        const { comment_text, parent_id } = req.body;

        if (!comment_text) {
            return res.status(400).json({
                success: false,
                message: 'Comment text is required'
            });
        }

        const [product] = await pool.query(
            'SELECT company_id FROM products WHERE id = ?',
            [productId]
        );

        if (product.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const companyId = product[0].company_id;

        const [result] = await pool.query(
            `INSERT INTO product_comments 
             (user_id, product_id, company_id, parent_id, comment_text)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, productId, companyId, parent_id || null, comment_text]
        );

        // Create company notification
        const [user] = await pool.query(
            'SELECT username FROM users WHERE id = ?',
            [userId]
        );
        const [productInfo] = await pool.query(
            'SELECT name FROM products WHERE id = ?',
            [productId]
        );

        await pool.query(
            `INSERT INTO company_notifications 
             (company_id, type, title, message, reference_id, reference_type)
             VALUES (?, 'new_comment', 'New Comment', ?, ?, 'comment')`,
            [
                companyId,
                `${user[0].username} commented on "${productInfo[0].name}"`,
                result.insertId
            ]
        );

        const [newComment] = await pool.query(
            `SELECT pc.*, u.username, u.profile_image
             FROM product_comments pc
             JOIN users u ON pc.user_id = u.id
             WHERE pc.id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Comment added successfully',
            data: newComment[0]
        });

    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add comment'
        });
    }
};

// Add Product Review
const addReview = async (req, res) => {
    try {
        const userId = req.user.id;
        const productId = req.params.id;
        const { rating, review_text, order_id } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        // Check user has been authenticated (no star cost for product reviews)
        let isVerified = false;
        if (order_id) {
            const [orderCheck] = await pool.query(
                `SELECT oi.id FROM order_items oi
                 JOIN orders o ON oi.order_id = o.id
                 WHERE o.id = ? AND o.user_id = ? AND oi.product_id = ?
                 AND o.order_status = 'delivered'`,
                [order_id, userId, productId]
            );
            isVerified = orderCheck.length > 0;
        }

        const [existing] = await pool.query(
            'SELECT id FROM product_reviews WHERE user_id = ? AND product_id = ?',
            [userId, productId]
        );

        if (existing.length > 0) {
            await pool.query(
                `UPDATE product_reviews 
                 SET rating = ?, review_text = ?, is_verified_purchase = ?
                 WHERE user_id = ? AND product_id = ?`,
                [rating, review_text, isVerified ? 1 : 0, userId, productId]
            );
        } else {
            await pool.query(
                `INSERT INTO product_reviews 
                 (user_id, product_id, order_id, rating, review_text, is_verified_purchase)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, productId, order_id, rating, review_text, isVerified ? 1 : 0]
            );
        }

        const [avgRating] = await pool.query(
            'SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM product_reviews WHERE product_id = ?',
            [productId]
        );

        await pool.query(
            'UPDATE products SET rating = ?, total_ratings = ? WHERE id = ?',
            [avgRating[0].avg_rating || 0, avgRating[0].total, productId]
        );

        // Company rating is driven solely by company reviews (company_ratings table)
        // Product reviews do not affect the company's displayed rating

        res.json({
            success: true,
            message: 'Review submitted successfully'
        });

    } catch (error) {
        console.error('Add review error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add review'
        });
    }
};

// Search Products — with fuzzy/typo-tolerant multi-token matching
const searchProducts = async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const { q, category, min_price, max_price } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const whereParts = [`p.status = 'active'`, `c.status = 'active'`];
        const whereParams = [];
        let tokens = [];

        if (q) {
            // Normalize: collapse whitespace, strip punctuation, lowercase
            const normalized = q.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            tokens = normalized.split(' ').filter(t => t.length >= 2);

            if (tokens.length > 0) {
                const searchCols = ['p.name', 'p.description', 'p.brand', 'p.model', 'p.color', 'c.company_name'];

                // Each token must match somewhere (AND between tokens, OR across columns per token)
                // SOUNDEX() adds phonetic/typo tolerance for name and brand fields
                const tokenClauses = tokens.map(token => {
                    const orParts = [];
                    searchCols.forEach(col => {
                        orParts.push(`${col} LIKE ?`);
                        whereParams.push(`%${token}%`);
                    });
                    orParts.push(`SOUNDEX(p.name) = SOUNDEX(?)`);
                    whereParams.push(token);
                    orParts.push(`SOUNDEX(p.brand) = SOUNDEX(?)`);
                    whereParams.push(token);
                    return `(${orParts.join(' OR ')})`;
                });

                whereParts.push(`(${tokenClauses.join(' AND ')})`);
            }
        }

        if (category) { whereParts.push('p.category_id = ?'); whereParams.push(category); }
        if (min_price) { whereParts.push('p.current_price >= ?'); whereParams.push(parseFloat(min_price)); }
        if (max_price) { whereParts.push('p.current_price <= ?'); whereParams.push(parseFloat(max_price)); }

        const firstToken = tokens[0] || '';
        const hasQuery = tokens.length > 0;

        // Relevance: name match scores highest, then brand, then description
        const orderBy = hasQuery
            ? `CASE WHEN p.name LIKE ? THEN 10 WHEN p.brand LIKE ? THEN 8 WHEN p.description LIKE ? THEN 5 ELSE 3 END DESC, p.rating DESC, p.total_sold DESC`
            : `p.created_at DESC`;
        const orderParams = hasQuery
            ? [`%${firstToken}%`, `%${firstToken}%`, `%${firstToken}%`]
            : [];

        const sql = `
            SELECT p.*,
                   c.company_name, c.company_logo, c.badge as company_badge,
                   c.user_id as company_owner_id,
                   cat.name as category_name
            FROM products p
            JOIN companies c ON p.company_id = c.id
            LEFT JOIN categories cat ON p.category_id = cat.id
            WHERE ${whereParts.join(' AND ')}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `;

        const [products] = await pool.query(sql, [...whereParams, ...orderParams, limit, offset]);

        if (userId && q && String(q).trim().length >= 2) {
            try {
                await trackUserInteraction({
                    userId,
                    interactionType: 'search',
                    productId: products[0]?.id || null,
                    searchQuery: String(q).trim()
                });
            } catch (trackError) {
                console.warn('Track search interaction warning:', trackError.message || trackError);
            }
        }

        res.json({ success: true, data: { products } });

    } catch (error) {
        console.error('Search products error:', error);
        res.status(500).json({ success: false, message: 'Failed to search products' });
    }
};

// Get Categories
const getCategories = async (req, res) => {
    try {
        const [categories] = await pool.query(
            'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, name'
        );

        res.json({
            success: true,
            data: categories
        });

    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch categories'
        });
    }
};

// Seller reply to a review
const addSellerReply = async (req, res) => {
    try {
        const userId = req.user.id;
        const productId = req.params.id;
        const reviewId = req.params.reviewId;
        const { reply_text } = req.body;

        if (!reply_text || !reply_text.trim()) {
            return res.status(400).json({ success: false, message: 'Reply text is required' });
        }

        // Verify the requesting user owns the company that owns the product
        const [ownerCheck] = await pool.query(
            `SELECT c.user_id FROM products p JOIN companies c ON p.company_id = c.id WHERE p.id = ?`,
            [productId]
        );
        if (ownerCheck.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        if (ownerCheck[0].user_id !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized to reply to this review' });
        }

        // Verify the review belongs to this product
        const [reviewCheck] = await pool.query(
            'SELECT id FROM product_reviews WHERE id = ? AND product_id = ?',
            [reviewId, productId]
        );
        if (reviewCheck.length === 0) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        await pool.query(
            'UPDATE product_reviews SET seller_reply = ?, seller_reply_at = NOW() WHERE id = ?',
            [reply_text.trim(), reviewId]
        );

        res.json({ success: true, message: 'Reply posted successfully' });
    } catch (error) {
        console.error('Add seller reply error:', error);
        res.status(500).json({ success: false, message: 'Failed to post reply' });
    }
};

module.exports = {
    getProducts,
    getProductById,
    compareSimilarProducts,
    getHybridRecommendations,
    getHybridRecommendationsDebug,
    getComments,
    getReviews,
    addComment,
    addReview,
    addSellerReply,
    searchProducts,
    getCategories
};