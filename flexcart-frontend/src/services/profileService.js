import api from './api';

const profileService = {
  getProfile: () => api.get('/profile'),
  updateProfile: (formData) => api.put('/profile', formData),
  uploadProfileImage: (formData) => api.post('/profile/upload-image', formData)
};

export default profileService;