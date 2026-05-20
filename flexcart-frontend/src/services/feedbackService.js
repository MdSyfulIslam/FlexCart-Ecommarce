import api from './api';

const feedbackService = {
  submitFeedback: (data) => api.post('/feedback', data),
  getMyFeedbacks: () => api.get('/feedback'),
  searchCompanies: (q) => api.get(`/companies/search?q=${encodeURIComponent(q)}`)
};

export default feedbackService;
