import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  setUser: (user, token) => {
    try {
      localStorage.setItem('resco_user', JSON.stringify(user));
      localStorage.setItem('resco_token', token);
    } catch (e) {
      console.warn('Storage write failed:', e);
    }
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    try {
      localStorage.removeItem('resco_user');
      localStorage.removeItem('resco_token');
    } catch (e) {
      console.warn('Storage clear failed:', e);
    }
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadFromStorage: () => {
    try {
      const user = JSON.parse(localStorage.getItem('resco_user') || 'null');
      const token = localStorage.getItem('resco_token');
      if (user && token) set({ user, token, isAuthenticated: true });
    } catch (e) {
      console.warn('Failed to load auth from storage, clearing:', e.message);
      localStorage.removeItem('resco_user');
      localStorage.removeItem('resco_token');
    }
  },
}));

// Initialize on import
useAuthStore.getState().loadFromStorage();

export default useAuthStore;
