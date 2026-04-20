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
  async exchangeSession(sessionId) {
    const { data } = await api.post('/auth/session', { session_id: sessionId });
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
};

export const notes = {
  list: () => api.get('/notes').then((r) => r.data),
  create: (payload) => api.post('/notes', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/notes/${id}`, payload).then((r) => r.data),
  delete: (id) => api.delete(`/notes/${id}`).then((r) => r.data),
};
