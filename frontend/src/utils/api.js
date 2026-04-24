import axios from 'axios';

// Development: Vite proxies /api to localhost:5000
// Production: Points to your Railway backend URL
const API_BASE = import.meta.env.VITE_API_URL || 'https://resco-cbt-production.up.railway.app/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000, // 30 second timeout
});

api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem('resco_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch (e) {
    // localStorage unavailable (private browsing)
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      try {
        localStorage.removeItem('resco_token');
        localStorage.removeItem('resco_user');
      } catch (e) { /* ignore */ }
      // Show session expired notification before redirecting
      if (typeof window !== 'undefined') {
        window.__resco_session_expired = true;
      }
      // Delay redirect slightly so the toast can be seen
      setTimeout(() => {
        if (window.location.pathname !== '/') window.location.href = '/';
      }, 1000);
    }
    return Promise.reject(error);
  }
);

export default api;
