const express = require('express');
const router = express.Router();
const { authenticateToken, requireRoles } = require('../middleware/auth');
const superAdminController = require('../controllers/superAdminController');
const staffAdminController = require('../controllers/staffAdminController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createStorage, cloudinaryConfigured } = require('../middleware/upload');

const superOnly = requireRoles('super_admin');

// Ad banner upload — use Cloudinary when configured, fall back to local disk
const adsLocalDir = path.join(__dirname, '..', 'uploads', 'ads');
if (!cloudinaryConfigured && !fs.existsSync(adsLocalDir)) {
  fs.mkdirSync(adsLocalDir, { recursive: true });
}

const adBannerUpload = multer({
  storage: createStorage('ads'),
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Only image files allowed'), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ─── Dashboard ────────────────────────────────────────────────
router.get('/dashboard', authenticateToken, superOnly, superAdminController.getDashboardStats);

// ─── Branches (Super Admin exclusive) ────────────────────────
router.get('/branches',      authenticateToken, superOnly, staffAdminController.getBranches);
router.post('/branches',     authenticateToken, superOnly, staffAdminController.createBranch);
router.put('/branches/:id',  authenticateToken, superOnly, staffAdminController.updateBranch);
router.delete('/branches/:id', authenticateToken, superOnly, staffAdminController.deleteBranch);

// ─── Staff Admin Management (Super Admin only) ────────────────
router.get('/staff-admins', authenticateToken, superOnly, superAdminController.listStaffAdmins);
router.post('/staff-admins', authenticateToken, superOnly, superAdminController.createStaffAdmin);
router.put('/staff-admins/:id', authenticateToken, superOnly, superAdminController.updateStaffAdmin);
router.patch('/staff-admins/:id/toggle-status', authenticateToken, superOnly, superAdminController.toggleStaffAdminStatus);
router.delete('/staff-admins/:id', authenticateToken, superOnly, superAdminController.deleteStaffAdmin);

// ─── User Management ──────────────────────────────────────────
router.get('/users', authenticateToken, superOnly, superAdminController.getUsers);
router.patch('/users/:id/toggle-status', authenticateToken, superOnly, superAdminController.toggleUserStatus);

// ─── Platform Settings ────────────────────────────────────────
router.get('/settings', authenticateToken, superOnly, superAdminController.getSettings);
router.put('/settings', authenticateToken, superOnly, superAdminController.updateSetting);

// ─── Revenue Analytics ────────────────────────────────────────
router.get('/revenue', authenticateToken, superOnly, superAdminController.getRevenueAnalytics);
router.get('/revenue/history', authenticateToken, superOnly, superAdminController.getRevenueHistory);

// ─── Category Commissions ─────────────────────────────────────
router.get('/commissions', authenticateToken, superOnly, superAdminController.getCategoryCommissions);
router.put('/commissions/:categoryId', authenticateToken, superOnly, superAdminController.updateCategoryCommission);

// ─── Ad Promotions ────────────────────────────────────────────
router.get('/ads', authenticateToken, superOnly, superAdminController.getAdPromotions);
router.post('/ads', authenticateToken, superOnly, adBannerUpload.single('banner'), superAdminController.createAdPromotion);
router.put('/ads/:id', authenticateToken, superOnly, adBannerUpload.single('banner'), superAdminController.updateAdPromotion);
router.delete('/ads/:id', authenticateToken, superOnly, superAdminController.deleteAdPromotion);

// ─── All Staff Management ─────────────────────────────────────
router.get('/all-staff',                    authenticateToken, superOnly, superAdminController.getAllStaff);
router.put('/all-staff/:id',               authenticateToken, superOnly, superAdminController.updateAnyStaff);
router.patch('/all-staff/:id/toggle-status', authenticateToken, superOnly, superAdminController.toggleAnyStaffStatus);

// ─── Branch Details & Analytics ───────────────────────────────
router.get('/branches/:id/details', authenticateToken, superOnly, superAdminController.getBranchDetails);

// ─── Audit Log ────────────────────────────────────────────────
router.get('/audit-log', authenticateToken, superOnly, superAdminController.getAuditLog);

// ─── Legacy: Admin Requests (backward compat) ─────────────────
router.get('/requests', authenticateToken, superOnly, superAdminController.getPendingRequests);
router.put('/requests/:id', authenticateToken, superOnly, superAdminController.reviewRequest);

module.exports = router;
