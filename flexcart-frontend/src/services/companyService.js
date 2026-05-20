import api from './api';

const companyService = {
  createCompany: (formData) => api.post('/companies', formData),
  getMyCompany: () => api.get('/companies/my-company'),
  getCompanyById: (id) => api.get(`/companies/${id}`),
  getFollowingCompanies: () => api.get('/companies/following'),
  toggleFollow: (companyId) => api.post('/companies/follow', { company_id: companyId }),
  toggleNotifications: (companyId) => api.put(`/companies/follow/${companyId}/notifications`),
  getBranchOptionsForOrder: (companyId, orderNumber) =>
    api.get(`/companies/${companyId}/orders/${encodeURIComponent(orderNumber)}/branch-options`),
  assignOrderToBranch: (companyId, orderNumber, branchId) =>
    api.post(`/companies/${companyId}/orders/${encodeURIComponent(orderNumber)}/assign-branch`, { branchId }),
  updateCompany: (formData) => api.put('/companies', formData)
};

export default companyService;