import api from './api';

const settingsService = {
  getSettings: () => api.get('/settings'),
  updateSettings: (data) => api.put('/settings', data),
  updateTheme: (theme) => api.put('/settings/theme', { theme }),
  updateAppearanceColor: (color) => api.put('/settings/appearance-color', { color }),
  updateBackground: (bg) => api.put('/settings/background', { background_image: bg }),
  getBackgroundThemes: () => api.get('/settings/background-themes'),
  changePassword: (data) => api.put('/settings/change-password', data)
};

export default settingsService;