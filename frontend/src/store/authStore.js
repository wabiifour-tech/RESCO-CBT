import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  setUser: (user, token) => {
    localStorage.setItem('resco_user', JSON.stringify(user));
    localStorage.setItem('resco_token', token);
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('resco_user');
    localStorage.removeItem('resco_token');
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
