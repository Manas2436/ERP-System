import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';
import { AUTH_EVENTS } from '../services/apiClient';

const AuthContext = createContext(null);

const STORAGE_KEYS = {
  TOKEN: 'token',
  REFRESH_TOKEN: 'refreshToken',
  USER: 'user',
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize state from localStorage on application mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
      const storedRefreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      const storedUser = localStorage.getItem(STORAGE_KEYS.USER);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setRefreshToken(storedRefreshToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (err) {
      console.error('Failed to parse cached auth state from localStorage:', err);
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
    } finally {
      setIsLoading(false);
    }

    // Listen for automatic token refresh events from apiClient
    const handleTokenRefreshed = (event) => {
      const refreshedPayload = event.detail;
      if (refreshedPayload) {
        if (refreshedPayload.token) setToken(refreshedPayload.token);
        if (refreshedPayload.refreshToken) setRefreshToken(refreshedPayload.refreshToken);
        if (refreshedPayload.user) setUser(refreshedPayload.user);
      }
    };

    // Listen for session expiration events (e.g., refresh token revoked or expired)
    const handleSessionExpired = () => {
      setToken(null);
      setRefreshToken(null);
      setUser(null);
    };

    window.addEventListener(AUTH_EVENTS.TOKEN_REFRESHED, handleTokenRefreshed);
    window.addEventListener(AUTH_EVENTS.SESSION_EXPIRED, handleSessionExpired);

    return () => {
      window.removeEventListener(AUTH_EVENTS.TOKEN_REFRESHED, handleTokenRefreshed);
      window.removeEventListener(AUTH_EVENTS.SESSION_EXPIRED, handleSessionExpired);
    };
  }, []);

  /**
   * Log in user and persist credentials
   * Returns authenticated user payload with server-verified role
   */
  const login = useCallback(async ({ identifier, password, captchaToken, captchaAnswer }) => {
    setIsLoading(true);
    try {
      const data = await authService.login({
        identifier,
        password,
        captchaToken,
        captchaAnswer,
      });

      // data contains { token, refreshToken, tokenType, expiresIn, user: { id, username, email, role } }
      localStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
      if (data.refreshToken) {
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
      }
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));

      setToken(data.token);
      setRefreshToken(data.refreshToken || null);
      setUser(data.user);

      return data.user;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Logout user, invalidate refresh token on backend, and clear client storage
   */
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentRefreshToken = refreshToken || localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (currentRefreshToken) {
        await authService.logout(currentRefreshToken).catch((err) => {
          // Even if backend logout encounters an issue or is unreachable, client session must be cleared
          console.warn('Backend logout notification failed or timed out:', err.message);
        });
      }
    } finally {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      setIsLoading(false);
    }
  }, [refreshToken]);

  const value = {
    user,
    token,
    refreshToken,
    isAuthenticated: Boolean(user && token),
    isLoading,
    role: user?.role || null,
    isAdmin: user?.role === 'ADMIN',
    isFaculty: user?.role === 'FACULTY',
    isStudent: user?.role === 'STUDENT',
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
