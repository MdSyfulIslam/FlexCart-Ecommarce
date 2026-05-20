import api from './api';

const supportService = {
  getSupportInfo: () => api.get('/support')
};

export default supportService;