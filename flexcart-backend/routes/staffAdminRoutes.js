const express = require('express');
const router = express.Router();
const { authenticateToken, requireRoles } = require('../middleware/auth');
const staffAdminController = require('../controllers/staffAdminController');

const staffOrSuper = requireRoles('staff_admin', 'super_admin');
const superOnly    = requireRoles('super_admin');

// ─── Dashboard ────────────────────────────────────────────────
router.get('/dashboard', authenticateToken, staffOrSuper, staffAdminController.getDashboardStats);

// ─── Branches ─────────────────────────────────────────────────
// Read is shared (staff admin needs branches for dropdowns)
router.get('/branches', authenticateToken, staffOrSuper, staffAdminController.getBranches);
// Write operations: Super Admin only
router.post('/branches', authenticateToken, superOnly, staffAdminController.createBranch);
router.put('/branches/:id', authenticateToken, superOnly, staffAdminController.updateBranch);
router.delete('/branches/:id', authenticateToken, superOnly, staffAdminController.deleteBranch);

// ─── Personnel (Delivery Admins + Delivery Boys) ──────────────
router.get('/personnel', authenticateToken, staffOrSuper, staffAdminController.getPersonnel);
router.post('/personnel', authenticateToken, staffOrSuper, staffAdminController.createPersonnel);
router.put('/personnel/:id', authenticateToken, staffOrSuper, staffAdminController.updatePersonnel);
router.patch('/personnel/:id/toggle-pause', authenticateToken, staffOrSuper, staffAdminController.togglePersonnelPause);
router.delete('/personnel/:id', authenticateToken, staffOrSuper, staffAdminController.deletePersonnel);

// ─── Vehicles ─────────────────────────────────────────────────
router.get('/vehicles',        authenticateToken, staffOrSuper, staffAdminController.getVehicles);
router.post('/vehicles',       authenticateToken, staffOrSuper, staffAdminController.createVehicle);
router.put('/vehicles/:id',    authenticateToken, staffOrSuper, staffAdminController.updateVehicle);
router.delete('/vehicles/:id', authenticateToken, staffOrSuper, staffAdminController.deleteVehicle);

// ─── Orders Management ────────────────────────────────────────
router.get('/orders',                        authenticateToken, staffOrSuper, staffAdminController.getOrders);
router.patch('/orders/:id/status',           authenticateToken, staffOrSuper, staffAdminController.updateOrderStatus);
router.post('/orders/:id/assign-branch',     authenticateToken, staffOrSuper, staffAdminController.assignBranchToOrder);
router.post('/orders/:id/assign-delivery',   authenticateToken, staffOrSuper, staffAdminController.assignDeliveryToOrder);
router.delete('/orders/:id/cancel-delivery', authenticateToken, staffOrSuper, staffAdminController.cancelOrderDelivery);

// ─── User (Customers) Management ─────────────────────────────
router.get('/users', authenticateToken, staffOrSuper, staffAdminController.getUsers);

// ─── Products Management ──────────────────────────────────────
router.get('/products', authenticateToken, staffOrSuper, staffAdminController.getProducts);
router.patch('/products/:id/status', authenticateToken, staffOrSuper, staffAdminController.toggleProductStatus);

// ─── Branch Delivery Stats ────────────────────────────────────
router.get('/branch-stats', authenticateToken, staffOrSuper, staffAdminController.getBranchDeliveryStats);

// ─── Analytics ────────────────────────────────────────────────
router.get('/analytics', authenticateToken, staffOrSuper, staffAdminController.getAnalytics);

// ─── Feedback ─────────────────────────────────────────────────
router.get('/feedback', authenticateToken, staffOrSuper, staffAdminController.getFeedback);
router.post('/feedback/:id/warn-company', authenticateToken, staffOrSuper, staffAdminController.sendCompanyWarning);

// ─── Notifications ────────────────────────────────────────────
router.get('/notifications', authenticateToken, staffOrSuper, staffAdminController.getAdminNotifications);

// ─── Activity Audit Logs ──────────────────────────────────────
router.get('/audit-logs', authenticateToken, staffOrSuper, staffAdminController.getAuditLogs);

// ─── Company Verifications ────────────────────────────────────
router.get('/verifications',              authenticateToken, staffOrSuper, staffAdminController.getCompanyVerifications);
router.post('/verifications/:id/approve', authenticateToken, staffOrSuper, staffAdminController.approveCompanyVerification);
router.post('/verifications/:id/reject',  authenticateToken, staffOrSuper, staffAdminController.rejectCompanyVerification);

module.exports = router;
