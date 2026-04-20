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
  createInvite: (payload = {}) => api.post('/family/invites', payload).then((r) => r.data),
  listInvites: () => api.get('/family/invites').then((r) => r.data),
  revokeInvite: (token) => api.delete(`/family/invites/${token}`).then((r) => r.data),
  previewInvite: (token) => api.get(`/family/invites/preview/${token}`).then((r) => r.data),
};

export const events = {
  list: () => api.get('/events').then((r) => r.data),
  create: (payload) => api.post('/events', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/events/${id}`, payload).then((r) => r.data),
  delete: (id) => api.delete(`/events/${id}`).then((r) => r.data),
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
