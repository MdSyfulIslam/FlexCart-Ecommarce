const { pool } = require('../config/db');
const { normalizeFilePath } = require('../utils/fileUtils');
const { indexProductImage } = require('../middleware/aiProcessor');
const { appendTrackingEvent, TRACKING_STATUSES } = require('../services/orderTrackingModel');
const { formatOrderDeliveryStatus } = require('../services/deliveryStatusFormatter');
const { emitToBranch, emitToCompany, emitToUser } = require('../services/realtimeGateway');
const { isValidEmail, isValidPhone, isValidUrl, isValidNid, isValidPrice, isValidQuantity, isValidPercentage } = require('../utils/validators');

async function findNearestBranchForCompany(connection, companyCity, shippingCity) {
    const cityHint = String(companyCity || shippingCity || '').trim().toLowerCase();
    const likeHint = cityHint ? `%${cityHint}%` : '%';

    const [rows] = await connection.query(
        `SELECT id, name, address,
                CASE
                  WHEN LOWER(name) LIKE ? THEN 0
                  WHEN LOWER(address) LIKE ? THEN 1
                  ELSE 2
                END AS branch_score
         FROM branches
         WHERE is_active = 1
         ORDER BY branch_score ASC, id ASC
         LIMIT 1`,
        [likeHint, likeHint]
    );

    return rows[0] || null;
}

async function notifyDeliveryAdminsOfBranchAssignment(connection, branchId, order, company, companyOrderAmount) {
    const [admins] = await connection.query(
        `SELECT id
         FROM users
         WHERE role IN ('delivery_admin', 'super_admin')
           AND status = 'active'
           AND (assigned_branch_id = ? OR role = 'super_admin')`,
        [branchId]
    );

    const customerAddress = [
        order.shipping_address,
        order.shipping_city,
        order.shipping_country,
        order.shipping_zip
    ].filter(Boolean).join(', ');

    const message = `Company: ${company.company_name} | Order: #${order.order_number} | Product Amount: $${Number(companyOrderAmount).toFixed(2)} | Customer Address: ${customerAddress}`;

    for (const admin of admins) {
        await connection.query(
            `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
             VALUES (?, 'seller_branch_assignment', 'New Seller Branch Assignment', ?, ?, 'order')`,
            [
                admin.id,
                message,
                order.id
            ]
        );
    }

    return {
        adminIds: admins.map((admin) => admin.id),
        message,
        customerAddress
    };
}


// Create Company with NID Verification — saved as PENDING for staff admin review
const createCompany = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            company_name,
            description,
            contact_email,
            contact_phone,
            address,
            city,
            country,
            nid_number,
            website,
            category
        } = req.body;

        if (!company_name || !nid_number) {
            return res.status(400).json({
                success: false,
                message: 'Company name and NID number are required'
            });
        }

        if (!isValidNid(nid_number)) {
            return res.status(400).json({
                success: false,
                message: 'NID number must be exactly 10 or 17 digits'
            });
        }

        if (contact_email && contact_email.trim() && !isValidEmail(contact_email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid contact email address format'
            });
        }

        if (contact_phone && contact_phone.trim() && !isValidPhone(contact_phone)) {
            return res.status(400).json({
                success: false,
                message: 'Contact phone must be a valid Bangladesh number (e.g. 01712345678)'
            });
        }

        if (website && website.trim() && !isValidUrl(website)) {
            return res.status(400).json({
                success: false,
                message: 'Website must be a valid URL starting with http:// or https://'
            });
        }

        // ── One company per user ──────────────────────────────────────
        const [existing] = await pool.query(
            "SELECT id, verification_status FROM companies WHERE user_id = ? AND verification_status != 'rejected'",
            [userId]
        );
        if (existing.length > 0) {
            const vs = existing[0].verification_status;
            const msg = vs === 'approved'
                ? 'You already have an approved company'
                : 'You already have a pending company application';
            return res.status(409).json({ success: false, message: msg });
        }

        // ── Duplicate NID ─────────────────────────────────────────────
        const [nidUsed] = await pool.query(
            "SELECT id FROM companies WHERE nid_number = ? AND verification_status != 'rejected'",
            [nid_number]
        );
        if (nidUsed.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'This NID number is already associated with another company'
            });
        }

        // ── Duplicate company name ────────────────────────────────────
        const [nameUsed] = await pool.query(
            "SELECT id FROM companies WHERE company_name = ? AND verification_status != 'rejected'",
            [company_name.trim()]
        );
        if (nameUsed.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'A company with this name already exists'
            });
        }

        // ── Duplicate contact email ───────────────────────────────────
        if (contact_email && contact_email.trim()) {
            const [emailUsed] = await pool.query(
                "SELECT id FROM companies WHERE contact_email = ? AND verification_status != 'rejected'",
                [contact_email.trim()]
            );
            if (emailUsed.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'This contact email is already registered to another company'
                });
            }
        }

        // ── Duplicate phone ───────────────────────────────────────────
        if (contact_phone && contact_phone.trim()) {
            const [phoneUsed] = await pool.query(
                "SELECT id FROM companies WHERE contact_phone = ? AND verification_status != 'rejected'",
                [contact_phone.trim()]
            );
            if (phoneUsed.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'This phone number is already registered to another company'
                });
            }
        }

        // ── Duplicate website ─────────────────────────────────────────
        if (website && website.trim()) {
            const [websiteUsed] = await pool.query(
                "SELECT id FROM companies WHERE website = ? AND verification_status != 'rejected'",
                [website.trim()]
            );
            if (websiteUsed.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'This website URL is already registered to another company'
                });
            }
        }

        // Get file paths — normalise so Cloudinary URLs are kept as-is
        // and local disk paths are stored as /uploads/... relative URLs
        const nidFrontImage = req.files?.nid_front_image?.[0]
            ? normalizeFilePath(req.files.nid_front_image[0].path)
            : null;
        const nidBackImage = req.files?.nid_back_image?.[0]
            ? normalizeFilePath(req.files.nid_back_image[0].path)
            : null;
        const faceImage = req.files?.face_image?.[0]
            ? normalizeFilePath(req.files.face_image[0].path)
            : null;
        const companyLogo = req.files?.company_logo?.[0]
            ? normalizeFilePath(req.files.company_logo[0].path)
            : null;

        if (!nidFrontImage || !nidBackImage) {
            return res.status(400).json({
                success: false,
                message: 'Both NID front and back images are required'
            });
        }

        if (!faceImage) {
            return res.status(400).json({
                success: false,
                message: 'Face verification photo is required'
            });
        }

        // Create company as PENDING — awaiting staff admin approval
        const [result] = await pool.query(
            `INSERT INTO companies
            (user_id, company_name, company_logo, description, contact_email,
             contact_phone, address, city, country, nid_image, nid_front_image,
             nid_back_image, face_image, nid_number, website, category,
             is_verified, verification_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')`,
            [
                userId, company_name, companyLogo, description,
                contact_email, contact_phone, address, city, country,
                nidFrontImage, nidFrontImage, nidBackImage, faceImage,
                nid_number, website, category
            ]
        );

        const [newCompany] = await pool.query(
            'SELECT id, company_name, verification_status FROM companies WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Company application submitted! A staff admin will review your documents and approve your company.',
            data: newCompany[0],
            pending: true
        });

    } catch (error) {
        console.error('Create company error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit company application'
        });
    }
};

// Get ALL companies for current user (for company switcher)
const getMyCompanies = async (req, res) => {
    try {
        const userId = req.user.id;

        let companies;
        try {
            [companies] = await pool.query(
                `SELECT id, company_name, company_logo, cover_image, badge, category,
                        description, contact_email, contact_phone, address, city, country,
                        website, total_sales, total_revenue, rating, follower_count, status,
                        verification_status, rejection_reason, created_at
                 FROM companies
                 WHERE user_id = ? AND status NOT IN ('suspended', 'deleted')
                 ORDER BY created_at DESC`,
                [userId]
            );
        } catch (queryErr) {
            // Fallback: one or more optional columns may not exist on older databases.
            // Use only the columns that are guaranteed to be in the original schema,
            // returning safe NULL / default literals for anything added via migration.
            if (queryErr.code === 'ER_BAD_FIELD_ERROR') {
                [companies] = await pool.query(
                    `SELECT id, company_name, company_logo,
                            NULL        AS cover_image,
                            'bronze'    AS badge,
                            category, description, contact_email, contact_phone,
                            address, city, country, website,
                            total_sales,
                            0           AS total_revenue,
                            rating,
                            0           AS follower_count,
                            status, verification_status,
                            NULL        AS rejection_reason,
                            created_at
                     FROM companies
                     WHERE user_id = ? AND status NOT IN ('suspended', 'deleted')
                     ORDER BY created_at DESC`,
                    [userId]
                );
            } else {
                throw queryErr;
            }
        }

        res.json({
            success: true,
            data: companies
        });

    } catch (error) {
        console.error('Get my companies error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch companies'
        });
    }
};

// Get single company dashboard
const getMyCompany = async (req, res) => {
    try {
        const userId = req.user.id;

        const [companies] = await pool.query(
            'SELECT * FROM companies WHERE user_id = ? AND status = ?',
            [userId, 'active']
        );

        if (companies.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No company found'
            });
        }

        res.json({
            success: true,
            data: companies[0]
        });

    } catch (error) {
        console.error('Get my company error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch company'
        });
    }
};

// Get Company By ID (public)
const getCompanyById = async (req, res) => {
    try {
        const companyId = req.params.id;
        const userId = req.user?.id;

        const [companies] = await pool.query(
            `SELECT c.*, u.username as owner_name 
             FROM companies c 
             JOIN users u ON c.user_id = u.id 
             WHERE c.id = ? AND c.status = 'active'`,
            [companyId]
        );

        if (companies.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        const company = companies[0];

        // Compute company rating & rank based on company reviews (company_ratings), not product reviews.
        const [[rankRow]] = await pool.query(
            `SELECT (
                SELECT COUNT(*)
                FROM companies cx
                LEFT JOIN (
                    SELECT company_id, AVG(rating) AS avg_rating
                    FROM company_ratings
                    GROUP BY company_id
                ) crx ON crx.company_id = cx.id
                WHERE cx.status = 'active'
                AND (
                    COALESCE(cx.total_sales, 0) * 10 +
                    COALESCE(crx.avg_rating, 0) * 200 +
                    COALESCE(cx.follower_count, 0) * 5
                ) > (
                    COALESCE(c.total_sales, 0) * 10 +
                    COALESCE(cr.avg_rating, 0) * 200 +
                    COALESCE(c.follower_count, 0) * 5
                )
            ) + 1 AS company_rank,
            COALESCE(cr.avg_rating, 0) AS rating,
            COALESCE(cr.total_ratings, 0) AS total_ratings
            FROM companies c
            LEFT JOIN (
                SELECT company_id, AVG(rating) AS avg_rating, COUNT(*) AS total_ratings
                FROM company_ratings
                GROUP BY company_id
            ) cr ON cr.company_id = c.id
            WHERE c.id = ?`,
            [companyId]
        );

        let isFollowing = false;
        let notificationsEnabled = false;
        if (userId) {
            const [followCheck] = await pool.query(
                'SELECT id, notifications_enabled FROM company_followers WHERE user_id = ? AND company_id = ?',
                [userId, companyId]
            );
            isFollowing = followCheck.length > 0;
            notificationsEnabled = isFollowing ? followCheck[0].notifications_enabled === 1 : false;
        }

        // Get product categories for this company (folders)
        const [categories] = await pool.query(
            `SELECT DISTINCT cat.id, cat.name, cat.icon,
                    COUNT(p.id) as product_count
             FROM products p
             JOIN categories cat ON p.category_id = cat.id
             WHERE p.company_id = ? AND p.status = 'active'
             GROUP BY cat.id, cat.name, cat.icon
             ORDER BY cat.name`,
            [companyId]
        );

        const [productCount] = await pool.query(
            'SELECT COUNT(*) as total FROM products WHERE company_id = ? AND status = ?',
            [companyId, 'active']
        );

        // Company reviews only — from company_ratings table (not product_reviews)
        const [reviews] = await pool.query(
            `SELECT cr.id, cr.rating, cr.review_text, cr.created_at,
                    u.username, u.profile_image
             FROM company_ratings cr
             JOIN users u ON cr.user_id = u.id
             WHERE cr.company_id = ?
             ORDER BY cr.created_at DESC
             LIMIT 20`,
            [companyId]
        );

        const [reviewCountResult] = await pool.query(
            `SELECT COUNT(*) as reviewCount FROM company_ratings WHERE company_id = ?`,
            [companyId]
        );

        res.json({
            success: true,
            data: {
                ...company,
                company_rank: Number(rankRow.company_rank),
                // Override with computed values to avoid stale companies.rating/total_ratings
                rating: Number(rankRow.rating || 0),
                total_ratings: Number(rankRow.total_ratings || 0),
                isFollowing,
                notificationsEnabled,
                categories,
                totalProducts: Number(productCount[0].total),
                reviews,
                reviewCount: Number(reviewCountResult[0].reviewCount)
            }
        });

    } catch (error) {
        console.error('Get company by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch company'
        });
    }
};

// Get products by category for a company
const getCompanyProductsByCategory = async (req, res) => {
    try {
        const { companyId, categoryId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;

        const [products] = await pool.query(
            `SELECT p.*, cat.name as category_name
             FROM products p
             LEFT JOIN categories cat ON p.category_id = cat.id
             WHERE p.company_id = ? AND p.category_id = ? AND p.status = 'active'
             ORDER BY p.created_at DESC
             LIMIT ? OFFSET ?`,
            [companyId, categoryId, limit, offset]
        );

        const [total] = await pool.query(
            'SELECT COUNT(*) as total FROM products WHERE company_id = ? AND category_id = ? AND status = ?',
            [companyId, categoryId, 'active']
        );

        res.json({
            success: true,
            data: {
                products,
                pagination: {
                    page,
                    limit,
                    total: total[0].total,
                    totalPages: Math.ceil(total[0].total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get company products by category error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};

// Toggle Follow Company
const toggleFollow = async (req, res) => {
    try {
        const userId = req.user.id;
        const { company_id } = req.body;

        if (!company_id) {
            return res.status(400).json({
                success: false,
                message: 'Company ID is required'
            });
        }

        const [existing] = await pool.query(
            'SELECT id FROM company_followers WHERE user_id = ? AND company_id = ?',
            [userId, company_id]
        );

        if (existing.length > 0) {
            await pool.query(
                'DELETE FROM company_followers WHERE user_id = ? AND company_id = ?',
                [userId, company_id]
            );
            await pool.query(
                'UPDATE companies SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = ?',
                [company_id]
            );
            res.json({
                success: true,
                message: 'Unfollowed company',
                data: { isFollowing: false, notificationsEnabled: false }
            });
        } else {
            await pool.query(
                'INSERT INTO company_followers (user_id, company_id, notifications_enabled) VALUES (?, ?, 1)',
                [userId, company_id]
            );
            await pool.query(
                'UPDATE companies SET follower_count = follower_count + 1 WHERE id = ?',
                [company_id]
            );

            const [user] = await pool.query(
                'SELECT username FROM users WHERE id = ?',
                [userId]
            );
            await pool.query(
                `INSERT INTO company_notifications 
                 (company_id, type, title, message, reference_id, reference_type)
                 VALUES (?, 'new_follower', 'New Follower', ?, ?, 'user')`,
                [company_id, `${user[0].username} started following your company`, userId]
            );

            res.json({
                success: true,
                message: 'Following company',
                data: { isFollowing: true, notificationsEnabled: true }
            });
        }

    } catch (error) {
        console.error('Toggle follow error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle follow'
        });
    }
};

// Get Following Companies
const getFollowingCompanies = async (req, res) => {
    try {
        const userId = req.user.id;

        const [companies] = await pool.query(
            `SELECT c.id, c.company_name, c.company_logo, c.badge, 
                    c.category, c.rating, c.follower_count,
                    cf.created_at as followed_at, cf.notifications_enabled
             FROM company_followers cf
             JOIN companies c ON cf.company_id = c.id
             WHERE cf.user_id = ? AND c.status = 'active'
             ORDER BY cf.created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            data: companies
        });

    } catch (error) {
        console.error('Get following companies error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch following companies'
        });
    }
};

// Update Company
const updateCompany = async (req, res) => {
    try {
        const userId = req.user.id;
        const companyId = req.body.company_id || req.params.id;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: 'Company ID is required'
            });
        }

        const [ownership] = await pool.query(
            'SELECT id FROM companies WHERE id = ? AND user_id = ?',
            [companyId, userId]
        );

        if (ownership.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this company'
            });
        }

        const {
            company_name, description, contact_email,
            contact_phone, address, city, country,
            website, category
        } = req.body;

        const companyLogo = req.files?.company_logo?.[0]
            ? normalizeFilePath(req.files.company_logo[0].path)
            : undefined;

        const coverImage = req.files?.cover_image?.[0]
            ? normalizeFilePath(req.files.cover_image[0].path)
            : undefined;

        const promoBanner = req.files?.promo_banner?.[0]
            ? normalizeFilePath(req.files.promo_banner[0].path)
            : undefined;

        let query = `UPDATE companies SET 
            company_name = COALESCE(?, company_name),
            description = COALESCE(?, description),
            contact_email = COALESCE(?, contact_email),
            contact_phone = COALESCE(?, contact_phone),
            address = COALESCE(?, address),
            city = COALESCE(?, city),
            country = COALESCE(?, country),
            website = COALESCE(?, website),
            category = COALESCE(?, category)`;

        const params = [
            company_name, description, contact_email,
            contact_phone, address, city, country,
            website, category
        ];

        if (companyLogo) {
            query += ', company_logo = ?';
            params.push(companyLogo);
        }

        if (coverImage) {
            query += ', cover_image = ?';
            params.push(coverImage);
        }

        if (promoBanner) {
            query += ', promo_banner = ?';
            params.push(promoBanner);
        }

        query += ' WHERE id = ? AND user_id = ?';
        params.push(companyId, userId);

        await pool.query(query, params);

        const [updated] = await pool.query(
            'SELECT * FROM companies WHERE id = ?',
            [companyId]
        );

        res.json({
            success: true,
            message: 'Company updated successfully',
            data: updated[0]
        });

    } catch (error) {
        console.error('Update company error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update company'
        });
    }
};

// Delete Promotional Banner
const deletePromoBanner = async (req, res) => {
    try {
        const userId = req.user.id;
        const { company_id } = req.body;

        if (!company_id) {
            return res.status(400).json({ success: false, message: 'Company ID is required' });
        }

        const [ownership] = await pool.query(
            'SELECT id FROM companies WHERE id = ? AND user_id = ?',
            [company_id, userId]
        );

        if (ownership.length === 0) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        await pool.query(
            'UPDATE companies SET promo_banner = NULL WHERE id = ? AND user_id = ?',
            [company_id, userId]
        );

        res.json({ success: true, message: 'Promotional banner removed' });
    } catch (error) {
        console.error('Delete promo banner error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove promotional banner' });
    }
};

// Rate Company (with star spending)
const rateCompany = async (req, res) => {
    try {
        const userId = req.user.id;
        const { company_id, rating, review_text } = req.body;

        if (!company_id || !rating) {
            return res.status(400).json({
                success: false,
                message: 'Company ID and rating are required'
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        const [user] = await pool.query(
            'SELECT stars FROM users WHERE id = ?',
            [userId]
        );

        const starsToSpend = parseFloat(rating);
        const availableStars = parseFloat(user[0].stars);

        if (availableStars < starsToSpend) {
            return res.status(400).json({
                success: false,
                message: `Not enough stars. You have ${availableStars} stars, need ${starsToSpend}`
            });
        }

        const [existing] = await pool.query(
            'SELECT id FROM company_ratings WHERE user_id = ? AND company_id = ?',
            [userId, company_id]
        );

        if (existing.length > 0) {
            await pool.query(
                `UPDATE company_ratings 
                 SET rating = ?, review_text = ?, stars_spent = COALESCE(stars_spent, 0) + ?
                 WHERE user_id = ? AND company_id = ?`,
                [rating, review_text, starsToSpend, userId, company_id]
            );
        } else {
            await pool.query(
                `INSERT INTO company_ratings 
                 (user_id, company_id, rating, review_text, stars_spent)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, company_id, rating, review_text, starsToSpend]
            );
        }

        await pool.query(
            'UPDATE users SET stars = GREATEST(stars - ?, 0), spent_stars = spent_stars + ? WHERE id = ?',
            [starsToSpend, starsToSpend, userId]
        );

        const [avgRating] = await pool.query(
            'SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM company_ratings WHERE company_id = ?',
            [company_id]
        );

        await pool.query(
            'UPDATE companies SET rating = ?, total_ratings = ? WHERE id = ?',
            [avgRating[0].avg_rating || 0, avgRating[0].total, company_id]
        );

        // Recompute badge after company rating changes
        const [companyBadgeData] = await pool.query(
            'SELECT total_sales, rating, follower_count FROM companies WHERE id = ?',
            [company_id]
        );
        if (companyBadgeData.length > 0) {
            const d = companyBadgeData[0];
            const score = (d.total_sales * 10) + (parseFloat(d.rating) * 200) + (d.follower_count * 5);
            const newBadge = score >= 5000 ? 'diamond' : score >= 3000 ? 'crown' : score >= 1500 ? 'gold' : score >= 500 ? 'silver' : 'bronze';
            await pool.query('UPDATE companies SET badge = ? WHERE id = ?', [newBadge, company_id]);
        }

        res.json({
            success: true,
            message: 'Review submitted successfully'
        });

    } catch (error) {
        console.error('Rate company error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to rate company'
        });
    }
};

// Get Company Dashboard Data
const getCompanyDashboard = async (req, res) => {
    try {
        const userId = req.user.id;
        const companyId = req.params.id;

        const [company] = await pool.query(
            'SELECT * FROM companies WHERE id = ? AND user_id = ?',
            [companyId, userId]
        );

        if (company.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        if (company[0].verification_status !== 'approved') {
            return res.status(403).json({
                success: false,
                message: company[0].verification_status === 'pending'
                    ? 'Your company application is still under review'
                    : 'Your company application was rejected'
            });
        }

        // Get products grouped by category (with pending request count)
        // Fallback: skip product_requests join if table doesn't exist yet
        let products = [];
        try {
            [products] = await pool.query(
                `SELECT p.*, cat.name as category_name, cat.icon as category_icon,
                        COALESCE(req.request_count, 0) as request_count
                 FROM products p
                 LEFT JOIN categories cat ON p.category_id = cat.id
                 LEFT JOIN (
                   SELECT product_id, COUNT(*) as request_count
                   FROM product_requests
                   GROUP BY product_id
                 ) req ON p.id = req.product_id
                 WHERE p.company_id = ? AND p.status != 'deleted'
                 ORDER BY p.created_at DESC`,
                [companyId]
            );
        } catch (_e) {
            try {
                [products] = await pool.query(
                    `SELECT p.*, cat.name as category_name, cat.icon as category_icon, 0 as request_count
                     FROM products p
                     LEFT JOIN categories cat ON p.category_id = cat.id
                     WHERE p.company_id = ? AND p.status != 'deleted'
                     ORDER BY p.created_at DESC`,
                    [companyId]
                );
            } catch (_e2) { products = []; }
        }

        // Group products by category
        const productsByCategory = {};
        products.forEach(product => {
            const catName = product.category_name || 'Uncategorized';
            if (!productsByCategory[catName]) {
                productsByCategory[catName] = {
                    category_id: product.category_id,
                    category_name: catName,
                    category_icon: product.category_icon,
                    products: []
                };
            }
            productsByCategory[catName].products.push(product);
        });

        // Get notifications (table may not exist in all deployments)
        let unreadNotifs = [{ count: 0 }];
        let notifications = [];
        try {
            [unreadNotifs] = await pool.query(
                'SELECT COUNT(*) as count FROM company_notifications WHERE company_id = ? AND is_read = 0',
                [companyId]
            );
            [notifications] = await pool.query(
                `SELECT * FROM company_notifications
                 WHERE company_id = ?
                 ORDER BY created_at DESC
                 LIMIT 20`,
                [companyId]
            );
        } catch (_e) { /* company_notifications table may not exist yet */ }

        // Get recent orders (branches/deliveries tables may not exist yet)
        let recentOrders = [];
        try {
            [recentOrders] = await pool.query(
                `SELECT oi.*, o.order_number, o.order_status, o.current_status, o.branch_accepted_at, o.created_at as order_date,
                    o.shipping_address, o.shipping_city, o.shipping_country, o.shipping_zip,
                    ab.name as assigned_branch_name,
                    pb.name as previous_branch_name,
                    d.status as delivery_status, d.delivery_boy_name, d.delivery_boy_phone, d.rejection_reason,
                    fb.name as from_branch_name, tb.name as to_branch_name,
                    u.username as customer_name, p.name as product_name
                 FROM order_items oi
                 JOIN orders o ON oi.order_id = o.id
                 JOIN users u ON o.user_id = u.id
                 JOIN products p ON oi.product_id = p.id
                 LEFT JOIN branches ab ON ab.id = o.assigned_branch_id
                 LEFT JOIN branches pb ON pb.id = o.previous_branch_id
                 LEFT JOIN deliveries d ON d.order_id = o.id
                 LEFT JOIN branches fb ON fb.id = d.from_branch_id
                 LEFT JOIN branches tb ON tb.id = d.to_branch_id
                 WHERE oi.company_id = ?
                 ORDER BY o.created_at DESC
                 LIMIT 10`,
                [companyId]
            );
        } catch (_e) {
            try {
                // Fallback: no branches/deliveries columns
                [recentOrders] = await pool.query(
                    `SELECT oi.*, o.order_number, o.order_status, o.created_at as order_date,
                        o.shipping_address, u.username as customer_name, p.name as product_name
                     FROM order_items oi
                     JOIN orders o ON oi.order_id = o.id
                     JOIN users u ON o.user_id = u.id
                     JOIN products p ON oi.product_id = p.id
                     WHERE oi.company_id = ?
                     ORDER BY o.created_at DESC
                     LIMIT 10`,
                    [companyId]
                );
            } catch (_e2) { recentOrders = []; }
        }

        const recentOrdersWithStatus = recentOrders.map(order => {
            const delivery = order.delivery_status
                ? {
                    status: order.delivery_status,
                    delivery_boy_name: order.delivery_boy_name,
                    delivery_boy_phone: order.delivery_boy_phone,
                    rejection_reason: order.rejection_reason,
                    from_branch_name: order.from_branch_name,
                    to_branch_name: order.to_branch_name
                }
                : null;
            return {
                ...order,
                delivery_status_text: formatOrderDeliveryStatus(order, delivery, 'seller')
            };
        });

        // Get categories for product creation
        let categories = [];
        try {
            [categories] = await pool.query(
                'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, name'
            );
        } catch (_e) {
            try {
                [categories] = await pool.query('SELECT * FROM categories ORDER BY name');
            } catch (_e2) { categories = []; }
        }

        // Compute leaderboard rank (product_reviews may not exist yet)
        let companyRank = 1;
        try {
            const [[rankRow]] = await pool.query(
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
                [companyId]
            );
            if (rankRow) companyRank = Number(rankRow.company_rank);
        } catch (_e) { /* product_reviews table may not exist yet */ }

        res.json({
            success: true,
            data: {
                company: { ...company[0], company_rank: companyRank },
                productsByCategory: Object.values(productsByCategory),
                totalProducts: products.length,
                unreadNotifications: unreadNotifs[0]?.count ?? 0,
                notifications,
                recentOrders: recentOrdersWithStatus,
                categories
            }
        });

    } catch (error) {
        console.error('Get company dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard'
        });
    }
};

// Get Company Notifications
const getCompanyNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const companyId = req.params.id;

        const [ownership] = await pool.query(
            'SELECT id FROM companies WHERE id = ? AND user_id = ?',
            [companyId, userId]
        );

        if (ownership.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        const [notifications] = await pool.query(
            `SELECT * FROM company_notifications 
             WHERE company_id = ? 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [companyId]
        );

        res.json({
            success: true,
            data: notifications
        });

    } catch (error) {
        console.error('Get company notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notifications'
        });
    }
};

// Mark company notification as read
const markCompanyNotificationRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const { companyId, notificationId } = req.params;

        const [ownership] = await pool.query(
            'SELECT id FROM companies WHERE id = ? AND user_id = ?',
            [companyId, userId]
        );

        if (ownership.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        await pool.query(
            'UPDATE company_notifications SET is_read = 1 WHERE id = ? AND company_id = ?',
            [notificationId, companyId]
        );

        res.json({ success: true });

    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark notification'
        });
    }
};

const listAssignableBranchesForOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const companyId = Number(req.params.id);
        const orderNumber = String(req.params.orderNumber || '').trim();

        if (!companyId || !orderNumber) {
            return res.status(400).json({ success: false, message: 'companyId and orderNumber are required' });
        }

        const [ownership] = await pool.query(
            `SELECT id
             FROM companies
             WHERE id = ? AND user_id = ? AND status = 'active' AND verification_status = 'approved'
             LIMIT 1`,
            [companyId, userId]
        );

        if (ownership.length === 0) {
            return res.status(403).json({ success: false, message: 'Not authorized for this company' });
        }

        const [orderRows] = await pool.query(
            `SELECT o.id, o.order_number
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             WHERE o.order_number = ? AND oi.company_id = ?
             LIMIT 1`,
            [orderNumber, companyId]
        );

        if (orderRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found for this company' });
        }

        const [branches] = await pool.query(
            `SELECT b.id, b.name, b.address,
                    COALESCE(cbp.usage_count, 0) AS usage_count,
                    cbp.last_assigned_at
             FROM branches b
             LEFT JOIN company_branch_preferences cbp
               ON cbp.branch_id = b.id
              AND cbp.company_id = ?
             WHERE b.is_active = 1
             ORDER BY usage_count DESC, cbp.last_assigned_at DESC, b.name ASC`,
            [companyId]
        );

        res.json({ success: true, data: branches });
    } catch (error) {
        console.error('List assignable branches error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch branches' });
    }
};

// Seller assigns order product(s) to selected branch (manual + prioritized)
const assignOrderToBranch = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const userId = req.user.id;
        const companyId = Number(req.params.id);
        const orderNumber = String(req.params.orderNumber || '').trim();
        const branchId = Number(req.body?.branchId);

        if (!companyId || !orderNumber || !Number.isInteger(branchId) || branchId <= 0) {
            return res.status(400).json({ success: false, message: 'companyId, orderNumber and branchId are required' });
        }

        const [ownership] = await connection.query(
            `SELECT id, company_name, city
             FROM companies
             WHERE id = ? AND user_id = ? AND status = 'active' AND verification_status = 'approved'
             LIMIT 1`,
            [companyId, userId]
        );

        if (ownership.length === 0) {
            return res.status(403).json({ success: false, message: 'Not authorized for this company' });
        }

        await connection.beginTransaction();

        const [orderRows] = await connection.query(
            `SELECT o.id, o.user_id, o.order_number, o.order_status, o.current_status,
                    o.shipping_address, o.shipping_city, o.shipping_country, o.shipping_zip,
                    o.assigned_branch_id
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             WHERE o.order_number = ? AND oi.company_id = ?
             LIMIT 1`,
            [orderNumber, companyId]
        );

        if (orderRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found for this company' });
        }

        const order = orderRows[0];
        if (['cancelled', 'delivered', 'returned'].includes(order.order_status)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `Order is ${order.order_status} and cannot be assigned` });
        }

        const [sumRows] = await connection.query(
            `SELECT COALESCE(SUM(oi.total_price), 0) AS company_total
             FROM order_items oi
             WHERE oi.order_id = ? AND oi.company_id = ?`,
            [order.id, companyId]
        );
        const companyOrderAmount = Number(sumRows[0]?.company_total || 0);

        const [branchRows] = await connection.query(
            `SELECT id, name, address
             FROM branches
             WHERE id = ? AND is_active = 1
             LIMIT 1`,
            [branchId]
        );
        if (branchRows.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Selected branch is not available' });
        }
        const selectedBranch = branchRows[0];

        if (order.assigned_branch_id && Number(order.assigned_branch_id) === Number(selectedBranch.id)) {
            await connection.rollback();
            return res.json({
                success: true,
                message: `Already assigned to ${selectedBranch.name}`,
                data: {
                    orderNumber: order.order_number,
                    assignedBranch: {
                        id: selectedBranch.id,
                        name: selectedBranch.name,
                        address: selectedBranch.address
                    }
                }
            });
        }

        await connection.query(
            `UPDATE orders
             SET assigned_branch_id = ?,
                 assigned_branch_at = NOW(),
                 branch_accepted_at = NULL,
                 branch_accepted_by_user_id = NULL,
                 order_status = CASE
                   WHEN order_status = 'pending' THEN 'processing'
                   ELSE order_status
                 END
             WHERE id = ?`,
            [selectedBranch.id, order.id]
        );

        const assignmentNotification = await notifyDeliveryAdminsOfBranchAssignment(
            connection,
            selectedBranch.id,
            order,
            ownership[0],
            companyOrderAmount
        );

        await connection.query(
            `INSERT INTO company_branch_preferences (company_id, branch_id, usage_count, last_assigned_at)
             VALUES (?, ?, 1, NOW())
             ON CONFLICT (company_id, branch_id) DO UPDATE SET
               usage_count = company_branch_preferences.usage_count + 1,
               last_assigned_at = NOW()`,
            [companyId, selectedBranch.id]
        );

        const customerMessage = `Order #${order.order_number} has been assigned to ${selectedBranch.name}. Waiting for branch acceptance.`;
        await connection.query(
            `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
             VALUES (?, 'order_update', 'Order Assigned to Branch', ?, ?, 'order')`,
            [
                order.user_id,
                customerMessage,
                order.id
            ]
        );

        await connection.commit();

        emitToBranch(selectedBranch.id, 'delivery:assignment:new', {
            type: 'seller_branch_assignment',
            orderNumber: order.order_number,
            message: assignmentNotification.message,
            companyName: ownership[0].company_name,
            companyId,
            assignedBranchId: selectedBranch.id,
            assignedBranchName: selectedBranch.name,
            customerAddress: assignmentNotification.customerAddress,
            orderId: order.id
        });
        emitToBranch(selectedBranch.id, 'delivery:queue:changed', {
            orderNumber: order.order_number,
            reason: 'seller_assigned_to_branch'
        });
        emitToCompany(companyId, 'company:dashboard:refresh', {
            companyId,
            reason: 'branch_assigned',
            orderNumber: order.order_number
        });
        emitToUser(order.user_id, 'notification:new', {
            type: 'order_update',
            title: 'Order Assigned to Branch',
            message: customerMessage,
            orderNumber: order.order_number,
            orderId: order.id
        });

        res.json({
            success: true,
            message: `Assigned to ${selectedBranch.name}`,
            data: {
                orderNumber: order.order_number,
                assignedBranch: {
                    id: selectedBranch.id,
                    name: selectedBranch.name,
                    address: selectedBranch.address
                }
            }
        });
    } catch (error) {
        try { await connection.rollback(); } catch {}
        console.error('Assign order to branch error:', error);
        res.status(500).json({ success: false, message: 'Failed to assign order to branch' });
    } finally {
        connection.release();
    }
};

// Add Product to Company
const addProduct = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            company_id, category_id, name, description,
            min_price, max_price, discount_percentage,
            stock_quantity, promo_code, promo_discount_value,
            brand, model, color, weight, dimensions, warranty,
            tags, points_reward, stars_reward, is_negotiable, is_cod_allowed, cod_advance_amount,
            is_ar_3d, ar_url
        } = req.body;

        if (!company_id || !name || !min_price || !max_price || !category_id) {
            return res.status(400).json({
                success: false,
                message: 'Company, name, min price, max price, and category are required'
            });
        }

        if (!isValidPrice(min_price)) {
            return res.status(400).json({ success: false, message: 'Min price must be a positive number with at most 2 decimal places' });
        }
        if (!isValidPrice(max_price)) {
            return res.status(400).json({ success: false, message: 'Max price must be a positive number with at most 2 decimal places' });
        }
        if (stock_quantity !== undefined && stock_quantity !== '' && !isValidQuantity(stock_quantity)) {
            return res.status(400).json({ success: false, message: 'Stock quantity must be an integer between 0 and 999999' });
        }
        if (discount_percentage !== undefined && discount_percentage !== '' && !isValidPercentage(discount_percentage)) {
            return res.status(400).json({ success: false, message: 'Discount percentage must be between 0 and 100' });
        }
        if (ar_url && String(ar_url).trim() && !isValidUrl(ar_url)) {
            return res.status(400).json({ success: false, message: 'AR URL must start with http:// or https://' });
        }

        // Verify ownership
        const [ownership] = await pool.query(
            'SELECT id FROM companies WHERE id = ? AND user_id = ?',
            [company_id, userId]
        );

        if (ownership.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to add products to this company'
            });
        }

        const discount = parseFloat(discount_percentage) || 0;
        if (discount < 0) {
            return res.status(400).json({
                success: false,
                message: 'Discount cannot be negative'
            });
        }

        const isCodAllowed = parseInt(is_cod_allowed) === 1;
        const codAdvanceAmt = (cod_advance_amount != null && cod_advance_amount !== '')
            ? parseFloat(cod_advance_amount) : null;
        if (isCodAllowed && (codAdvanceAmt === null || isNaN(codAdvanceAmt) || codAdvanceAmt <= 0)) {
            return res.status(400).json({
                success: false,
                message: 'A minimum upfront payment amount greater than 0 is required when Cash on Delivery is enabled'
            });
        }

        const maxPriceVal = parseFloat(max_price);
        const minPriceVal = parseFloat(min_price);
        const currentPrice = discount > 0
            ? maxPriceVal - (maxPriceVal * discount / 100)
            : maxPriceVal;

        // Handle multiple images
        const images = [];
        const imageFiles = Array.isArray(req.files)
            ? req.files
            : (req.files?.images || []);

        if (imageFiles.length > 0) {
            imageFiles.forEach(file => {
                images.push(normalizeFilePath(file.path));
            });
        }

        const arEnabled = parseInt(is_ar_3d) === 1;
        const arQrFile = req.files?.ar_qr_image?.[0] || null;
        const arQrImagePath = arQrFile ? normalizeFilePath(arQrFile.path) : null;

        if (arEnabled) {
            if (!ar_url || String(ar_url).trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'AR URL is required when AR 3D is enabled'
                });
            }
            if (!arQrImagePath) {
                return res.status(400).json({
                    success: false,
                    message: 'AR QR code image is required when AR 3D is enabled'
                });
            }
        }

        const mainImage = images.length > 0 ? images[0] : null;

        // Auto-generate points & stars based on price
        // stars_reward column is DECIMAL(5,2) after migration — cap at 99.99 as safety net
        const autoPoints = parseInt(points_reward) || Math.floor(currentPrice * 0.1);
        const autoStars = Math.min(
            parseFloat(stars_reward) || parseFloat((currentPrice * 0.005).toFixed(1)),
            99.99
        );

        // Helper to detect missing-column errors (MySQL + PostgreSQL)
        const isMissingColumnError = (err) => err && (
            err.code === 'ER_BAD_FIELD_ERROR' ||
            err.code === '42703' || // PostgreSQL: undefined_column
            err.code === '42P01'    // PostgreSQL: undefined_table
        );

        // Base insert params (no AR, no COD) — guaranteed compatible with base schema
        const minimalInsertQuery =
            `INSERT INTO products
             (company_id, category_id, name, description, old_price, current_price,
              min_price, max_price, discount_percentage, stock_quantity,
              image_url, promo_code, brand, model, color, weight, dimensions,
              warranty, tags, points_reward, stars_reward, is_in_stock, is_negotiable)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        // Ultra-minimal fallback: absolutely no optional columns (original schema only)
        const ultraMinimalInsertQuery =
            `INSERT INTO products
             (company_id, category_id, name, description, old_price, current_price,
              min_price, max_price, discount_percentage, stock_quantity,
              image_url, promo_code, brand, model, color, weight, dimensions,
              warranty, points_reward, stars_reward, is_in_stock)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const ultraMinimalInsertParams = [
            company_id, category_id, name, description || '',
            maxPriceVal, currentPrice, minPriceVal,
            maxPriceVal, discount, parseInt(stock_quantity) || 0,
            mainImage, promo_code || null,
            brand || null, model || null, color || null,
            weight || null, dimensions || null, warranty || null,
            autoPoints, autoStars,
            parseInt(stock_quantity) > 0 ? 1 : 0
        ];

        const minimalInsertParams = [
            company_id, category_id, name, description || '',
            maxPriceVal, currentPrice, minPriceVal,
            maxPriceVal, discount, parseInt(stock_quantity) || 0,
            mainImage, promo_code || null,
            brand || null, model || null, color || null,
            weight || null, dimensions || null, warranty || null,
            tags || null, autoPoints, autoStars,
            parseInt(stock_quantity) > 0 ? 1 : 0,
            parseInt(is_negotiable) || 0
        ];

        const baseInsertQuery =
            `INSERT INTO products
             (company_id, category_id, name, description, old_price, current_price,
              min_price, max_price, discount_percentage, stock_quantity,
              image_url, promo_code, brand, model, color, weight, dimensions,
              warranty, tags, points_reward, stars_reward, is_in_stock, is_negotiable, is_cod_allowed, cod_advance_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const baseInsertParams = [
            ...minimalInsertParams,
            parseInt(is_cod_allowed) || 0,
            (cod_advance_amount != null && cod_advance_amount !== '') ? parseFloat(cod_advance_amount) : null
        ];

        const insertWithArQuery =
            `INSERT INTO products
             (company_id, category_id, name, description, old_price, current_price,
              min_price, max_price, discount_percentage, stock_quantity,
              image_url, promo_code, brand, model, color, weight, dimensions,
              warranty, tags, points_reward, stars_reward, is_in_stock, is_negotiable, is_cod_allowed, cod_advance_amount,
              is_ar_3d, ar_qr_image, ar_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const insertWithArParams = [
            ...baseInsertParams,
            arEnabled ? 1 : 0,
            arEnabled ? arQrImagePath : null,
            arEnabled ? String(ar_url).trim() : null
        ];

        let result;
        try {
            // Try full query first (all columns)
            const [r] = await pool.query(insertWithArQuery, insertWithArParams);
            result = r;
        } catch (err) {
            if (!isMissingColumnError(err)) throw err;
            try {
                // Fallback 1: without AR columns (cod columns still included)
                const [r2] = await pool.query(baseInsertQuery, baseInsertParams);
                result = r2;
            } catch (err2) {
                if (!isMissingColumnError(err2)) throw err2;
                try {
                    // Fallback 2: minimal base schema only (no cod, no ar extra columns)
                    const [r3] = await pool.query(minimalInsertQuery, minimalInsertParams);
                    result = r3;
                } catch (err3) {
                    if (!isMissingColumnError(err3)) throw err3;
                    // Fallback 3: ultra-minimal (no is_negotiable, no tags — absolute base)
                    const [r4] = await pool.query(ultraMinimalInsertQuery, ultraMinimalInsertParams);
                    result = r4;
                }
            }
        }

        const newProductId = result?.insertId || null;

        // Insert images into product_images table
        for (let i = 0; i < images.length; i++) {
            try {
                await pool.query(
                    'INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)',
                    [newProductId, images[i], i === 0 ? 1 : 0, i]
                );
            } catch (_e) { console.warn('product_images insert warning:', _e?.message || _e); }
        }

        // Save promo code if provided
        if (promo_code && promo_discount_value > 0) {
            try {
                await pool.query(
                    `INSERT INTO company_promo_codes
                     (company_id, product_id, code, discount_type, discount_value)
                     VALUES (?, ?, ?, 'percentage', ?)
                     ON CONFLICT (company_id, code) DO UPDATE SET discount_value = EXCLUDED.discount_value`,
                    [company_id, newProductId, promo_code,
                     parseFloat(promo_discount_value)]
                );
            } catch (_e) { /* company_promo_codes table may not exist yet */ }
        }

        // Notify followers who have notifications enabled
        let followers = [];
        try {
            [followers] = await pool.query(
                'SELECT user_id FROM company_followers WHERE company_id = ? AND notifications_enabled = 1',
                [company_id]
            );
        } catch (_e) { /* company_followers table may not exist yet */ }

        if (followers.length > 0) {
            try {
                const [companyInfo] = await pool.query(
                    'SELECT company_name FROM companies WHERE id = ?',
                    [company_id]
                );
                const companyName = companyInfo[0]?.company_name || '';
                for (const follower of followers) {
                    try {
                        await pool.query(
                            `INSERT INTO notifications
                             (user_id, type, title, message, reference_id, reference_type)
                             VALUES (?, 'company_update', 'New Product', ?, ?, 'product')`,
                            [follower.user_id, `${companyName} added: ${name}`, newProductId]
                        );
                    } catch (_e) { /* skip notification errors */ }
                }
            } catch (_e) { /* skip notification errors */ }
        }

        let newProduct = [];
        if (newProductId) {
            try {
                [newProduct] = await pool.query(
                    'SELECT * FROM products WHERE id = ?',
                    [newProductId]
                );
            } catch (_selErr) { /* non-fatal — product was created, just can't return full data */ }
        }

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: newProduct[0] || null
        });

        // Fire-and-forget: index the primary image in the visual search service
        if (mainImage) {
            indexProductImage(newProductId, mainImage, name);
        }

    } catch (error) {
        console.error('Add product error:', error.code, error.message, error.detail || '');
        res.status(500).json({
            success: false,
            message: 'Failed to create product',
            debug: `${error.code || 'ERR'}: ${error.message}`
        });
    }
};

// Update Product
// Update Product
const updateProduct = async (req, res) => {
    try {
        const userId = req.user.id;
        const productId = req.params.productId;

        const [product] = await pool.query(
            `SELECT p.id, p.company_id FROM products p
             JOIN companies c ON p.company_id = c.id
             WHERE p.id = ? AND c.user_id = ?`,
            [productId, userId]
        );

        if (product.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this product'
            });
        }

        // Fetch current AR fields — wrapped because AR columns may not be migrated yet
        let existingAr = { is_ar_3d: 0, ar_qr_image: null, ar_url: null };
        try {
            const [existingRow] = await pool.query(
                'SELECT is_ar_3d, ar_qr_image, ar_url FROM products WHERE id = ?',
                [productId]
            );
            if (existingRow?.[0]) existingAr = existingRow[0];
        } catch (_e) { /* AR columns not yet in schema — use defaults */ }

        const {
            name, description, min_price, max_price,
            discount_percentage, stock_quantity, category_id,
            promo_code, brand, model, color, weight,
            dimensions, warranty, tags, points_reward, stars_reward,
            keep_existing_images, is_negotiable, is_cod_allowed, cod_advance_amount,
            is_ar_3d, ar_url
        } = req.body;

        const discount = parseFloat(discount_percentage) || 0;
        if (discount < 0) {
            return res.status(400).json({
                success: false,
                message: 'Discount cannot be negative'
            });
        }

        const isCodAllowed = is_cod_allowed !== undefined ? parseInt(is_cod_allowed) === 1 : null;
        if (isCodAllowed === true) {
            const codAdvanceAmt = (cod_advance_amount != null && cod_advance_amount !== '')
                ? parseFloat(cod_advance_amount) : null;
            if (codAdvanceAmt === null || isNaN(codAdvanceAmt) || codAdvanceAmt <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'A minimum upfront payment amount greater than 0 is required when Cash on Delivery is enabled'
                });
            }
        }

        const maxPriceVal = max_price ? parseFloat(max_price) : null;
        const currentPrice = maxPriceVal && discount > 0
            ? maxPriceVal - (maxPriceVal * discount / 100)
            : maxPriceVal;

        // Handle new images
        const newImages = [];
        const newImageFiles = Array.isArray(req.files)
            ? req.files
            : (req.files?.images || []);

        if (newImageFiles.length > 0) {
            newImageFiles.forEach(file => {
                newImages.push(normalizeFilePath(file.path));
            });
        }

        const newArQrFile = req.files?.ar_qr_image?.[0] || null;
        const newArQrImagePath = newArQrFile ? normalizeFilePath(newArQrFile.path) : null;

        const arEnabledExplicit = is_ar_3d !== undefined ? parseInt(is_ar_3d) === 1 : null;
        const wantsArEnable = arEnabledExplicit === true;
        const wantsArDisable = arEnabledExplicit === false;

        if (wantsArEnable) {
            const nextUrl = ar_url ? String(ar_url).trim() : (existingAr.ar_url || '');
            const nextQr = newArQrImagePath || existingAr.ar_qr_image;
            if (!nextUrl) {
                return res.status(400).json({
                    success: false,
                    message: 'AR URL is required when AR 3D is enabled'
                });
            }
            if (!nextQr) {
                return res.status(400).json({
                    success: false,
                    message: 'AR QR code image is required when AR 3D is enabled'
                });
            }
        }

        // Parse which existing images to keep
        let keepImages = [];
        try {
            keepImages = keep_existing_images ? JSON.parse(keep_existing_images) : [];
        } catch (e) {
            keepImages = [];
        }

        // Handle product_images table operations (gracefully handles if table doesn't exist)
        let mainImageUrl = newImages.length > 0 ? newImages[0] : null;
        try {
            // Remove images that are NOT in the keep list
            if (keepImages.length > 0) {
                const placeholders = keepImages.map(() => '?').join(',');
                await pool.query(
                    `DELETE FROM product_images WHERE product_id = ? AND image_url NOT IN (${placeholders})`,
                    [productId, ...keepImages]
                );
            } else if (newImages.length > 0) {
                await pool.query('DELETE FROM product_images WHERE product_id = ?', [productId]);
            }

            // Add new images
            if (newImages.length > 0) {
                const [maxSort] = await pool.query(
                    'SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM product_images WHERE product_id = ?',
                    [productId]
                );
                // pg returns bigint as string; coerce to number before arithmetic
                let sortOrder = Number(maxSort[0]?.max_sort ?? -1) + 1;
                if (keepImages.length === 0) sortOrder = 0;

                for (let i = 0; i < newImages.length; i++) {
                    await pool.query(
                        'INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)',
                        [productId, newImages[i], (keepImages.length === 0 && i === 0) ? 1 : 0, sortOrder + i]
                    );
                }
            }

            // Get the best primary image for the products table
            const [allImages] = await pool.query(
                'SELECT image_url FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC LIMIT 1',
                [productId]
            );
            if (allImages.length > 0) {
                mainImageUrl = allImages[0].image_url;
            }
        } catch (imgErr) {
            console.warn('product_images update warning (non-fatal):', imgErr?.message || imgErr);
            // mainImageUrl already set to newImages[0] above as fallback
        }

        // Update product fields
        let updateQuery = `UPDATE products SET
            name = COALESCE(?, name),
            description = COALESCE(?, description),
            min_price = COALESCE(?, min_price),
            max_price = COALESCE(?, max_price),
            old_price = COALESCE(?, old_price),
            current_price = COALESCE(?, current_price),
            discount_percentage = ?,
            stock_quantity = COALESCE(?, stock_quantity),
            category_id = COALESCE(?, category_id),
            promo_code = ?,
            brand = COALESCE(?, brand),
            model = COALESCE(?, model),
            color = COALESCE(?, color),
            weight = COALESCE(?, weight),
            dimensions = COALESCE(?, dimensions),
            warranty = COALESCE(?, warranty),
            tags = COALESCE(?, tags),
            points_reward = COALESCE(?, points_reward),
            stars_reward = COALESCE(?, stars_reward),
            is_in_stock = ?,
            is_negotiable = COALESCE(?, is_negotiable),
            is_cod_allowed = COALESCE(?, is_cod_allowed),
            cod_advance_amount = ?`;

        // Auto-calculate rewards from new price if price is being updated
        const updatedPoints = currentPrice ? Math.floor(currentPrice * 0.1) : null;
        const updatedStars = currentPrice ? parseFloat((currentPrice * 0.005).toFixed(1)) : null;

        const params = [
            name, description, min_price ? parseFloat(min_price) : null,
            maxPriceVal, maxPriceVal, currentPrice, discount,
            stock_quantity ? parseInt(stock_quantity) : null,
            category_id, promo_code || null,
            brand, model, color, weight, dimensions, warranty,
            tags, updatedPoints,
            updatedStars,
            parseInt(stock_quantity) > 0 ? 1 : 0,
            is_negotiable !== undefined ? parseInt(is_negotiable) : null,
            is_cod_allowed !== undefined ? parseInt(is_cod_allowed) : null,
            (cod_advance_amount != null && cod_advance_amount !== '') ? parseFloat(cod_advance_amount) : null
        ];

        // AR columns (optional - DB may not be migrated yet)
        if (is_ar_3d !== undefined) {
            updateQuery += ', is_ar_3d = ?';
            params.push(parseInt(is_ar_3d));
        }
        if (ar_url !== undefined && ar_url !== null) {
            const trimmed = String(ar_url).trim();
            updateQuery += ', ar_url = ?';
            params.push(trimmed.length > 0 ? trimmed : null);
        }
        if (newArQrImagePath) {
            updateQuery += ', ar_qr_image = ?';
            params.push(newArQrImagePath);
        }
        if (wantsArDisable) {
            updateQuery += ', ar_qr_image = NULL, ar_url = NULL';
        }

        if (mainImageUrl) {
            updateQuery += ', image_url = ?';
            params.push(mainImageUrl);
        }

        updateQuery += ' WHERE id = ?';
        params.push(productId);

        try {
            await pool.query(updateQuery, params);
        } catch (err) {
            // MySQL uses 'ER_BAD_FIELD_ERROR'; PostgreSQL (pg driver) uses SQLSTATE '42703' for undefined_column
            const isMissingColumn = err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === '42703');
            if (isMissingColumn) {
                // If AR fields were part of the request, surface a clear message.
                if (is_ar_3d !== undefined || newArQrImagePath || (ar_url !== undefined && ar_url !== null)) {
                    return res.status(500).json({
                        success: false,
                        message: 'AR 3D columns are not available in the database yet. Please run the DB migration to add is_ar_3d/ar_qr_image/ar_url.'
                    });
                }

                // Retry without any AR fields (legacy schema)
                const legacyParams = [
                    name, description, min_price ? parseFloat(min_price) : null,
                    maxPriceVal, maxPriceVal, currentPrice, discount,
                    stock_quantity ? parseInt(stock_quantity) : null,
                    category_id, promo_code || null,
                    brand, model, color, weight, dimensions, warranty,
                    tags, updatedPoints,
                    updatedStars,
                    parseInt(stock_quantity) > 0 ? 1 : 0,
                    is_negotiable !== undefined ? parseInt(is_negotiable) : null
                ];

                let legacyQuery = `UPDATE products SET
                    name = COALESCE(?, name),
                    description = COALESCE(?, description),
                    min_price = COALESCE(?, min_price),
                    max_price = COALESCE(?, max_price),
                    old_price = COALESCE(?, old_price),
                    current_price = COALESCE(?, current_price),
                    discount_percentage = ?,
                    stock_quantity = COALESCE(?, stock_quantity),
                    category_id = COALESCE(?, category_id),
                    promo_code = ?,
                    brand = COALESCE(?, brand),
                    model = COALESCE(?, model),
                    color = COALESCE(?, color),
                    weight = COALESCE(?, weight),
                    dimensions = COALESCE(?, dimensions),
                    warranty = COALESCE(?, warranty),
                    tags = COALESCE(?, tags),
                    points_reward = COALESCE(?, points_reward),
                    stars_reward = COALESCE(?, stars_reward),
                    is_in_stock = ?,
                    is_negotiable = COALESCE(?, is_negotiable)`;

                const legacyParamsMutable = [...legacyParams];
                if (mainImageUrl) {
                    legacyQuery += ', image_url = ?';
                    legacyParamsMutable.push(mainImageUrl);
                }
                legacyQuery += ' WHERE id = ?';
                legacyParamsMutable.push(productId);

                await pool.query(legacyQuery, legacyParamsMutable);
            } else {
                throw err;
            }
        }

        const [updated] = await pool.query(
            'SELECT * FROM products WHERE id = ?',
            [productId]
        );

        // ── Out-of-stock notification: notify waiting customers if product is back in stock ──
        try {
            const newStock = parseInt(stock_quantity) || 0;
            if (newStock > 0) {
                const [[prev]] = await pool.query(
                    'SELECT is_in_stock, stock_quantity, name FROM products WHERE id = ?', [productId]
                );
                // product is now in stock (we already updated above, so check via prev before update was applied)
                // Since the update already ran, check the updated row to see if it transitioned to in-stock
                const [[curr]] = await pool.query('SELECT is_in_stock, name FROM products WHERE id = ?', [productId]);
                if (curr && curr.is_in_stock) {
                    const [requestors] = await pool.query(
                        'SELECT user_id FROM product_requests WHERE product_id = ? AND is_notified = 0',
                        [productId]
                    );
                    if (requestors.length > 0) {
                        const productName = updated[0]?.name || 'A product';
                        for (const { user_id } of requestors) {
                            await pool.query(
                                `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
                                 VALUES (?, 'product_back_in_stock', 'Product Back in Stock!',
                                 ?, ?, 'product')`,
                                [user_id, `Good news! "${productName}" is now available again.`, productId]
                            );
                        }
                        await pool.query(
                            'UPDATE product_requests SET is_notified = 1, notified_at = NOW() WHERE product_id = ? AND is_notified = 0',
                            [productId]
                        );
                    }
                }
            }
        } catch (notifErr) {
            console.warn('Out-of-stock notification error (non-fatal):', notifErr.message);
        }

        res.json({
            success: true,
            message: 'Product updated successfully',
            data: updated[0]
        });

    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update product'
        });
    }
};

// Delete Product
const deleteProduct = async (req, res) => {
    try {
        const userId = req.user.id;
        const productId = req.params.productId;

        const [product] = await pool.query(
            `SELECT p.id FROM products p
             JOIN companies c ON p.company_id = c.id
             WHERE p.id = ? AND c.user_id = ?`,
            [productId, userId]
        );

        if (product.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        await pool.query(
            "UPDATE products SET status = 'deleted' WHERE id = ?",
            [productId]
        );

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });

    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete product'
        });
    }
};

// Get Company Leaderboard
const getLeaderboard = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const [leaderboard] = await pool.query(
            `SELECT
                c.id, c.company_name, c.company_logo, c.badge,
                c.total_sales, c.follower_count, c.created_at,
                u.username as owner_name,
                COALESCE(cr.avg_rating, 0) AS rating,
                COALESCE(cr.total_ratings, 0) AS total_ratings,
                ROW_NUMBER() OVER (
                    ORDER BY (
                        COALESCE(c.total_sales, 0) * 10 +
                        COALESCE(cr.avg_rating, 0) * 200 +
                        COALESCE(c.follower_count, 0) * 5
                    ) DESC
                ) as "rank"
             FROM companies c
             JOIN users u ON c.user_id = u.id
             LEFT JOIN (
                SELECT company_id, AVG(rating) AS avg_rating, COUNT(*) AS total_ratings
                FROM company_ratings
                GROUP BY company_id
             ) cr ON cr.company_id = c.id
             WHERE c.status = 'active'
             ORDER BY (
                 COALESCE(c.total_sales, 0) * 10 +
                 COALESCE(cr.avg_rating, 0) * 200 +
                 COALESCE(c.follower_count, 0) * 5
             ) DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const [total] = await pool.query(
            'SELECT COUNT(*) as count FROM companies WHERE status = ?',
            ['active']
        );

        res.json({
            success: true,
            data: {
                leaderboard,
                pagination: {
                    page,
                    limit,
                    total: total[0].count,
                    totalPages: Math.ceil(total[0].count / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch leaderboard'
        });
    }
};

// Get Product Images
const getProductImages = async (req, res) => {
    try {
        const productId = req.params.productId;

        const [images] = await pool.query(
            'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC',
            [productId]
        );

        // If no images in product_images table, get from products.image_url
        if (images.length === 0) {
            const [product] = await pool.query(
                'SELECT image_url FROM products WHERE id = ?',
                [productId]
            );
            if (product.length > 0 && product[0].image_url) {
                images.push({
                    id: 'main',
                    product_id: productId,
                    image_url: product[0].image_url,
                    is_primary: 1,
                    sort_order: 0
                });
            }
        }

        res.json({
            success: true,
            data: images
        });

    } catch (error) {
        console.error('Get product images error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product images'
        });
    }
};

// Toggle notifications for a followed company
const toggleCompanyNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const { companyId } = req.params;

        const [follower] = await pool.query(
            'SELECT id, notifications_enabled FROM company_followers WHERE user_id = ? AND company_id = ?',
            [userId, companyId]
        );

        if (follower.length === 0) {
            return res.status(400).json({ success: false, message: 'Not following this company' });
        }

        const newVal = follower[0].notifications_enabled ? 0 : 1;
        await pool.query(
            'UPDATE company_followers SET notifications_enabled = ? WHERE user_id = ? AND company_id = ?',
            [newVal, userId, companyId]
        );

        res.json({
            success: true,
            notificationsEnabled: newVal === 1
        });
    } catch (error) {
        console.error('Toggle company notifications error:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle notifications' });
    }
};

// Delete Company (hard delete — removes all related data permanently)
const deleteCompany = async (req, res) => {
    try {
        const userId = req.user.id;
        const companyId = req.params.id;

        const [ownership] = await pool.query(
            'SELECT id FROM companies WHERE id = ? AND user_id = ?',
            [companyId, userId]
        );

        if (ownership.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this company'
            });
        }

        // Delete all related data first to avoid FK constraint errors
        await pool.query('DELETE FROM company_followers    WHERE company_id = ?', [companyId]);
        await pool.query('DELETE FROM company_notifications WHERE company_id = ?', [companyId]);
        await pool.query('DELETE FROM company_ratings      WHERE company_id = ?', [companyId]);
        await pool.query('DELETE FROM company_promo_codes  WHERE company_id = ?', [companyId]);

        // Soft-delete products so existing orders keep their product reference
        await pool.query(
            "UPDATE products SET status = 'deleted' WHERE company_id = ?",
            [companyId]
        );

        // Hard-delete the company record itself
        await pool.query(
            'DELETE FROM companies WHERE id = ? AND user_id = ?',
            [companyId, userId]
        );

        res.json({
            success: true,
            message: 'Company deleted successfully'
        });

    } catch (error) {
        console.error('Delete company error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete company'
        });
    }
};

const searchCompanies = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 1) return res.json({ success: true, data: [] });
        const [rows] = await pool.query(
            `SELECT id, company_name AS name, company_logo FROM companies WHERE status = 'active' AND company_name ILIKE ? ORDER BY company_name LIMIT 15`,
            [`%${q}%`]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    createCompany,
    searchCompanies,
    getMyCompanies,
    getMyCompany,
    getCompanyById,
    getCompanyProductsByCategory,
    toggleFollow,
    getFollowingCompanies,
    toggleCompanyNotifications,
    updateCompany,
    deleteCompany,
    rateCompany,
    getCompanyDashboard,
    getCompanyNotifications,
    markCompanyNotificationRead,
    listAssignableBranchesForOrder,
    assignOrderToBranch,
    addProduct,
    updateProduct,
    deleteProduct,
    getLeaderboard,
    getProductImages,
    deletePromoBanner
};