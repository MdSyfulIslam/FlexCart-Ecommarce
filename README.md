# FlexCart — E-Commerce Platform

A full-stack e-commerce web application with real-time features, AI-powered product recommendations, visual search, and multi-role admin panels.

**Live Demo:**
- Frontend: [flex-cart-main.vercel.app](https://flex-cart-main.vercel.app)
- Backend API: [flex-cart-main.onrender.com](https://flex-cart-main.onrender.com)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vanilla CSS, Framer Motion, Socket.IO Client |
| Backend | Node.js, Express.js, Socket.IO |
| Database | PostgreSQL (Supabase) |
| Auth | JWT (Access + Refresh tokens) |
| File Uploads | Multer + Cloudinary |
| AI Services | Python (ResNet50 visual search, hybrid recommender) |
| Deployment | Vercel (frontend) · Render (backend) |

---

## Features

- **Product Listings** — Search, filter by category, drag-to-cart
- **AI Recommendations** — Hybrid collaborative + content-based recommender
- **Visual Search** — Upload an image to find similar products (ResNet50)
- **Real-time Notifications** — Socket.IO powered live updates
- **Price Negotiation** — Buyers can negotiate with sellers
- **Spin Reward** — Daily spin wheel for discount coupons
- **Company Dashboard** — Seller panel to manage products, orders, reviews
- **Multi-role Admin** — Super Admin, Staff Admin, Delivery Admin panels
- **Order Tracking** — Live delivery status with route management
- **Persistent Image Storage** — All uploads stored on Cloudinary (survives deploys)
- **Responsive UI** — Mobile hamburger menu, desktop sidebar, fully adaptive

---

## Project Structure

```
FlexCart-Ecommarce-main/
├── flexcart-backend/        # Express API server
│   ├── config/              # DB connection
│   ├── controllers/         # Route handlers
│   ├── middleware/          # Auth, upload (Cloudinary), AI processor
│   ├── models/              # SQL migrations
│   ├── routes/              # API routes
│   ├── services/            # Email, real-time, delivery
│   ├── ai/                  # Python AI microservices
│   └── server.js
└── flexcart-frontend/       # React app
    └── src/
        ├── components/      # UI components
        ├── context/         # Global state (Auth, Cart, Theme)
        ├── hooks/           # Custom hooks
        └── services/        # API client services
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL (or a Supabase project)
- Cloudinary account (free tier works)
- Python 3.10+ (optional — for AI features)

### Backend Setup

```bash
cd flexcart-backend
npm install
cp .env.example .env    # Fill in your values
npm run dev
```

**Required `.env` variables:**

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
FRONTEND_URL=http://localhost:3000
BACKEND_PUBLIC_URL=http://localhost:5000
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=YourStrongPassword

# Cloudinary (required for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Frontend Setup

```bash
cd flexcart-frontend
npm install
npm start
```

Create `flexcart-frontend/.env.local`:

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_UPLOAD_URL=http://localhost:5000
```

### AI Services (Optional)

```bash
cd flexcart-backend
python -m venv ../.venv
../.venv/Scripts/pip install -r ai/requirements.txt
npm run vs:start      # Visual search service (port 5001)
npm run rec:start     # Recommender service (port 5003)
```

---

## Deployment

### Backend → Render
1. Connect GitHub repo to Render as a **Web Service**
2. Set **Root Directory** to `flexcart-backend`
3. Set **Build Command** to `npm install`
4. Set **Start Command** to `node server.js`
5. Add all env variables in the Render dashboard (including Cloudinary keys)

### Frontend → Vercel
1. Import repo to Vercel
2. Set **Root Directory** to `flexcart-frontend`
3. Add environment variables:
   - `REACT_APP_API_URL=https://your-backend.onrender.com/api`
   - `REACT_APP_UPLOAD_URL=https://your-backend.onrender.com`
4. Deploy

---

## API Overview

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/products` | List products |
| GET | `/api/products/categories` | Product categories |
| POST | `/api/cart` | Add to cart |
| GET | `/api/orders` | Order history |
| POST | `/api/ai/process` | AI image/text product search |
| GET | `/api/products/recommendations/hybrid` | Hybrid recommendations |

---

## License

MIT
