import axios from 'axios';

// Development: Vite proxies /api to localhost:5000
// Production: Points to your Railway backend URL
const API_BASE = import.meta.env.VITE_API_URL || 'https://resco-cbt-production.up.railway.app/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000, // 30 second timeout
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('resco_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('resco_token');
      localStorage.removeItem('resco_user');
      if (window.location.pathname !== '/') window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
