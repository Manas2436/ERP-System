import axios from 'axios';

// Resolve base URL from Vite / CRA env variables, or default to proxy-friendly '/api/v1'
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.REACT_APP_API_BASE_URL ||
  '/api/v1';

export const AUTH_EVENTS = {
  TOKEN_REFRESHED: 'college_erp:token_refreshed',
  SESSION_EXPIRED: 'college_erp:session_expired',
};

// Main API client used by application services
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Dedicated raw client for token refresh to avoid circular interceptor recursion
export const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Concurrency synchronization state
let isRefreshing = false;
let failedQueue = [];

export const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Reset queue and state (primarily for test cleanup)
export const resetRefreshState = () => {
  isRefreshing = false;
  failedQueue = [];
};

export const getRefreshState = () => ({
  isRefreshing,
  queueLength: failedQueue.length,
});

// Helper to determine if a URL belongs to authentication endpoints that should not trigger refresh
export const isAuthEndpoint = (url) => {
  if (!url) return false;
  const authRoutes = [
    '/auth/login',
    '/auth/refresh',
    '/auth/refresh-token',
    '/auth/logout',
    '/auth/captcha',
    '/auth/forgot-password',
    '/auth/reset-password',
  ];
  return authRoutes.some((route) => url.includes(route));
};

// Notify application of session termination and clear local credentials
export const notifySessionExpired = () => {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  } catch (err) {
    // Gracefully handle storage errors in restricted contexts
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_EVENTS.SESSION_EXPIRED));
  }
};

// Notify application of refreshed tokens and update storage
export const notifyTokenRefreshed = (payload) => {
  try {
    if (payload.token) {
      localStorage.setItem('token', payload.token);
    }
    if (payload.refreshToken) {
      localStorage.setItem('refreshToken', payload.refreshToken);
    }
    if (payload.user) {
      localStorage.setItem('user', JSON.stringify(payload.user));
    }
  } catch (err) {
    // Gracefully handle storage errors
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTH_EVENTS.TOKEN_REFRESHED, { detail: payload })
    );
  }
};

// Request interceptor: attach access token if available in localStorage
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 with automatic, concurrency-safe token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status || 0;

    // Standardize error payload extraction
    const standardizedError = {
      status,
      message:
        error.response?.data?.message ||
        error.message ||
        'An unexpected error occurred.',
      errors: error.response?.data?.errors || null,
      data: error.response?.data || null,
    };

    // Only attempt refresh for 401 errors on non-auth endpoints that haven't been retried yet
    if (
      status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url)
    ) {
      // If a refresh is already in progress, queue this request until refresh finishes
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      // Mark request as retried to enforce single retry limit
      originalRequest._retry = true;
      isRefreshing = true;

      const currentRefreshToken = localStorage.getItem('refreshToken');
      if (!currentRefreshToken) {
        isRefreshing = false;
        notifySessionExpired();
        return Promise.reject(standardizedError);
      }

      try {
        const response = await refreshClient.post('/auth/refresh', {
          refreshToken: currentRefreshToken,
        });

        const refreshedData = response.data?.data;
        if (!refreshedData || !refreshedData.token) {
          throw new Error('Malformed token refresh response from server.');
        }

        // Persist refreshed credentials and broadcast event
        notifyTokenRefreshed(refreshedData);

        // Update default header on client and the original request
        apiClient.defaults.headers.common.Authorization = `Bearer ${refreshedData.token}`;
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${refreshedData.token}`;

        // Resolve all pending requests in queue
        processQueue(null, refreshedData.token);

        // Retry original request exactly once
        return apiClient(originalRequest);
      } catch (refreshErr) {
        // Replay attack, revoked token, or network failure on refresh
        const refreshFailure = {
          status: refreshErr.response?.status || 401,
          message:
            refreshErr.response?.data?.message ||
            'Session expired or invalid refresh token.',
          errors: refreshErr.response?.data?.errors || null,
          data: refreshErr.response?.data || null,
        };

        // Reject all queued requests
        processQueue(refreshFailure, null);

        // Clear local credentials and notify
        notifySessionExpired();

        return Promise.reject(refreshFailure);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(standardizedError);
  }
);

export default apiClient;
