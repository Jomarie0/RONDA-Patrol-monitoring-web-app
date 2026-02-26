/**
 * R.O.N.D.A. — API calls for dashboard.
 */
import api from './client';

export const auth = {
  login: (username, password) =>
    api.post('/auth/token/', { username, password }).then((r) => r.data),
};

export const branches = {
  list: () => api.get('/branches/').then((r) => r.data),
  get: (id) => api.get(`/branches/${id}/`).then((r) => r.data),
  create: (payload) => api.post('/branches/', payload).then((r) => r.data),
};

export const users = {
  list: () => api.get('/users/').then((r) => r.data),
  create: (payload) => api.post('/users/', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/users/${id}/`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}/`).then((r) => r.data),
};

export const sessions = {
  list: (params) => api.get('/sessions/', { params }).then((r) => r.data),
  get: (id) => api.get(`/sessions/${id}/`).then((r) => r.data),
  live: () => api.get('/sessions/live/').then((r) => r.data),
};

export const gpsLogs = {
  list: (params) => api.get('/gps-logs/', { params }).then((r) => r.data),
};
