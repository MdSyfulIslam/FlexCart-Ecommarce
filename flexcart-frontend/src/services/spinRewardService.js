import api from './api';

const spinRewardService = {
  checkEligibility: () => api.get('/spin-reward/check'),
  spin: () => api.post('/spin-reward/spin'),
  getHistory: () => api.get('/spin-reward/history')
};

export default spinRewardService;