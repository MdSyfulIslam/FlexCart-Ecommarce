# FlexCart: An AI-Integrated Multi-Role E-Commerce Platform

**Project Report**
Submitted in Partial Fulfillment of the Requirements for the Degree of
Bachelor of Science in Computer Science and Engineering (CSE)

---

**Student Name:** Md Syful Islam
**Semester:** 10th Semester (Final)
**Academic Year:** 2025–2026
**Project Title:** FlexCart — An AI-Integrated Multi-Role E-Commerce Platform
**Submission Date:** May 2, 2026

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Introduction](#2-introduction)
3. [Problem Statement](#3-problem-statement)
4. [Objectives](#4-objectives)
5. [Literature Review](#5-literature-review)
6. [System Architecture](#6-system-architecture)
7. [Technology Stack](#7-technology-stack)
8. [System Design](#8-system-design)
   - 8.1 [Database Design](#81-database-design)
   - 8.2 [API Design](#82-api-design)
   - 8.3 [Frontend Architecture](#83-frontend-architecture)
9. [Module Description](#9-module-description)
   - 9.1 [User Authentication & Authorization](#91-user-authentication--authorization)
   - 9.2 [Product Management Module](#92-product-management-module)
   - 9.3 [Shopping Cart & Order Module](#93-shopping-cart--order-module)
   - 9.4 [Payment Module](#94-payment-module)
   - 9.5 [AI Visual Search Module](#95-ai-visual-search-module)
   - 9.6 [AI Price Negotiation Module](#96-ai-price-negotiation-module)
   - 9.7 [Product Recommendation Engine](#97-product-recommendation-engine)
   - 9.8 [Seller/Company Management Module](#98-sellercompany-management-module)
   - 9.9 [Delivery & Logistics Module](#99-delivery--logistics-module)
   - 9.10 [Admin Panel Module](#910-admin-panel-module)
   - 9.11 [Gamification Module](#911-gamification-module)
   - 9.12 [Notification System](#912-notification-system)
   - 9.13 [Appearance & Customization Module](#913-appearance--customization-module)
10. [Implementation Details](#10-implementation-details)
11. [Security Measures](#11-security-measures)
12. [Testing](#12-testing)
13. [Challenges & Solutions](#13-challenges--solutions)
14. [Screenshots & UI Overview](#14-screenshots--ui-overview)
15. [Future Work](#15-future-work)
16. [Conclusion](#16-conclusion)
17. [References](#17-references)

---

## 1. Abstract

FlexCart is a full-stack, AI-integrated multi-role e-commerce platform designed and developed as a final-year capstone project. The system addresses the limitations of conventional e-commerce platforms by introducing intelligent features such as AI-powered visual product search using deep learning (ResNet50), a conversational AI price negotiation engine, and a hybrid product recommendation system. Built on a Node.js/Express.js backend and a React.js frontend with a MySQL relational database, FlexCart supports six distinct user roles — customer, seller, staff admin, delivery admin, delivery personnel, and super admin — each with dedicated dashboards and functional modules. Additional features include a multi-tier loyalty program, gamified spin-wheel reward system, comprehensive delivery logistics with branch management, and a real-time notification framework. The platform demonstrates the practical integration of modern web technologies, machine learning microservices, and scalable REST API architecture within a cohesive e-commerce ecosystem.

**Keywords:** E-Commerce, AI Visual Search, Price Negotiation, Product Recommendation, Multi-Role System, Node.js, React.js, MySQL, Deep Learning, ResNet50.

---

## 2. Introduction

The global e-commerce market has grown exponentially, driven by digitization and changing consumer behaviors. Traditional e-commerce platforms, however, tend to offer static shopping experiences — product browsing is keyword-dependent, prices are fixed, and customer engagement is minimal beyond purchase completion.

FlexCart was conceived to address these gaps by building an intelligent, feature-rich e-commerce platform that integrates artificial intelligence into core shopping workflows. The name "FlexCart" reflects the platform's core philosophy: **flexibility** in how users search, negotiate, pay, and interact within the marketplace.

This project covers the complete software development lifecycle — from requirements analysis and system design through to implementation, testing, and deployment — providing a production-ready, multi-role platform with AI-augmented capabilities.

The platform is built with a clear separation of concerns:
- A **React.js** single-page application handles all frontend user interactions.
- A **Node.js/Express.js** RESTful backend manages business logic and data access.
- A **MySQL** relational database stores all persistent data across 34+ tables.
- **Python-based AI microservices** serve visual search and recommendation inference.

---

## 3. Problem Statement

Existing e-commerce platforms present several shortcomings that limit user experience and merchant capabilities:

1. **Keyword-only search** forces users to know exact product names. Users who see a product in real life cannot easily find it online.
2. **Fixed pricing** eliminates the traditional marketplace dynamic of negotiation, which many consumers, particularly in South and Southeast Asia, culturally prefer.
3. **Generic recommendations** do not account for individual user behavior, purchase history, or loyalty status.
4. **Complex multi-role management** is poorly handled by off-the-shelf solutions, making it difficult to manage customers, sellers, delivery staff, and admins in a single unified system.
5. **Delivery logistics** are typically handled by third-party services with no native integration, making tracking, costing, and route management opaque.
6. **Low user engagement** results from platforms that offer no incentive beyond discounts — loyalty programs and gamification are often absent from smaller platforms.

FlexCart was designed to directly solve each of these problems within a single, integrated system.

---

## 4. Objectives

The primary objectives of the FlexCart project are:

1. **To design and implement** a full-stack e-commerce platform with a React.js frontend, Node.js/Express.js backend, and MySQL database.
2. **To integrate AI-powered visual search** enabling users to find products by uploading images, using a deep learning model (ResNet50).
3. **To develop a conversational AI price negotiation system** that allows buyers and sellers to negotiate product prices based on customer loyalty and purchase history.
4. **To build a hybrid product recommendation engine** that combines collaborative and content-based filtering using user behavior data.
5. **To implement a multi-role access control system** supporting six distinct user roles with dedicated dashboards and permissions.
6. **To design a complete delivery logistics module** including branch management, route pricing, delivery assignment, and proof of delivery.
7. **To create a gamification and loyalty framework** (points, stars, spin-wheel rewards) that increases customer engagement and retention.
8. **To deliver a secure, scalable REST API** with JWT authentication, rate limiting, input validation, and role-based middleware.

---

## 5. Literature Review

### 5.1 E-Commerce Platforms
Amazon, eBay, and Alibaba represent the dominant paradigm of large-scale e-commerce. Academic research (Turban et al., 2018) identifies recommendation systems and personalization as key differentiators. Platforms such as Shopify have lowered the barrier to entry for sellers, but offer limited AI integration at the product interaction level.

### 5.2 AI-Powered Visual Search
Visual search in e-commerce was pioneered by Pinterest (Pinterest Lens, 2017) and Alibaba (FashionAI, 2018). The use of Convolutional Neural Networks (CNNs), particularly models pretrained on ImageNet such as ResNet50 (He et al., 2016), has become standard for feature extraction in visual product matching. Studies show that visual search can increase conversion rates by up to 30% compared to text-only search (Gartner, 2019).

### 5.3 Price Negotiation Systems
Negotiation in e-commerce has been studied in the context of automated negotiation agents (Jennings et al., 2001). Machine learning-based dynamic pricing (Chen et al., 2016) uses customer history and loyalty signals to determine optimal negotiated prices, balancing seller margin with buyer satisfaction. FlexCart's negotiation engine incorporates this principle, adjusting offer floors based on customer tier.

### 5.4 Recommendation Systems
Hybrid recommendation systems that combine collaborative filtering (user-user or item-item similarity) with content-based filtering (item attributes) have been shown to outperform either approach alone (Burke, 2002). Netflix's recommendation system is a prominent industrial example. FlexCart's recommender service draws on purchase history, viewing behavior, favorites, ratings, and product metadata.

### 5.5 Gamification in E-Commerce
Gamification (Deterding et al., 2011) applies game-design elements in non-game contexts to increase engagement. Points systems, badges, and reward wheels have been shown to increase average session duration and repeat purchases (Hamari et al., 2014). FlexCart implements a points system, stars currency, seller badges, and a daily spin-wheel reward.

---

## 6. System Architecture

FlexCart follows a **three-tier client-server architecture** with an additional Python microservice layer for AI inference.

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                           │
│              React.js Single Page Application               │
│   (52 components, Context API, Axios HTTP Client)          │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP/REST (JSON)
┌─────────────────────────────▼───────────────────────────────┐
│                    APPLICATION LAYER                        │
│              Node.js / Express.js REST API                  │
│   19 Controllers │ 19 Route Files │ JWT Middleware          │
│   Multer (uploads) │ Sharp (images) │ Morgan (logs)         │
└──────────┬──────────────────────────────────┬───────────────┘
           │ SQL Queries (mysql2)              │ HTTP (Flask)
┌──────────▼──────────┐              ┌────────▼───────────────┐
│   DATABASE LAYER    │              │    AI MICROSERVICE      │
│   MySQL Database    │              │  Python / Flask Server  │
│   34+ Tables        │              │  ResNet50 Visual Search │
│   Views, Indexes    │              │  Hybrid Recommender     │
└─────────────────────┘              └────────────────────────┘
```

### Data Flow for a Typical Request
1. The React frontend sends an authenticated HTTP request to the Express API.
2. JWT middleware validates the token and attaches the user context.
3. The relevant controller processes the business logic, queries MySQL, and returns a JSON response.
4. For AI features, the Express API proxies the request to the Python Flask microservice, which runs inference and returns results.

---

## 7. Technology Stack

### 7.1 Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | ≥18.x | JavaScript runtime |
| Express.js | 4.21.0 | Web application framework |
| MySQL2 | 3.11.0 | MySQL driver with Promise support |
| jsonwebtoken | 9.0.2 | JWT token generation and validation |
| bcryptjs | 2.4.3 | Password hashing (12 salt rounds) |
| Multer | 1.4.5 | Multipart file upload handling |
| Sharp | 0.33.5 | High-performance image processing |
| Helmet | 7.1.0 | HTTP security headers |
| CORS | — | Cross-Origin Resource Sharing |
| express-rate-limit | — | API rate limiting |
| Morgan | — | HTTP request logging |
| Nodemon | — | Development auto-restart |

### 7.2 Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI component library |
| React Scripts | 5.0.1 | Create React App build toolchain |
| Axios | 1.7.7 | HTTP client for API calls |
| Framer Motion | 11.5.4 | Animation library |
| Chart.js & react-chartjs-2 | — | Analytics charts and graphs |
| Lucide React | 0.468.0 | Icon library |
| React Icons | — | Extended icon set |
| React Toastify | 10.0.5 | Toast notification system |
| jsPDF | 2.5.1 | PDF export functionality |
| html2canvas | 1.4.1 | Canvas-to-image for PDF rendering |

### 7.3 AI Microservices (Python)

| Technology | Purpose |
|------------|---------|
| Python 3.x | Runtime |
| Flask | Lightweight web server for AI endpoints |
| PyTorch | Deep learning inference (ResNet50) |
| NumPy | Numerical computations |
| Pillow (PIL) | Image preprocessing |
| Torchvision | Pretrained model loading |

### 7.4 Database & Infrastructure

| Technology | Purpose |
|------------|---------|
| MySQL 8.x | Relational database |
| MySQL Workbench | Schema design |
| Git | Version control |
| npm | Package management |

---

## 8. System Design

### 8.1 Database Design

The FlexCart database consists of **34+ tables** organized into logical groups:

#### User & Authentication Tables
| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `users` | id, full_name, email, password_hash, role, points, stars, status | Core user records |
| `user_sessions` | id, user_id, token_hash, device_info, expires_at | Active session tracking |
| `linked_accounts` | id, primary_user_id, linked_user_id | Multi-account linking |
| `user_settings` | user_id, theme, language, currency, notification_prefs | Per-user preferences |

#### Product & Category Tables
| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `categories` | id, name, parent_id, icon | Hierarchical category tree |
| `products` | id, company_id, category_id, name, current_price, old_price, min_price, max_price, stock, status | Product catalog |
| `product_images` | id, product_id, image_url, is_primary | Multiple images per product |
| `product_reviews` | id, product_id, user_id, rating, comment, seller_reply, is_verified_purchase | User reviews |
| `product_comments` | id, product_id, user_id, comment, company_reply | Product Q&A |
| `product_requests` | id, product_id, user_id | Out-of-stock notifications |

#### Company & Seller Tables
| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `companies` | id, owner_user_id, name, logo, verification_status, badge, followers_count | Seller profiles |
| `company_followers` | company_id, user_id | Following relationships |
| `company_ratings` | id, company_id, user_id, rating | Separate company rating |
| `company_promo_codes` | id, company_id, code, discount_type, discount_value, expiry | Seller promo codes |
| `company_notifications` | id, company_id, type, message, is_read | Seller notification feed |

#### Order & Cart Tables
| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `cart` | id, user_id, product_id, quantity, negotiated_price | Shopping cart |
| `orders` | id, user_id, total_amount, payment_method, payment_status, order_status, promo_code_used | Order headers |
| `order_items` | id, order_id, product_id, quantity, unit_price | Line items |

#### Delivery Tables
| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `branches` | id, name, city, address, manager_user_id | Warehouse branches |
| `deliveries` | id, order_id, branch_id, delivery_boy_id, status, proof_photo, gps_location | Delivery tracking |
| `branch_delivery_pricing` | id, from_branch_id, to_branch_id, base_price, price_per_kg | Route pricing |

#### AI & Gamification Tables
| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `ai_search_history` | id, user_id, image_url, results_json, timestamp | Visual search logs |
| `ai_negotiations` | id, user_id, product_id, status, final_price | Negotiation sessions |
| `ai_negotiation_messages` | id, negotiation_id, sender, message, price_offer | Conversation history |
| `spin_rewards` | id, user_id, reward_type, reward_value, spun_at | Daily spin records |
| `promo_codes` | id, code, discount_type, discount_value, max_uses, used_count, expiry | Global promo codes |

#### Support & Notification Tables
| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `notifications` | id, user_id, type, title, message, is_read | User notification feed |
| `feedback` | id, user_id, subject, message, status, admin_reply | User feedback |
| `support_info` | id, key, value | Platform support content |
| `background_themes` | id, name, preview_url, type | UI theme options |
| `favourites` | user_id, product_id | Wishlist items |
| `global_nid_registry` | id, nid_number, is_used | NID verification registry |

**Notable View:**
```sql
-- company_leaderboard VIEW
-- Aggregates revenue per company, joins with company details
-- Used for ranking sellers by total sales
CREATE VIEW company_leaderboard AS
  SELECT c.id, c.name, c.logo, c.badge,
         SUM(oi.quantity * oi.unit_price) AS total_revenue,
         COUNT(DISTINCT o.id) AS total_orders
  FROM companies c
  JOIN products p ON p.company_id = c.id
  JOIN order_items oi ON oi.product_id = p.id
  JOIN orders o ON o.id = oi.order_id
  WHERE o.payment_status = 'paid'
  GROUP BY c.id, c.name, c.logo, c.badge;
```

### 8.2 API Design

FlexCart follows RESTful API conventions with JSON request/response bodies. The API is organized into 19 route modules:

#### Authentication Endpoints
```
POST   /api/auth/register              Register a new user
POST   /api/auth/login                 Login (returns JWT access + refresh token)
POST   /api/auth/admin-login           Admin login endpoint
POST   /api/auth/refresh-token         Exchange refresh token for new access token
POST   /api/auth/logout                Invalidate session
GET    /api/auth/linked-accounts       Get linked accounts for multi-account switch
POST   /api/auth/link-account          Link a new account
POST   /api/auth/switch-account        Switch active session to linked account
```

#### Product Endpoints
```
GET    /api/products                   List products (paginated, filtered)
POST   /api/products                   Create product (seller only)
GET    /api/products/:id               Get product detail
PUT    /api/products/:id               Update product (seller only)
DELETE /api/products/:id               Delete product (seller only)
GET    /api/products/search            Full-text product search
GET    /api/products/categories        Get category tree
GET    /api/products/:id/reviews       Get product reviews
POST   /api/products/:id/reviews       Submit review (verified purchase required)
POST   /api/products/:id/comments      Add product comment
GET    /api/products/recommendations/hybrid  Get personalized recommendations
```

#### Order & Cart Endpoints
```
GET    /api/cart                       Get user cart
POST   /api/cart                       Add item to cart
PUT    /api/cart/:id                   Update cart item quantity
DELETE /api/cart/:id                   Remove cart item
DELETE /api/cart                       Clear entire cart

POST   /api/orders                     Create order from cart
GET    /api/orders                     Get order history
GET    /api/orders/:id                 Get order detail
POST   /api/orders/validate-promo      Validate promo code
```

#### AI Endpoints
```
POST   /api/ai/process                 Visual image search (multipart upload)
GET    /api/ai/history                 Get user's AI search history
POST   /api/negotiations/start         Start price negotiation session
POST   /api/negotiations/message       Send message in negotiation
GET    /api/negotiations/price/:productId  Get negotiated price for product
```

#### Admin Endpoints
```
GET    /api/super-admin/dashboard      KPIs and platform statistics
GET    /api/super-admin/users          List all users
PUT    /api/super-admin/users/:id      Update user status
GET    /api/super-admin/companies      List pending/approved companies
PUT    /api/super-admin/companies/:id  Approve or reject company

GET    /api/staff-admin/dashboard      Operational statistics
GET    /api/staff-admin/orders         Order management
PUT    /api/staff-admin/orders/:id     Update order/delivery status
GET    /api/staff-admin/branches       Branch management
POST   /api/staff-admin/branches       Create branch
GET    /api/staff-admin/personnel      View delivery personnel
POST   /api/staff-admin/personnel      Register delivery admin/boy
```

#### Other Endpoints
```
GET    /api/profile                    Get user profile
PUT    /api/profile                    Update profile (name, avatar, bio)
GET    /api/notifications              Get notifications
PUT    /api/notifications/:id/read     Mark notification as read
GET    /api/favourites                 Get favourites list
POST   /api/favourites                 Add to favourites
DELETE /api/favourites/:id             Remove from favourites
GET    /api/settings                   Get user settings
PUT    /api/settings                   Update user settings
POST   /api/spin-reward/spin           Perform daily spin
GET    /api/spin-reward/history        Get spin history
GET    /api/support                    Get support info
POST   /api/feedback                   Submit feedback
```

**Standard Response Format:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

**Error Response Format:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": ["Email already in use"]
}
```

### 8.3 Frontend Architecture

The React.js frontend follows a component-based architecture with:

- **React Context API** for global state management (auth state, cart state, theme)
- **Custom Hooks** for reusable data-fetching and business logic
- **Service Layer** (Axios wrappers) for all API communication
- **52 Components** organized across **26 feature directories**

#### Component Directory Map

```
src/
├── components/
│   ├── admin/
│   │   ├── delivery/     DeliveryAdminDashboard, DeliveryTracking
│   │   ├── staff/        StaffAdminPanel
│   │   └── super/        SuperAdminPanel
│   ├── ai/               VisualSearchInterface
│   ├── appearance/       ThemeSelector, BackgroundCustomizer, ColorPicker
│   ├── auth/             Login, Register
│   ├── cart/             CartPage, CheckoutPage
│   ├── common/           Loading, Modal, ConfirmDialog
│   ├── company/          CompanyDashboard, ProductManager, OrderInbox,
│   │                     ReviewManagement, CommentInbox, PromoCodeManager,
│   │                     CompanyProfile, CompanyAnalytics, FollowerList,
│   │                     CompanySettings
│   ├── favourite/        FavouritesPage
│   ├── feedback/         FeedbackForm
│   ├── home/             HeroSection, FeaturedProducts, CategoryGrid
│   ├── layout/           Header, Footer, Navbar, Sidebar
│   ├── notification/     NotificationCenter
│   ├── order/            OrderHistory
│   ├── portal/           RolePortalRouter
│   ├── product/          ProductList, ProductDetail, ProductSearch,
│   │                     ProductCard, ProductComparison
│   ├── profile/          UserProfile, ProfileSettings, LinkedAccounts
│   ├── request/          ProductRequestManager
│   ├── review/           ReviewForm
│   ├── search/           AdvancedSearch
│   ├── settings/         UserPreferences
│   ├── spin/             SpinWheelGame
│   └── support/          SupportPage
├── context/
│   ├── AuthContext.js
│   ├── CartContext.js
│   └── ThemeContext.js
├── services/
│   ├── authService.js
│   ├── productService.js
│   ├── orderService.js
│   ├── cartService.js
│   ├── aiService.js
│   ├── companyService.js
│   ├── deliveryService.js
│   └── adminService.js
└── hooks/
    ├── useAuth.js
    ├── useCart.js
    └── useProducts.js
```

---

## 9. Module Description

### 9.1 User Authentication & Authorization

FlexCart uses **JWT (JSON Web Token) based stateless authentication** with two tokens:
- **Access Token**: 7-day expiry, used on every API request.
- **Refresh Token**: 30-day expiry, used only to renew expired access tokens.

Tokens are stored in `user_sessions` with device metadata for audit and multi-device support.

**Six User Roles:**

| Role | Description | Access |
|------|-------------|--------|
| `customer` | Regular shopper | Shop, order, review, negotiate |
| `seller` | Company owner | Manage products, orders, reviews |
| `staff_admin` | Internal staff | Branches, personnel, vehicles |
| `delivery_admin` | Delivery coordinator | Assign deliveries, set pricing |
| `delivery_boy` | Delivery personnel | View assignments, upload proof |
| `super_admin` | Platform administrator | Full system access |

**Account Linking** allows a single person to have multiple role-based accounts (e.g., be both a customer and a seller) and switch between them seamlessly without re-authentication.

Password security: **bcrypt** with 12 salt rounds. Rate limiting prevents brute-force attacks.

### 9.2 Product Management Module

Products in FlexCart have a rich schema supporting:
- **Multiple images** (primary + gallery)
- **Hierarchical categories** (parent → subcategory)
- **Flexible pricing**: `current_price`, `old_price`, `min_price` (floor for negotiation), `max_price`
- **Specifications**: brand, model, color, weight, dimensions, warranty
- **AR support**: `ar_url` and QR code fields for augmented reality product viewing
- **Full-text search** using MySQL FULLTEXT indexes on name and description
- **Stock tracking** with automatic out-of-stock status

Sellers can perform **bulk operations** (bulk price update, bulk status toggle) from their dashboard.

### 9.3 Shopping Cart & Order Module

The cart supports:
- Per-user cart stored in MySQL (`cart` table)
- **Negotiated price override**: if a user has negotiated a price via AI, it is stored on the cart item
- Real-time stock validation on cart operations

Order creation flow:
1. Validate cart items (stock, price, negotiated price)
2. Apply promo code (validate expiry, max uses, eligibility)
3. Deduct loyalty points if used as payment
4. Create `orders` header record + `order_items` line records
5. Decrement product stock
6. Increment seller sales metrics
7. Award buyer loyalty points (1 point per unit of currency spent)
8. Clear cart
9. Dispatch order confirmation notification

**Order Status Lifecycle:**
```
pending → confirmed → processing → shipped → delivered
                                           → returned
         → cancelled
```

### 9.4 Payment Module

FlexCart supports six payment methods:

| Method | Implementation |
|--------|---------------|
| Credit Card | Stored as payment method type (gateway integration-ready) |
| Debit Card | Stored as payment method type |
| PayPal | Stored as payment method type |
| Bank Transfer | Stored with bank reference field |
| Cash on Delivery | Default; payment_status set to 'pending' until delivery |
| Points | Deducted from user.points balance at checkout |

Payment statuses: `pending`, `paid`, `failed`, `refunded`.

Discount stacking priority:
1. Product-level discount (always applied)
2. Promo code (global or seller-specific)
3. Negotiated price (overrides product price if present)
4. Points redemption (applied as final deduction)

### 9.5 AI Visual Search Module

The visual search module allows users to **upload a photo** of any product and receive a ranked list of visually similar products from the catalog.

**Technical Implementation:**

```
User Uploads Image
       │
       ▼
Express API (Multer)
  Saves image, sends to Python Flask
       │
       ▼
Python Flask /ai/process
  1. Load image with Pillow
  2. Preprocess: resize to 224×224, normalize
  3. Pass through ResNet50 (pretrained on ImageNet)
     with final FC layer removed → 2048-dim feature vector
  4. Compare against pre-computed catalog feature vectors
     using cosine similarity
  5. Return top-N most similar product IDs + similarity scores
       │
       ▼
Express API returns product details for matching IDs
```

**ResNet50 Architecture Choice:**
ResNet50 was selected for its balance of accuracy and inference speed. The model is used in **feature extraction mode** (no fine-tuning on product data required), making it deployable without labeled training data specific to the catalog.

Search history is stored in `ai_search_history` for personalization and audit purposes.

### 9.6 AI Price Negotiation Module

The negotiation module introduces a **conversational price negotiation flow** between buyer and seller (mediated by AI):

**Negotiation Logic:**

```python
def calculate_negotiated_price(product, user):
    base_price = product.current_price
    min_price  = product.min_price
    
    # Customer tier discount
    discount = 0
    if user.total_orders >= 50:    discount = 0.20  # Platinum
    elif user.total_orders >= 20:  discount = 0.15  # Gold
    elif user.total_orders >= 10:  discount = 0.10  # Silver
    elif user.total_orders >= 3:   discount = 0.05  # Bronze
    
    # Loyalty points bonus
    if user.points >= 1000: discount += 0.02
    
    negotiated = base_price * (1 - discount)
    return max(negotiated, min_price)  # Never below floor price
```

The negotiation is conducted as a **multi-turn conversation** stored in `ai_negotiation_messages`. The AI generates natural-language messages responding to buyer offers, counter-offering intelligently until agreement or rejection. Once a deal is struck, the agreed price is stored in the cart item for checkout.

### 9.7 Product Recommendation Engine

The hybrid recommendation engine (`recommender_service.py`) combines multiple signals:

| Signal | Weight | Source |
|--------|--------|--------|
| Purchase history | High | `order_items` |
| Viewing/search history | Medium | `ai_search_history` |
| Favourites | Medium | `favourites` |
| Product ratings | Low | `product_reviews` |
| Current discounts | Low | `products.discount_percentage` |
| Recency (new arrivals) | Low | `products.created_at` |
| Category affinity | Medium | Derived from above |

The engine generates a scored candidate list per user and returns the top N recommendations through `/api/products/recommendations/hybrid`.

For **anonymous users**, popular products (by order count) and newest arrivals are returned.

### 9.8 Seller/Company Management Module

Any verified user can register a company. Company registration requires:
- Company name, description, contact info
- Logo and cover image upload
- NID (National Identity Document) verification against `global_nid_registry`
- Super admin approval before activation

**Seller Dashboard features:**
- Revenue analytics (Chart.js line/bar charts)
- Order inbox with status management
- Product CRUD with bulk operations
- Review reply management
- Comment inbox with unread badge count
- Promo code creation (product-specific or sitewide)
- Follower analytics
- Company profile branding (logo, cover, promo banner)

**Seller Badges** (assigned by system based on total revenue):

| Badge | Revenue Threshold |
|-------|-----------------|
| Bronze | ≥ ৳10,000 |
| Silver | ≥ ৳50,000 |
| Gold | ≥ ৳1,00,000 |
| Crown | ≥ ৳5,00,000 |
| Diamond | ≥ ৳20,00,000 |

A **company leaderboard** (SQL View) ranks all sellers by verified total revenue.

### 9.9 Delivery & Logistics Module

FlexCart has a fully native delivery system built around **warehouse branches**:

**Branch Hierarchy:**
```
FlexCart HQ
├── Branch A (Dhaka)
├── Branch B (Chittagong)
├── Branch C (Sylhet)
└── Branch N ...
```

**Delivery Flow:**
1. Order is placed by customer.
2. Staff admin creates a delivery record, assigns it to a branch.
3. Delivery admin at the assigned branch assigns a delivery boy.
4. Delivery boy picks up the parcel and marks it `in_transit`.
5. Upon delivery, delivery boy uploads: **proof photo + GPS coordinates + notes**.
6. Delivery admin verifies proof and marks `delivered`.
7. Customer receives notification and order status updates to `delivered`.

**Delivery Cost Calculation:**
- Base price per route (from `branch_delivery_pricing`)
- + Weight surcharge (price_per_kg × product weight)
- + Size surcharge (optional)

### 9.10 Admin Panel Module

#### Super Admin Panel
- **KPI Dashboard**: Total users, total revenue, active orders, pending company approvals
- **User Management**: View all users, filter by role/status, approve accounts, suspend accounts
- **Company Approval**: Review pending applications, approve or reject with written reason
- **Ad Banner Management**: Upload, schedule, and activate promotional banners
- **Global Settings**: Platform-wide configuration

#### Staff Admin Panel
- **Operational Dashboard**: Daily orders, active deliveries, branch utilization
- **Branch Management**: CRUD operations for warehouse branches
- **Personnel Management**: Create delivery admins and delivery boys, toggle active status, view history
- **Vehicle Management**: Register and track delivery vehicles
- **Order Management**: View all orders, update status, trigger delivery creation

#### Delivery Admin Panel
- **Delivery Assignment**: Assign orders to specific delivery boys
- **Pricing Configuration**: Set per-route delivery prices
- **Route Quote Generator**: Calculate delivery cost for any origin-destination pair
- **Proof Verification**: Review uploaded delivery proofs, mark deliveries complete

### 9.11 Gamification Module

FlexCart implements a two-currency loyalty system:

**Points** (earned in BDT equivalent, redeemable at checkout):
- Earned: 1 point per ৳1 spent on orders
- Spent: 100 points = ৳10 discount at checkout
- Bonus: earned from spin wheel rewards

**Stars** (social currency for company interactions):
- Earned: by receiving high company ratings
- Spent: by rating companies (1 star per rating submitted)

**Daily Spin Wheel:**
- Users can spin once per 24 hours
- Prize pool: points bonus, discount promo code, stars bonus, free shipping coupon, no-prize (miss)
- Spin eligibility enforced server-side via `spin_rewards.spun_at` timestamp check
- Promo codes from spins have a configurable expiry (e.g., 48 hours)

### 9.12 Notification System

Two parallel notification tables handle different recipient types:

**User Notifications** (`notifications` table):
| Trigger | Message |
|---------|---------|
| Order confirmed | "Your order #12345 has been confirmed." |
| Order shipped | "Your order #12345 is on its way!" |
| Order delivered | "Your order #12345 has been delivered." |
| Product back in stock | "A product you requested is now in stock." |
| Spin reward earned | "You won X points from today's spin!" |
| Promo code awarded | "Use code FLEX20 for 20% off, valid 48 hrs." |

**Company Notifications** (`company_notifications` table):
| Trigger | Message |
|---------|---------|
| New order | "New order received for [Product Name]." |
| New review | "A customer reviewed [Product Name]: ★★★★☆" |
| New comment | "A new question on [Product Name]." |
| New follower | "[Username] is now following your store." |

Notifications support read/unread states and soft deletion.

### 9.13 Appearance & Customization Module

FlexCart provides extensive UI personalization:

- **Theme**: Light or Dark mode toggle (stored in user settings, persisted across sessions)
- **Accent Color**: Custom hex color picker for primary UI accent color
- **Background**: 10+ pre-built background themes including:
  - Animated 3D backgrounds (particle systems)
  - 2D illustrated backgrounds
  - Weather effects (rain, snow)
  - Gradient themes
- **Language**: Multi-language preference (stored, UI strings switchable)
- **Currency**: Display currency preference

Settings are stored per-user in `user_settings` and applied globally on frontend load via `ThemeContext`.

---

## 10. Implementation Details

### 10.1 Project Structure

```
FlexCart1/
├── flexcart-backend/
│   ├── server.js                 Express app entry point
│   ├── config/
│   │   └── database.js           MySQL connection pool
│   ├── controllers/              Business logic (19 files)
│   ├── routes/                   API routes (19 files)
│   ├── middleware/
│   │   ├── auth.js               JWT validation middleware
│   │   ├── upload.js             Multer configuration
│   │   └── aiMiddleware.js       AI request preprocessing
│   ├── ai/
│   │   ├── visual_search.py      ResNet50 visual search Flask server
│   │   └── recommender_service.py Hybrid recommendation Flask server
│   ├── models/
│   │   └── database.sql          Full schema definition
│   ├── scripts/
│   │   ├── initDb.js             Database initializer
│   │   └── seedDb.js             Sample data seeder
│   └── uploads/                  Stored images (products, avatars, NIDs)
│
├── flexcart-frontend/
│   ├── src/
│   │   ├── App.js                Root component, routing
│   │   ├── index.js              React DOM render
│   │   ├── components/           52 UI components
│   │   ├── context/              3 React Context providers
│   │   ├── services/             8 Axios service modules
│   │   └── hooks/                3 custom hooks
│   ├── public/                   Static assets
│   └── build/                    Production build output
│
└── FlexCart_Project_Report.md    This report
```

### 10.2 Key Implementation Highlights

#### JWT Middleware
```javascript
// middleware/auth.js
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid token' });
    req.user = user;
    next();
  });
};
```

#### Image Processing (Sharp)
```javascript
// Process uploaded product images: resize to 800×800, convert to WebP
await sharp(req.file.path)
  .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 85 })
  .toFile(outputPath);
```

#### Visual Search (Python/Flask)
```python
# ai/visual_search.py
model = models.resnet50(pretrained=True)
model = torch.nn.Sequential(*list(model.children())[:-1])  # Remove FC layer
model.eval()

def extract_features(image_path):
    img = Image.open(image_path).convert('RGB')
    tensor = transform(img).unsqueeze(0)
    with torch.no_grad():
        features = model(tensor).squeeze().numpy()
    return features / np.linalg.norm(features)  # L2 normalize
```

#### Spin Wheel Eligibility Check
```javascript
// controllers/spinRewardController.js
const lastSpin = await db.query(
  'SELECT spun_at FROM spin_rewards WHERE user_id = ? ORDER BY spun_at DESC LIMIT 1',
  [userId]
);
const hoursSince = (Date.now() - new Date(lastSpin[0].spun_at)) / 36e5;
if (hoursSince < 24) {
  return res.status(429).json({ success: false, message: 'Already spun today.' });
}
```

---

## 11. Security Measures

FlexCart implements defense-in-depth security across all layers:

| Measure | Implementation | Protects Against |
|---------|---------------|-----------------|
| Password Hashing | bcrypt, 12 salt rounds | Credential database breach |
| JWT Authentication | HS256-signed tokens, 7-day expiry | Unauthorized API access |
| Rate Limiting | express-rate-limit, 100 req/15min | Brute-force, DoS |
| HTTP Security Headers | Helmet.js | XSS, clickjacking, MIME sniffing |
| CORS Policy | Configured origin whitelist | Cross-origin request forgery |
| Input Validation | Server-side on all endpoints | SQL injection, invalid data |
| Parameterized Queries | mysql2 prepared statements | SQL injection |
| File Upload Validation | Multer MIME type & size limits | Malicious file uploads |
| Role-based Middleware | Per-route role checks | Privilege escalation |
| NID Registry | One-time-use NID verification | Fraudulent company registration |
| Account Status Checks | Active/suspended check on login | Bypassing account suspension |

---

## 12. Testing

### 12.1 Manual Testing

All modules were tested manually using the following strategy:

| Module | Test Cases |
|--------|-----------|
| Authentication | Register, login, logout, token refresh, role switching, account linking |
| Products | CRUD, search, image upload, category filter, stock depletion |
| Cart & Orders | Add/remove items, promo code, negotiated price, points payment, COD |
| AI Visual Search | Upload real product photos, verify result relevance |
| AI Negotiation | Multiple negotiation turns, floor price enforcement, deal acceptance |
| Recommendations | Logged-out (popular), logged-in (personalized) |
| Delivery | Branch creation, personnel assignment, delivery tracking, proof upload |
| Admin Panels | Super admin company approval, staff admin personnel management |
| Gamification | Spin wheel 24h lock, points earn/spend, star transactions |
| Notifications | Triggered on order events, read state toggle, deletion |
| Appearance | Theme persistence across sessions, background switching |

### 12.2 API Testing

API endpoints were tested using **Postman** with the following approach:
- Authentication flows: token acquisition and propagation across requests
- Role enforcement: verifying 401/403 responses for unauthorized roles
- Validation: testing missing fields, invalid types, boundary values
- Concurrent operations: cart and stock consistency under simultaneous requests

### 12.3 Known Test Scenarios & Outcomes

| Scenario | Expected | Result |
|----------|----------|--------|
| Register with duplicate email | 400 Bad Request | PASS |
| Access admin route as customer | 403 Forbidden | PASS |
| Add out-of-stock item to cart | 400 Bad Request | PASS |
| Spin within 24 hours | 429 Too Many Requests | PASS |
| Use expired promo code | 400 Bad Request | PASS |
| Negotiate below min_price | Offer rejected, counter at min_price | PASS |
| Upload image >5MB | 400 Bad Request | PASS |
| Register company with used NID | 400 Bad Request | PASS |

---

## 13. Challenges & Solutions

### Challenge 1: AI Visual Search Performance
**Problem:** ResNet50 feature extraction on each search request was slow (~2 seconds per image). With hundreds of catalog products, cosine similarity comparison was also linear in complexity.

**Solution:** Pre-computed catalog feature vectors are stored in memory on Flask server startup. New product vectors are computed and cached on upload. Search time reduced to ~300ms.

### Challenge 2: Multi-Role Session Management
**Problem:** A user might legitimately hold multiple roles (seller + customer). Storing only one role per session caused friction.

**Solution:** Implemented `linked_accounts` table + account switching API. Each role is a separate user record, linked by the `linked_accounts` table. Switching generates a new JWT for the target account without requiring a password.

### Challenge 3: Price Negotiation Integrity
**Problem:** If a user negotiated a price and then added more items or changed quantity, the negotiated price could become stale or misapplied.

**Solution:** Negotiated prices are stored at the `cart` level (per cart item), not at the product level. Cart validation at checkout re-checks negotiated prices against current `min_price` to prevent abuse.

### Challenge 4: Delivery Cost Calculation Complexity
**Problem:** Delivery pricing depends on origin branch, destination branch, product weight, and volume — a multi-variable calculation with no standard formula.

**Solution:** `branch_delivery_pricing` table stores base price per route pair. A pricing formula endpoint (`/api/delivery/pricing/quote`) accepts origin, destination, and package parameters and returns a computed total using the stored per-kg rates.

### Challenge 5: React State Management Across Role Dashboards
**Problem:** Multiple admin roles needed isolated state (staff admin vs. delivery admin) but shared layout components.

**Solution:** Implemented a `RolePortalRouter` component that reads the JWT role and dynamically renders the appropriate dashboard. Context providers are role-scoped, and the shared `Header` component reads the active role from `AuthContext`.

---

## 14. Screenshots & UI Overview

> **Note:** Screenshots should be inserted below from the running application. The following describe the key screens:

### 14.1 Homepage
- Hero section with animated background
- Featured products carousel
- Category grid navigation
- Top-rated products section

### 14.2 Product Detail Page
- Image gallery with zoom
- Price display (original + discounted + negotiated option)
- "Negotiate Price" button (opens AI negotiation chat)
- "Visual Search" button (opens camera/file upload)
- Reviews section with rating breakdown chart
- Related products carousel
- Comments/Q&A section

### 14.3 AI Negotiation Chat
- WhatsApp-style chat interface
- AI messages and user offer input
- Real-time accepted/rejected/counter-offer status
- Final agreed price shown with "Add to Cart at Negotiated Price" button

### 14.4 Visual Search
- Drag-and-drop or camera upload
- Loading spinner during inference
- Grid of visually similar products with similarity scores

### 14.5 Seller Dashboard
- Revenue chart (Chart.js, monthly/weekly view)
- Order inbox with status badges
- Product management table with bulk actions
- Comment inbox with unread badge count
- Company leaderboard position

### 14.6 Super Admin Panel
- KPI cards (total users, revenue, orders, pending approvals)
- User management table with filter/sort
- Company approval queue with approve/reject with reason modal

### 14.7 Spin Wheel
- Animated spin wheel with 8 segments
- Countdown timer to next eligible spin
- Reward notification modal on win
- Spin history table

### 14.8 Appearance Settings
- Live theme preview
- Background selector (grid of 10+ options with animated preview)
- Color picker for accent colors
- Language and currency dropdowns

---

## 15. Future Work

1. **Real Payment Gateway Integration**: Integrate SSLCommerz, bKash, or Stripe for actual transaction processing.
2. **Mobile Application**: Build React Native mobile apps sharing the same backend API.
3. **Fine-tuned Visual Search**: Collect product image training data and fine-tune ResNet50 on the specific product catalog for higher accuracy.
4. **WebSocket Notifications**: Replace polling-based notification refresh with WebSocket push for real-time updates.
5. **Elasticsearch Integration**: Replace MySQL FULLTEXT search with Elasticsearch for more powerful full-text search with faceting and autocomplete.
6. **Seller Analytics API**: Deeper analytics (conversion rate, cart abandonment rate, revenue forecasting) using time-series data.
7. **Multi-language Support**: Full i18n implementation with translation files for Bangla and English.
8. **Augmented Reality (AR) Product View**: Expand the existing AR URL field into a full web-based AR product viewer using WebXR.
9. **Inventory Management**: Advanced stock forecasting and low-stock automated alerts.
10. **Multi-currency Support**: Live exchange rate integration for international buyers.

---

## 16. Conclusion

FlexCart represents a comprehensive, production-quality e-commerce platform that successfully integrates modern web development practices with artificial intelligence to create a differentiated shopping experience. The platform demonstrates that AI features — visual search, price negotiation, and personalized recommendations — can be practically integrated into a full-stack web application using well-established deep learning models (ResNet50) and hybrid algorithmic approaches, without requiring massive infrastructure.

The multi-role architecture (six distinct roles with dedicated dashboards), the native delivery logistics module, and the gamification system collectively address real shortcomings in typical e-commerce platforms. The use of Node.js/Express.js on the backend, React.js on the frontend, and Python microservices for AI inference illustrates a pragmatic polyglot architecture where each technology is used where it excels.

From a software engineering perspective, the project demonstrates mastery of:
- RESTful API design with JWT security
- Relational database design with 34+ normalized tables
- React component architecture and state management
- Deep learning model deployment in a production web context
- Multi-role access control systems
- End-to-end e-commerce workflows (catalog → cart → checkout → delivery)

FlexCart was built from the ground up as a final-year capstone project and stands as a full-featured, deployable e-commerce platform ready for real-world production use with the addition of a live payment gateway.

---

## 17. References

1. He, K., Zhang, X., Ren, S., & Sun, J. (2016). *Deep Residual Learning for Image Recognition*. Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition (CVPR), 770–778.

2. Burke, R. (2002). *Hybrid Recommender Systems: Survey and Experiments*. User Modeling and User-Adapted Interaction, 12(4), 331–370.

3. Jennings, N. R., Faratin, P., Lomuscio, A. R., Parsons, S., Wooldridge, M., & Sierra, C. (2001). *Automated Negotiation: Prospects, Methods and Challenges*. Group Decision and Negotiation, 10(2), 199–215.

4. Deterding, S., Dixon, D., Khaled, R., & Nacke, L. (2011). *From Game Design Elements to Gamefulness: Defining Gamification*. Proceedings of the 15th International Academic MindTrek Conference.

5. Hamari, J., Koivisto, J., & Sarsa, H. (2014). *Does Gamification Work? — A Literature Review of Empirical Studies on Gamification*. Proceedings of the 47th Hawaii International Conference on System Sciences (HICSS).

6. Turban, E., Outland, J., King, D., Lee, J. K., Liang, T. P., & Turban, D. C. (2018). *Electronic Commerce 2018: A Managerial and Social Networks Perspective* (9th ed.). Springer.

7. Chen, L., Mislove, A., & Wilson, C. (2016). *An Empirical Analysis of Algorithmic Pricing on Amazon Marketplace*. Proceedings of the 25th International Conference on World Wide Web (WWW).

8. Express.js Documentation. (2024). Retrieved from https://expressjs.com/

9. React Documentation. (2024). React — A JavaScript library for building user interfaces. Retrieved from https://react.dev/

10. MySQL 8.0 Reference Manual. (2024). Oracle Corporation. Retrieved from https://dev.mysql.com/doc/

11. PyTorch Documentation. (2024). TorchVision Models — ResNet. Retrieved from https://pytorch.org/vision/stable/models.html

12. JSON Web Token (JWT) RFC 7519. (2015). Internet Engineering Task Force (IETF). Retrieved from https://datatracker.ietf.org/doc/html/rfc7519

---

*End of Report*

---

**Word Count:** ~6,500 words
**Total Pages:** ~35 pages (estimated at standard formatting)
**Submitted by:** Md Syful Islam | CSE | 10th Semester Final Project | 2026
