import apiClient from './apiClient';

/**
 * Authentication Service
 * Communicates with backend endpoints under /api/v1/auth
 */
export const authService = {
  /**
   * Request a new SVG CAPTCHA challenge
   * @returns {Promise<{ captchaToken: string, svg: string, expiresIn: number }>}
   */
  async getCaptcha() {
    const response = await apiClient.get('/auth/captcha');
    return response.data.data;
  },

  /**
   * Submit credentials and CAPTCHA solution to authenticate
   * @param {{ identifier: string, password: string, captchaToken: string, captchaAnswer: string }} credentials
   * @returns {Promise<{ token: string, refreshToken: string, tokenType: string, expiresIn: string, user: { id: number, username: string, email: string, role: string } }>}
   */
  async login(credentials) {
    const response = await apiClient.post('/auth/login', credentials);
    return response.data.data;
  },

  /**
   * Invalidate current session on the backend
   * @param {string} refreshToken
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async logout(refreshToken) {
    const response = await apiClient.post('/auth/logout', { refreshToken });
    return response.data;
  },

  /**
   * Rotate access token using a valid refresh token
   * @param {string} refreshToken
   * @returns {Promise<{ token: string, refreshToken: string, tokenType: string, expiresIn: string, user: object }>}
   */
  async refreshToken(refreshToken) {
    const response = await apiClient.post('/auth/refresh', { refreshToken });
    return response.data.data;
  },

  /**
   * Request password reset link for username or institutional email
   * @param {{ identifier: string }} payload
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async forgotPassword(payload) {
    const response = await apiClient.post('/auth/forgot-password', payload);
    return response.data;
  },

  /**
   * Submit new password with single-use reset token
   * @param {{ token: string, newPassword: string, confirmPassword: string }} payload
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async resetPassword(payload) {
    const response = await apiClient.post('/auth/reset-password', payload);
    return response.data;
  },
};

export default authService;
