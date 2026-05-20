const express = require('express');
const router = express.Router();

const deliveryController = require('../controllers/deliveryController');
const deliveryRouteController = require('../controllers/deliveryRouteController');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { uploadDeliveryProof } = require('../middleware/upload');

// Delivery Admin APIs
router.get('/branches', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.getBranches);
router.get('/pricing', authenticateToken, requireRoles('delivery_admin', 'staff_admin', 'super_admin'), deliveryController.getDeliveryPricing);
router.get('/branch-resources', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.getBranchResources);
router.get('/route-quote', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.getRouteQuote);
router.get('/orders/:orderNumber', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.getOrderForDelivery);
router.get('/branch-assignments', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.getBranchAssignments);
router.post('/branch-assignments/:orderNumber/accept', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.acceptBranchAssignment);
router.get('/branch-stats', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.getBranchStats);
router.post('/assign', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.assignDelivery);
router.get('/history', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.getDeliveryHistory);
router.get('/deliveries', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.getDeliveriesForBranch);
router.post('/orders/:orderNumber/reassign-branch', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.reassignOrderBranch);
router.post('/orders/:orderNumber/assign-to-boy', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryController.assignToDeliveryBoy);

// Route & Hub Management APIs
router.get('/hubs', authenticateToken, requireRoles('delivery_admin', 'staff_admin', 'super_admin'), deliveryRouteController.listHubs);
router.post('/hubs', authenticateToken, requireRoles('super_admin'), deliveryRouteController.createHub);
router.put('/hubs/:id', authenticateToken, requireRoles('super_admin'), deliveryRouteController.updateHub);

router.get('/routes', authenticateToken, requireRoles('delivery_admin', 'staff_admin', 'super_admin'), deliveryRouteController.listRoutes);
router.post('/routes', authenticateToken, requireRoles('super_admin'), deliveryRouteController.createRoute);
router.put('/routes/:id', authenticateToken, requireRoles('super_admin'), deliveryRouteController.updateRoute);
router.delete('/routes/:id', authenticateToken, requireRoles('super_admin'), deliveryRouteController.deleteRoute);

// Assignment APIs
router.post('/assign-route', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryRouteController.assignRouteToOrder);
router.post('/assign-vehicle', authenticateToken, requireRoles('delivery_admin', 'super_admin'), deliveryRouteController.assignVehicleToOrder);
router.post('/tracking/status', authenticateToken, requireRoles('delivery_admin', 'staff_admin', 'super_admin', 'delivery_boy'), deliveryController.updateTrackingStatus);
router.get('/tracking/:orderNumber', authenticateToken, requireRoles('delivery_admin', 'staff_admin', 'super_admin', 'delivery_boy'), deliveryController.getTrackingTimeline);

// Delivery Boy APIs (authenticated)
router.get('/driver/stats', authenticateToken, requireRoles('delivery_boy'), deliveryController.getDriverStats);
router.get('/driver/assignments', authenticateToken, requireRoles('delivery_boy'), deliveryController.getDriverAssignments);
router.get('/driver/history', authenticateToken, requireRoles('delivery_boy'), deliveryController.getDriverHistory);
router.get('/driver/all', authenticateToken, requireRoles('delivery_boy'), deliveryController.getDriverAllDeliveries);
router.post('/driver/complete', authenticateToken, requireRoles('delivery_boy'), uploadDeliveryProof.single('proof_photo'), deliveryController.completeDelivery);
router.post('/driver/reject', authenticateToken, requireRoles('delivery_boy'), deliveryController.rejectDelivery);

module.exports = router;
