const { pool } = require('../config/db');

// Fetch seller rules for a company, sorted ascending by min_orders
async function getSellerRules(companyId) {
    const [rows] = await pool.query(
        `SELECT * FROM seller_negotiation_rules
         WHERE company_id = ?
         ORDER BY min_orders ASC`,
        [companyId]
    );
    return rows;
}

// Find the matching rule tier for a given order count (highest applicable wins)
function matchRule(rules, orderCount) {
    let matched = null;
    for (const rule of rules) {
        if (orderCount >= rule.min_orders) {
            if (rule.max_orders === null || orderCount <= rule.max_orders) {
                matched = rule;
            }
        }
    }
    return matched;
}

// Default rules when seller hasn't defined any
const DEFAULT_RULES = [
    { min_orders: 1, max_orders: 3,    discount_percent: 3  },
    { min_orders: 4, max_orders: 10,   discount_percent: 7  },
    { min_orders: 11, max_orders: null, discount_percent: 12 },
];

// Compute the discounted offer price, never going below minPrice
function calcOfferPrice(currentPrice, minPrice, discountPercent) {
    const maxDiscount = currentPrice - minPrice;
    const wantedDiscount = currentPrice * (discountPercent / 100);
    const actualDiscount = Math.min(wantedDiscount, maxDiscount);
    return parseFloat(Math.max(currentPrice - actualDiscount, minPrice).toFixed(2));
}

function fmt(price) { return `৳${parseFloat(price).toFixed(2)}`; }

// Opening message: ask what price the customer wants
function buildGreeting(productName, currentPrice) {
    return `Hello! The listed price for "${productName}" is ${fmt(currentPrice)}. What price would you like to pay? I'll do my best to make you a deal! 🤝`;
}

// Initial options shown before any negotiation (just a way out)
function buildInitialOptions() {
    return [{ type: 'close', text: 'Not interested' }];
}

// Reconstruct available options from the last AI message when resuming a session
function buildResumeOptions(messages) {
    const lastAiMsg = [...messages].reverse().find(m => m.sender === 'ai');
    if (lastAiMsg && lastAiMsg.offered_price && parseFloat(lastAiMsg.offered_price) > 0) {
        const p = parseFloat(lastAiMsg.offered_price);
        return [
            { type: 'accept_offer', text: `✅ Confirm deal at ${fmt(p)}`, price: p },
            { type: 'close', text: 'Not interested' },
        ];
    }
    return [{ type: 'close', text: 'Not interested' }];
}

// ─── Start Negotiation ────────────────────────────────────────────────────────
const startNegotiation = async (req, res) => {
    try {
        const userId = req.user.id;
        const { product_id } = req.body;

        if (!product_id) {
            return res.status(400).json({ success: false, message: 'Product ID is required' });
        }

        const [product] = await pool.query(
            `SELECT p.*, c.id as company_id, c.company_name
             FROM products p
             JOIN companies c ON p.company_id = c.id
             WHERE p.id = ? AND p.status = 'active'`,
            [product_id]
        );

        if (product.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const prod = product[0];

        // Sellers cannot negotiate on their own products
        const [sellerCheck] = await pool.query(
            'SELECT id FROM companies WHERE id = ? AND user_id = ?',
            [prod.company_id, userId]
        );
        if (sellerCheck.length > 0) {
            return res.status(400).json({ success: false, message: 'Sellers cannot negotiate on their own products' });
        }

        // Fetch customer purchase history from this company
        const [history] = await pool.query(
            `SELECT COUNT(DISTINCT o.id) as order_count, COALESCE(SUM(oi.total_price), 0) as total_spent
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             WHERE o.user_id = ? AND oi.company_id = ? AND o.payment_status = 'paid'`,
            [userId, prod.company_id]
        );
        const orderCount = Number(history[0].order_count) || 0;
        const totalSpent = parseFloat(history[0].total_spent) || 0;

        const currentPrice = parseFloat(prod.current_price);
        // min_price is the seller's absolute floor; fall back to 50% of current if not set
        const minPrice = (prod.min_price && parseFloat(prod.min_price) > 0)
            ? parseFloat(prod.min_price)
            : parseFloat((currentPrice * 0.5).toFixed(2));

        // Resume existing active negotiation
        const [existing] = await pool.query(
            `SELECT * FROM ai_negotiations
             WHERE user_id = ? AND product_id = ? AND status = 'active'`,
            [userId, product_id]
        );

        if (existing.length > 0) {
            // Keep purchase stats fresh
            if (Number(existing[0].customer_order_count) !== orderCount ||
                parseFloat(existing[0].customer_total_purchases) !== totalSpent) {
                await pool.query(
                    `UPDATE ai_negotiations SET customer_order_count = ?, customer_total_purchases = ? WHERE id = ?`,
                    [orderCount, totalSpent, existing[0].id]
                );
            }
            const [messages] = await pool.query(
                'SELECT * FROM ai_negotiation_messages WHERE negotiation_id = ? ORDER BY created_at ASC',
                [existing[0].id]
            );
            return res.json({
                success: true,
                negotiation: existing[0],
                messages,
                availableOptions: buildResumeOptions(messages),
            });
        }

        // Create new negotiation session
        const [result] = await pool.query(
            `INSERT INTO ai_negotiations (user_id, product_id, company_id, customer_total_purchases, customer_order_count)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, product_id, prod.company_id, totalSpent, orderCount]
        );
        const negotiationId = result.insertId;

        const greeting = buildGreeting(prod.name, currentPrice);
        await pool.query(
            `INSERT INTO ai_negotiation_messages (negotiation_id, sender, message_type, message_text)
             VALUES (?, 'ai', 'greeting', ?)`,
            [negotiationId, greeting]
        );

        const [negotiation] = await pool.query('SELECT * FROM ai_negotiations WHERE id = ?', [negotiationId]);
        const [messages] = await pool.query(
            'SELECT * FROM ai_negotiation_messages WHERE negotiation_id = ? ORDER BY created_at ASC',
            [negotiationId]
        );

        res.status(201).json({
            success: true,
            negotiation: negotiation[0],
            messages,
            availableOptions: buildInitialOptions(),
        });

    } catch (error) {
        console.error('Start negotiation error:', error);
        res.status(500).json({ success: false, message: 'Failed to start negotiation' });
    }
};

// ─── Send Message ─────────────────────────────────────────────────────────────
const sendMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { negotiation_id, message_type } = req.body;

        if (!negotiation_id || !message_type) {
            return res.status(400).json({ success: false, message: 'negotiation_id and message_type are required' });
        }

        const [negotiation] = await pool.query(
            `SELECT n.*, p.name as product_name, p.current_price, p.min_price,
                    c.company_name, c.id as company_id
             FROM ai_negotiations n
             JOIN products p ON n.product_id = p.id
             JOIN companies c ON n.company_id = c.id
             WHERE n.id = ? AND n.user_id = ? AND n.status = 'active'`,
            [negotiation_id, userId]
        );

        if (negotiation.length === 0) {
            return res.status(404).json({ success: false, message: 'Negotiation not found or no longer active' });
        }

        const neg = negotiation[0];
        const orderCount = Number(neg.customer_order_count);
        const currentPrice = parseFloat(neg.current_price);
        const minPrice = (neg.min_price && parseFloat(neg.min_price) > 0)
            ? parseFloat(neg.min_price)
            : parseFloat((currentPrice * 0.5).toFixed(2));

        // Load seller rules (fallback to defaults)
        let rules = await getSellerRules(neg.company_id);
        if (rules.length === 0) rules = DEFAULT_RULES;

        const rule = matchRule(rules, orderCount);
        // Eligible price: loyalty-discounted price based on customer's order history
        const eligiblePrice = rule
            ? calcOfferPrice(currentPrice, minPrice, rule.discount_percent)
            : currentPrice;

        let userMessage = '';
        let aiResponse = '';
        let finalPrice = null;    // set when deal is accepted
        let counterPrice = null;  // set when AI makes a counter-offer (stored in message for resume)
        let newStatus = 'active';
        let availableOptions = [];

        switch (message_type) {

            // Customer clicks "✅ Confirm deal at ৳X" button
            case 'accept_offer': {
                const rawPrice = req.body.price;
                const offeredPrice = rawPrice != null ? parseFloat(rawPrice) : eligiblePrice;
                if (isNaN(offeredPrice) || offeredPrice <= 0) {
                    return res.status(400).json({ success: false, message: 'Invalid price' });
                }
                // Must be >= the customer's eligible (loyalty-discounted) price, not just the absolute minimum
                const acceptFloor = rule ? eligiblePrice : currentPrice;
                if (offeredPrice < acceptFloor) {
                    return res.status(400).json({
                        success: false,
                        message: 'The offered price is below the acceptable range for your account. Please increase your offer.'
                    });
                }
                userMessage = `I confirm the deal at ${fmt(offeredPrice)}`;
                aiResponse = `🎉 Deal confirmed! "${neg.product_name}" is yours at ${fmt(offeredPrice)} — exclusively for you. Your negotiated price has been locked in and added to cart. Enjoy!`;
                finalPrice = offeredPrice;
                newStatus = 'accepted';
                break;
            }

            // Customer accepts at the original listed price
            case 'accept_price':
                userMessage = `I'll take it at the listed price ${fmt(currentPrice)}`;
                aiResponse = `Great! "${neg.product_name}" confirmed at ${fmt(currentPrice)}. Happy shopping! 🛍️`;
                finalPrice = currentPrice;
                newStatus = 'accepted';
                break;

            // Customer walks away
            case 'close':
                userMessage = 'Not interested, thanks!';
                aiResponse = `No problem! Come back anytime — great deals always wait for our loyal customers. 😊`;
                newStatus = 'expired';
                break;

            // Free-text message from customer (main bargaining path)
            case 'custom': {
                const rawText = (req.body.text || '').trim();
                if (!rawText) {
                    return res.status(400).json({ success: false, message: 'Message text is required' });
                }
                userMessage = rawText;

                // Count previous user messages to determine which round this is
                // Round 0 = customer's first price proposal
                const [roundResult] = await pool.query(
                    `SELECT COUNT(*) as cnt FROM ai_negotiation_messages
                     WHERE negotiation_id = ? AND sender = 'user'`,
                    [negotiation_id]
                );
                const round = Number(roundResult[0].cnt);

                // Try to extract a price proposal from the message
                const priceMatch = rawText.match(/৳?\s*(\d[\d,]*(?:\.\d+)?)/);
                const proposedPrice = priceMatch
                    ? parseFloat(priceMatch[1].replace(/,/g, ''))
                    : null;

                const lowerText = rawText.toLowerCase();

                if (proposedPrice !== null && !isNaN(proposedPrice) && proposedPrice > 0) {
                    // ── Customer proposed a price ──────────────────────────────

                    if (proposedPrice >= currentPrice) {
                        // At or above listed price — accept immediately
                        aiResponse = `Perfect! I'm happy to confirm "${neg.product_name}" at ${fmt(currentPrice)} for you. 🎉`;
                        finalPrice = currentPrice;
                        newStatus = 'accepted';

                    } else if (proposedPrice >= eligiblePrice) {
                        // Reached or exceeded the customer's valid discounted threshold — accept
                        aiResponse = `We have a deal at ${fmt(proposedPrice)}! 🎉 That price is locked in exclusively for you — it won't be visible to other customers.`;
                        finalPrice = proposedPrice;
                        newStatus = 'accepted';

                    } else if (!rule) {
                        // No loyalty tier — no discount available
                        aiResponse = `I appreciate your offer of ${fmt(proposedPrice)}, but I'm unable to go below the listed price right now. Build your order history with us to unlock special discounts! For now, this product is available at ${fmt(currentPrice)}.`;
                        availableOptions = [{ type: 'close', text: 'Not interested' }];

                    } else {
                        // Offer is below the acceptable threshold — never reveal the target price
                        const tooLowResponses = [
                            `I appreciate your offer of ${fmt(proposedPrice)}, but it's a bit below what I can accept. Please try a higher amount!`,
                            `Your offer of ${fmt(proposedPrice)} is still below the acceptable range. Please increase it.`,
                            `${fmt(proposedPrice)} doesn't quite work for me. Please offer a slightly higher amount to proceed.`,
                            `I'm unable to accept ${fmt(proposedPrice)} at this time. Please try a higher price.`,
                        ];
                        aiResponse = tooLowResponses[Math.min(round, tooLowResponses.length - 1)];
                        availableOptions = [{ type: 'close', text: 'Not interested' }];
                    }

                } else {
                    // ── No price in message — respond contextually ─────────────

                    if (lowerText.includes('best') || lowerText.includes('lowest') || lowerText.includes('minimum') || lowerText.includes('cheapest') || lowerText.includes('floor')) {
                        aiResponse = `Just make me an offer! Type a price and I'll let you know right away if it works. 😊`;
                        availableOptions = [{ type: 'close', text: 'Not interested' }];

                    } else if (lowerText.includes('discount') || lowerText.includes('offer') || lowerText.includes('deal') || lowerText.includes('how much')) {
                        if (rule) {
                            aiResponse = `You may qualify for a special price based on your purchase history! Type the amount you'd like to pay and I'll let you know if we can make a deal. 🤝`;
                        } else {
                            aiResponse = `The listed price is ${fmt(currentPrice)}. Tell me what price you have in mind and I'll do my best! Build your order history with us to unlock special discounts.`;
                        }
                        availableOptions = [{ type: 'close', text: 'Not interested' }];

                    } else if (lowerText.includes('hello') || lowerText.includes('hi') || lowerText.includes('hey')) {
                        aiResponse = `Hello! The listed price for "${neg.product_name}" is ${fmt(currentPrice)}. What price would you like to pay? Just type a number and let's negotiate! 😊`;
                        availableOptions = [{ type: 'close', text: 'Not interested' }];

                    } else {
                        aiResponse = `I'm ready to negotiate! The listed price is ${fmt(currentPrice)}. Just type the price you'd like to pay and I'll let you know if we can make a deal!`;
                        availableOptions = [{ type: 'close', text: 'Not interested' }];
                    }
                }
                break;
            }

            default:
                return res.status(400).json({ success: false, message: 'Invalid message type' });
        }

        // Store user message
        await pool.query(
            `INSERT INTO ai_negotiation_messages (negotiation_id, sender, message_type, message_text)
             VALUES (?, 'user', ?, ?)`,
            [negotiation_id, message_type, userMessage]
        );

        // Store AI response; save offered_price so the session can be resumed correctly
        const messageOfferedPrice = finalPrice || counterPrice || null;
        await pool.query(
            `INSERT INTO ai_negotiation_messages (negotiation_id, sender, message_type, message_text, offered_price)
             VALUES (?, 'ai', 'response', ?, ?)`,
            [negotiation_id, aiResponse, messageOfferedPrice]
        );

        // Update negotiation record when status or final price changes
        if (finalPrice !== null || newStatus !== 'active') {
            await pool.query(
                `UPDATE ai_negotiations
                 SET status = ?,
                     final_price   = COALESCE(?, final_price),
                     offered_price = COALESCE(?, offered_price)
                 WHERE id = ?`,
                [newStatus, finalPrice, finalPrice, negotiation_id]
            );
        }

        const [messages] = await pool.query(
            'SELECT * FROM ai_negotiation_messages WHERE negotiation_id = ? ORDER BY created_at ASC',
            [negotiation_id]
        );

        res.json({ success: true, messages, availableOptions, finalPrice, status: newStatus });

    } catch (error) {
        console.error('Send negotiation message error:', error);
        res.status(500).json({ success: false, message: 'Failed to process message' });
    }
};

// ─── Get negotiated price for a product (used by cart) ───────────────────────
const getNegotiatedPrice = async (req, res) => {
    try {
        const userId = req.user.id;
        const productId = req.params.productId;

        const [negotiation] = await pool.query(
            `SELECT final_price FROM ai_negotiations
             WHERE user_id = ? AND product_id = ? AND status = 'accepted'
             ORDER BY updated_at DESC LIMIT 1`,
            [userId, productId]
        );

        if (negotiation.length > 0 && negotiation[0].final_price) {
            res.json({ success: true, hasNegotiatedPrice: true, negotiatedPrice: negotiation[0].final_price });
        } else {
            res.json({ success: true, hasNegotiatedPrice: false });
        }
    } catch (error) {
        console.error('Get negotiated price error:', error);
        res.status(500).json({ success: false, message: 'Failed to get negotiated price' });
    }
};

// ─── Seller: read negotiation rules ──────────────────────────────────────────
const getSellerNegotiationRules = async (req, res) => {
    try {
        const userId = req.user.id;
        const [company] = await pool.query('SELECT id FROM companies WHERE user_id = ? LIMIT 1', [userId]);
        if (company.length === 0) return res.status(403).json({ success: false, message: 'No company found' });

        const rules = await getSellerRules(company[0].id);
        res.json({ success: true, rules });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch rules' });
    }
};

// ─── Seller: save negotiation rules ──────────────────────────────────────────
const saveSellerNegotiationRules = async (req, res) => {
    try {
        const userId = req.user.id;
        const { rules } = req.body;

        if (!Array.isArray(rules)) {
            return res.status(400).json({ success: false, message: 'rules must be an array' });
        }

        const [company] = await pool.query('SELECT id FROM companies WHERE user_id = ? LIMIT 1', [userId]);
        if (company.length === 0) return res.status(403).json({ success: false, message: 'No company found' });

        const companyId = company[0].id;

        for (const rule of rules) {
            const pct = parseFloat(rule.discount_percent);
            if (isNaN(pct) || pct < 0 || pct > 100) {
                return res.status(400).json({ success: false, message: 'discount_percent must be between 0 and 100' });
            }
            if (rule.min_orders < 0) {
                return res.status(400).json({ success: false, message: 'min_orders must be >= 0' });
            }
            if (rule.max_orders !== null && rule.max_orders !== undefined && rule.max_orders < rule.min_orders) {
                return res.status(400).json({ success: false, message: 'max_orders must be >= min_orders or null' });
            }
        }

        await pool.query('DELETE FROM seller_negotiation_rules WHERE company_id = ?', [companyId]);

        if (rules.length > 0) {
            for (const r of rules) {
                await pool.query(
                    'INSERT INTO seller_negotiation_rules (company_id, min_orders, max_orders, discount_percent) VALUES (?, ?, ?, ?)',
                    [companyId, r.min_orders, r.max_orders || null, parseFloat(r.discount_percent)]
                );
            }
        }

        res.json({ success: true, message: 'Negotiation rules saved successfully' });
    } catch (error) {
        console.error('Save negotiation rules error:', error);
        res.status(500).json({ success: false, message: 'Failed to save rules' });
    }
};

module.exports = {
    startNegotiation,
    sendMessage,
    getNegotiatedPrice,
    getSellerNegotiationRules,
    saveSellerNegotiationRules,
};
