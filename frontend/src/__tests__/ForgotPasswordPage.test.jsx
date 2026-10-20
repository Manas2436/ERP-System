import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage';
import authService from '../services/authService';

vi.mock('../services/authService', () => ({
  default: {
    forgotPassword: vi.fn(),
  },
  authService: {
    forgotPassword: vi.fn(),
  },
}));

const renderForgotPasswordPage = () => {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ForgotPasswordPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders input field and submit button', () => {
    renderForgotPasswordPage();

    expect(screen.getByRole('heading', { name: /forgot password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username or institutional email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to authentication/i })).toBeInTheDocument();
  });

  it('validates identifier before submitting', async () => {
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(screen.getByText(/please enter your username or registered email/i)).toBeInTheDocument();
    expect(authService.forgotPassword).not.toHaveBeenCalled();
  });

  it('handles successful forgot password dispatch (generic response)', async () => {
    const user = userEvent.setup();
    authService.forgotPassword.mockResolvedValueOnce({
      message: 'If an active account with that username or email exists, a password reset link has been dispatched.',
    });

    renderForgotPasswordPage();

    await user.type(screen.getByLabelText(/username or institutional email/i), 'netal@college.edu');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(authService.forgotPassword).toHaveBeenCalledWith({ identifier: 'netal@college.edu' });
    });

    await waitFor(() => {
      expect(screen.getByText(/reset request dispatched/i)).toBeInTheDocument();
      expect(screen.getByText(/the reset token expires in 15 minutes/i)).toBeInTheDocument();
    });
  });

  it('handles rate-limited response (429)', async () => {
    const user = userEvent.setup();
    authService.forgotPassword.mockRejectedValueOnce({
      status: 429,
      message: 'Too many password reset requests. Please try again later.',
    });

    renderForgotPasswordPage();

    await user.type(screen.getByLabelText(/username or institutional email/i), 'netal@college.edu');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/rate limited/i)).toBeInTheDocument();
      expect(screen.getByText(/too many password reset requests/i)).toBeInTheDocument();
    });
  });
});
