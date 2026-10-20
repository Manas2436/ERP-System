import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ResetPasswordPage from '../pages/auth/ResetPasswordPage';
import authService from '../services/authService';

vi.mock('../services/authService', () => ({
  default: {
    resetPassword: vi.fn(),
  },
  authService: {
    resetPassword: vi.fn(),
  },
}));

const renderResetPasswordPage = (token = '') => {
  const initialEntry = token ? `/reset-password?token=${token}` : '/reset-password';
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ResetPasswordPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders token input when not provided in URL query', () => {
    renderResetPasswordPage();

    expect(screen.getByRole('heading', { name: /set new password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/security reset token/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument();
  });

  it('hides token input when token is provided in query params', () => {
    renderResetPasswordPage('valid-test-token-123');

    expect(screen.queryByLabelText(/security reset token/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it('validates password mismatch and min length', async () => {
    const user = userEvent.setup();
    renderResetPasswordPage('valid-test-token-123');

    // Mismatched passwords
    await user.type(screen.getByLabelText(/^new password/i), 'short');
    await user.type(screen.getByLabelText(/confirm new password/i), 'different');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(screen.getByText(/password must be at least 8 characters long/i)).toBeInTheDocument();
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it('submits reset password successfully and allows navigating to login', async () => {
    const user = userEvent.setup();
    authService.resetPassword.mockResolvedValueOnce({
      message: 'Password reset successful. You may now log in.',
    });

    renderResetPasswordPage('valid-test-token-123');

    await user.type(screen.getByLabelText(/^new password/i), 'NewSecurePassword123!');
    await user.type(screen.getByLabelText(/confirm new password/i), 'NewSecurePassword123!');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(authService.resetPassword).toHaveBeenCalledWith({
        token: 'valid-test-token-123',
        newPassword: 'NewSecurePassword123!',
        confirmPassword: 'NewSecurePassword123!',
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText(/password reset successful/i)[0]).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /proceed to sign in/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /proceed to sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('handles invalid or expired token error from API', async () => {
    const user = userEvent.setup();
    authService.resetPassword.mockRejectedValueOnce({
      status: 400,
      message: 'Invalid or expired password reset token.',
    });

    renderResetPasswordPage('expired-token');

    await user.type(screen.getByLabelText(/^new password/i), 'NewSecurePassword123!');
    await user.type(screen.getByLabelText(/confirm new password/i), 'NewSecurePassword123!');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/reset failed/i)).toBeInTheDocument();
      expect(screen.getByText(/invalid or expired password reset token/i)).toBeInTheDocument();
    });
  });
});
