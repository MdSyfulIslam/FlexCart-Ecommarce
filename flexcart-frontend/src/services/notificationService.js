import api from './api';

const notificationService = {
  getNotifications: (params) => api.get('/notifications', { params }),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/all/read'),
  deleteNotification: (id) => api.delete(`/notifications/${id}`)
};

export default notificationService;