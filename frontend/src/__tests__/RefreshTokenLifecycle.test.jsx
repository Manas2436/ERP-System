import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import apiClient, {
  refreshClient,
  resetRefreshState,
  AUTH_EVENTS,
} from '../services/apiClient';

const createAxiosError = (status, data, config = {}) => {
  const error = new Error(`Request failed with status code ${status}`);
  error.config = config;
  error.response = {
    status,
    statusText: status === 401 ? 'Unauthorized' : 'Error',
    headers: {},
    config,
    data,
  };
  error.isAxiosError = true;
  return error;
};

describe('Frontend Refresh Token Lifecycle & Interceptor', () => {
  const originalApiAdapter = apiClient.defaults.adapter;
  const originalRefreshAdapter = refreshClient.defaults.adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetRefreshState();
  });

  afterEach(() => {
    resetRefreshState();
    apiClient.defaults.adapter = originalApiAdapter;
    refreshClient.defaults.adapter = originalRefreshAdapter;
  });

  it('automatically refreshes token on 401 and retries original request successfully', async () => {
    localStorage.setItem('token', 'expired-access-token');
    localStorage.setItem('refreshToken', 'valid-refresh-token');

    let profileAttempts = 0;
    let refreshCalls = 0;

    refreshClient.defaults.adapter = async (config) => {
      refreshCalls += 1;
      const body = JSON.parse(config.data || '{}');
      expect(body.refreshToken).toBe('valid-refresh-token');

      return {
        data: {
          success: true,
          message: 'Token rotated successfully',
          data: {
            token: 'new-valid-access-token',
            refreshToken: 'new-replacement-refresh-token',
            tokenType: 'Bearer',
            expiresIn: '8h',
            user: { id: 1, username: 'netal_admin', role: 'ADMIN' },
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    apiClient.defaults.adapter = async (config) => {
      profileAttempts += 1;
      if (profileAttempts === 1) {
        expect(config.headers.Authorization).toBe('Bearer expired-access-token');
        throw createAxiosError(401, { message: 'Access token expired' }, config);
      }

      // Second attempt carries new token
      expect(config.headers.Authorization).toBe('Bearer new-valid-access-token');
      return {
        data: { success: true, data: { name: 'Admin Profile' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const response = await apiClient.get('/admin/profile');

    expect(response.status).toBe(200);
    expect(response.data.data.name).toBe('Admin Profile');

    // Exactly 1 refresh call was made
    expect(refreshCalls).toBe(1);

    // Local storage updated
    expect(localStorage.getItem('token')).toBe('new-valid-access-token');
    expect(localStorage.getItem('refreshToken')).toBe('new-replacement-refresh-token');

    // Original request was retried
    expect(profileAttempts).toBe(2);
  });

  it('serializes concurrent 401 requests into a single refresh request', async () => {
    localStorage.setItem('token', 'expired-access-token');
    localStorage.setItem('refreshToken', 'valid-refresh-token');

    let refreshCallCount = 0;

    refreshClient.defaults.adapter = async (config) => {
      refreshCallCount += 1;
      await new Promise((r) => setTimeout(r, 25));
      return {
        data: {
          success: true,
          data: {
            token: 'concurrent-refreshed-token',
            refreshToken: 'replacement-concurrent-refresh',
            user: { id: 2, username: 'prof_mohit', role: 'FACULTY' },
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const requestCounters = { '/courses': 0, '/grades': 0, '/faculty/profile': 0 };

    apiClient.defaults.adapter = async (config) => {
      const url = config.url;
      requestCounters[url] = (requestCounters[url] || 0) + 1;

      if (requestCounters[url] === 1) {
        throw createAxiosError(401, { message: 'Token expired' }, config);
      }

      return {
        data: { url, authHeader: config.headers?.Authorization },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    // Fire 3 simultaneous protected requests
    const [res1, res2, res3] = await Promise.all([
      apiClient.get('/courses'),
      apiClient.get('/grades'),
      apiClient.get('/faculty/profile'),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    // CRITICAL SECURITY INVARIANT: Only 1 refresh request was dispatched
    expect(refreshCallCount).toBe(1);

    // All retried requests carried the new bearer token
    expect(res1.data.authHeader).toBe('Bearer concurrent-refreshed-token');
    expect(res2.data.authHeader).toBe('Bearer concurrent-refreshed-token');
    expect(res3.data.authHeader).toBe('Bearer concurrent-refreshed-token');
  });

  it('rejects all queued requests and clears local credentials if refresh fails', async () => {
    localStorage.setItem('token', 'stale-token');
    localStorage.setItem('refreshToken', 'revoked-refresh-token');

    const sessionExpiredSpy = vi.fn();
    window.addEventListener(AUTH_EVENTS.SESSION_EXPIRED, sessionExpiredSpy);

    refreshClient.defaults.adapter = async (config) => {
      throw createAxiosError(401, { message: 'Refresh token has been revoked.' }, config);
    };

    apiClient.defaults.adapter = async (config) => {
      throw createAxiosError(401, { message: 'Stale token' }, config);
    };

    await expect(apiClient.get('/student/grades')).rejects.toMatchObject({
      status: 401,
      message: 'Refresh token has been revoked.',
    });

    // Tokens must be immediately wiped on refresh rejection
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();

    // Event must be dispatched to notify React context
    expect(sessionExpiredSpy).toHaveBeenCalled();

    window.removeEventListener(AUTH_EVENTS.SESSION_EXPIRED, sessionExpiredSpy);
  });

  it('enforces single retry limit to prevent infinite loops when retried request returns 401', async () => {
    localStorage.setItem('token', 'token-1');
    localStorage.setItem('refreshToken', 'refresh-1');

    let refreshCalls = 0;
    refreshClient.defaults.adapter = async (config) => {
      refreshCalls += 1;
      return {
        data: {
          success: true,
          data: {
            token: 'token-2',
            refreshToken: 'refresh-2',
            user: { id: 3, role: 'STUDENT' },
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    let attempts = 0;
    apiClient.defaults.adapter = async (config) => {
      attempts += 1;
      throw createAxiosError(401, { message: 'Still invalid' }, config);
    };

    await expect(apiClient.get('/secure-data')).rejects.toMatchObject({
      status: 401,
      message: 'Still invalid',
    });

    // Exactly 2 attempts: 1st original, 2nd retry with new token; NO 3rd attempt
    expect(attempts).toBe(2);
    expect(refreshCalls).toBe(1);
  });

  it('does NOT trigger token refresh on auth endpoints (login, refresh, logout)', async () => {
    let refreshCalls = 0;
    refreshClient.defaults.adapter = async (config) => {
      refreshCalls += 1;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    apiClient.defaults.adapter = async (config) => {
      throw createAxiosError(401, { message: 'Invalid username or password.' }, config);
    };

    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({
      status: 401,
      message: 'Invalid username or password.',
    });

    // Refresh was NEVER called
    expect(refreshCalls).toBe(0);
  });

  it('rejects immediately and clears state if no refreshToken is available', async () => {
    localStorage.setItem('token', 'lonely-access-token');
    // Note: NO refreshToken in storage

    const sessionExpiredSpy = vi.fn();
    window.addEventListener(AUTH_EVENTS.SESSION_EXPIRED, sessionExpiredSpy);

    let refreshCalls = 0;
    refreshClient.defaults.adapter = async (config) => {
      refreshCalls += 1;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    apiClient.defaults.adapter = async (config) => {
      throw createAxiosError(401, { message: 'Token Expired' }, config);
    };

    await expect(apiClient.get('/admin/users')).rejects.toMatchObject({
      status: 401,
    });

    expect(refreshCalls).toBe(0);
    expect(sessionExpiredSpy).toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();

    window.removeEventListener(AUTH_EVENTS.SESSION_EXPIRED, sessionExpiredSpy);
  });
});
