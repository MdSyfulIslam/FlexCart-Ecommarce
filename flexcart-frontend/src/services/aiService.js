import api from './api';

const aiService = {
  processImage: (formData) => api.post('/ai/process', formData),
  getSearchHistory: () => api.get('/ai/history')
};

export default aiService;