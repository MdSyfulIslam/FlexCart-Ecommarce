# FlexCart Visual Search Service — README
 
## Overview
 
This Python microservice runs alongside the Node.js backend and provides
deep-learning-powered visual product search using ResNet50 feature extraction.

FlexCart also includes an optional **Python Recommendation Service** that ranks
similar products after user actions (search/view/favourite/request) and boosts
best-reviewed, best-discount, and newest similar items.
 
When a user uploads a photo in the AI Search screen, the Node.js backend
forwards the image to this service, which ranks all indexed products by
visual similarity and returns the top matches.
 
## Setup
 
### 1. Install Python dependencies
 
```bash
cd flexcart-backend/ai
pip install -r requirements.txt
```
 
For the CPU-only PyTorch build (smaller download):
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install flask Pillow numpy requests
```
 
### 2. Start the service
 
```bash
python visual_search.py
```

### 2a. (Windows) Start backend + visual search together

From `flexcart-backend/` you can run a single command that starts the Python
visual search service in a separate window and then starts the Node backend:

```bash
npm run dev:full
```

If you only want to start the Python service:

```bash
npm run vs:start
```
 
The service starts on port **5001** by default.  
Override with the `VS_PORT` environment variable:
```bash
VS_PORT=5002 python visual_search.py
```

### (Optional) Start the recommendation service

```bash
python recommender_service.py
```

The recommendation service starts on port **5003** by default.  
Override with the `REC_PORT` environment variable:

```bash
REC_PORT=5004 python recommender_service.py
```
 
### 3. Configure the Node.js backend
 
Add to `flexcart-backend/.env`:
```
VS_SERVICE_URL=http://localhost:5001
REC_SERVICE_URL=http://localhost:5003
```
 
If `VS_SERVICE_URL` is not set, the backend defaults to `http://localhost:5001`.  
If the service is unreachable the backend silently falls back to keyword search.

If `REC_SERVICE_URL` is not set, the backend defaults to `http://localhost:5003`.  
If the recommendation service is unreachable the backend falls back to the built-in
JS hybrid recommender.
 
## API Endpoints
 
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + index stats |
| POST | `/index-product` | Index a product image (JSON or multipart) |
| DELETE | `/index-product/<id>` | Remove a product from the index |
| POST | `/bulk-index` | Index many products at once |
| POST | `/search` | Search by uploaded image (multipart) |
 
## How the index is populated
 
Every time a seller uploads a new product through the Company Dashboard,
the Node.js backend calls `indexProductImage()` (from `aiProcessor.js`),
which sends the product's primary image to `POST /index-product`.
 
To bulk-index all existing products, run:
 
```bash
node scripts/bulk_index_products.js
```
 
(See `flexcart-backend/scripts/bulk_index_products.js` for the script.)
 
## Feature storage
 
Extracted feature vectors are stored in `ai/product_features.json` on disk
so the index survives service restarts without re-processing images.
