import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Attach bearer token fallback from localStorage (if cookie blocked)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('session_token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const auth = {
  async exchangeSession(sessionId, inviteToken) {
    const body = { session_id: sessionId };
    if (inviteToken) body.invite_token = inviteToken;
    const { data } = await api.post('/auth/session', body);
    return data;
  },
  async me() {
    const { data } = await api.get('/auth/me');
    return data;
  },
  async logout() {
    await api.post('/auth/logout');
    localStorage.removeItem('session_token');
  },
};

export const family = {
  members: () => api.get('/family/members').then((r) => r.data),
  addChild: (payload) => api.post('/family/children', payload).then((r) => r.data),
  deleteChild: (id) => api.delete(`/family/children/${id}`).then((r) => r.data),
  info: () => api.get('/family/info').then((r) => r.data),
  updateInfo: (payload) => api.put('/family/info', payload).then((r) => r.data),
  previewCode: (code) => api.get(`/family/preview-code/${code}`).then((r) => r.data),
  join: (code) => api.post('/family/join', { code }).then((r) => r.data),
  createInvite: (payload = {}) => api.post('/family/invites', payload).then((r) => r.data),
  listInvites: () => api.get('/family/invites').then((r) => r.data),
  revokeInvite: (token) => api.delete(`/family/invites/${token}`).then((r) => r.data),
  previewInvite: (token) => api.get(`/family/invites/preview/${token}`).then((r) => r.data),
  transferOwnership: (toUserId) => api.post('/family/transfer-ownership', { to_user_id: toUserId }).then((r) => r.data),
};

export const events = {
  list: () => api.get('/events').then((r) => r.data),
  create: (payload) => api.post('/events', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/events/${id}`, payload).then((r) => r.data),
  delete: (id) => api.delete(`/events/${id}`).then((r) => r.data),
  addException: (id, date) => api.post(`/events/${id}/exceptions`, { date }).then((r) => r.data),
  removeException: (id, date) => api.delete(`/events/${id}/exceptions/${date}`).then((r) => r.data),
};

export const shopping = {
  list: () => api.get('/shopping').then((r) => r.data),
  add: (payload) => api.post('/shopping', payload).then((r) => r.data),
  toggle: (id) => api.patch(`/shopping/${id}`).then((r) => r.data),
  update: (id, payload) => api.put(`/shopping/${id}`, payload).then((r) => r.data),
  delete: (id) => api.delete(`/shopping/${id}`).then((r) => r.data),
  clearChecked: () => api.delete('/shopping').then((r) => r.data),
  frequent: () => api.get('/shopping/frequent').then((r) => r.data),
  barcode: (code) => api.get(`/shopping/barcode/${code}`).then((r) => r.data),
  templates: {
    list: () => api.get('/shopping/templates').then((r) => r.data),
    create: (payload) => api.post('/shopping/templates', payload).then((r) => r.data),
    update: (id, payload) => api.put(`/shopping/templates/${id}`, payload).then((r) => r.data),
    delete: (id) => api.delete(`/shopping/templates/${id}`).then((r) => r.data),
    apply: (id) => api.post(`/shopping/templates/${id}/apply`).then((r) => r.data),
  },
};

export const notes = {
  list: () => api.get('/notes').then((r) => r.data),
  create: (payload) => api.post('/notes', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/notes/${id}`, payload).then((r) => r.data),
  delete: (id) => api.delete(`/notes/${id}`).then((r) => r.data),
};

export const meals = {
  list: (start_date, end_date) => api.get('/meals', { params: { start_date, end_date } }).then((r) => r.data),
  create: (payload) => api.post('/meals', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/meals/${id}`, payload).then((r) => r.data),
  delete: (id) => api.delete(`/meals/${id}`).then((r) => r.data),
  toShopping: (start_date, end_date, supermarket = 'Any') =>
    api.post('/meals/to-shopping', { start_date, end_date, supermarket }).then((r) => r.data),
  templates: {
    list: () => api.get('/meals/templates').then((r) => r.data),
    create: (payload) => api.post('/meals/templates', payload).then((r) => r.data),
    update: (id, payload) => api.put(`/meals/templates/${id}`, payload).then((r) => r.data),
    delete: (id) => api.delete(`/meals/templates/${id}`).then((r) => r.data),
    apply: (id, date, meal_type) =>
      api.post(`/meals/templates/${id}/apply`, { date, meal_type }).then((r) => r.data),
  },
};

export const activity = {
  list: (params = {}) => api.get('/activity', { params }).then((r) => r.data),
};
