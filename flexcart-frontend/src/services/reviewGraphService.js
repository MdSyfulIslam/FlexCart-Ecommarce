import api from './api';

const reviewGraphService = {
  getGraphData: (params) => api.get('/review-graph', { params })
};

export default reviewGraphService;