const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const cloudinaryConfigured =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

if (!cloudinaryConfigured) {
  console.warn('[upload] Cloudinary env vars not set — falling back to local disk storage. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET on Render.');
}

const createStorage = (folder) => {
  if (cloudinaryConfigured) {
    return new CloudinaryStorage({
      cloudinary,
      params: {
        folder: `flexcart/${folder}`,
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
        resource_type: 'image',
      },
    });
  }
  // Fallback: local disk (for dev / when Cloudinary is not configured)
  const uploadDir = path.join(__dirname, '..', 'uploads', folder);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  });
};

// File filter
const imageFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed'), false);
  }
};

// Upload configurations
const uploadProfile = multer({
  storage: createStorage('profiles'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadProduct = multer({
  storage: createStorage('products'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadCompany = multer({
  storage: createStorage('companies'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadNID = multer({
  storage: createStorage('nids'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadAI = multer({
  storage: createStorage('ai'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadDeliveryProof = multer({
  storage: createStorage('deliveries'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = { uploadProfile, uploadProduct, uploadCompany, uploadNID, uploadAI, uploadDeliveryProof, cloudinary, cloudinaryConfigured, createStorage };