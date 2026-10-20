import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../pages/auth/LoginPage';
import { AuthProvider } from '../context/AuthContext';
import authService from '../services/authService';

vi.mock('../services/authService', () => ({
  default: {
    getCaptcha: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
  authService: {
    getCaptcha: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

const mockCaptcha = {
  captchaToken: 'test-captcha-token-abc',
  svg: '<svg><text>1234</text></svg>',
  expiresIn: 300,
};

const renderLoginForm = () => {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('LoginForm Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authService.getCaptcha.mockResolvedValue(mockCaptcha);
  });

  it('renders all form input fields and labels correctly', async () => {
    renderLoginForm();

    expect(screen.getByLabelText(/username or institutional email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter characters shown above/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /authenticate & enter/i })).toBeInTheDocument();
  });

  it('toggles password visibility when the show/hide button is clicked', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    const passwordInput = screen.getByLabelText(/^password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByRole('button', { name: /show password/i });
    await user.click(toggleButton);

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();
  });

  it('displays real-time client validation errors when submitting empty form', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    const submitButton = screen.getByRole('button', { name: /authenticate & enter/i });
    await user.click(submitButton);

    expect(screen.getByText(/username or institutional email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/^password is required/i)).toBeInTheDocument();
    expect(screen.getByText(/please enter the captcha characters/i)).toBeInTheDocument();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('allows user input typing and submits with valid payload', async () => {
    const user = userEvent.setup();
    authService.login.mockResolvedValue({
      token: 'valid-jwt-token',
      refreshToken: 'valid-refresh-token',
      user: { id: 1, role: 'STUDENT', username: 'student_user' },
    });

    renderLoginForm();

    await user.type(screen.getByLabelText(/username or institutional email/i), 'student_user');
    await user.type(screen.getByLabelText(/^password/i), 'SecurePass123!');
    await user.type(screen.getByPlaceholderText(/enter characters shown above/i), '1234');

    const submitButton = screen.getByRole('button', { name: /authenticate & enter/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(authService.login).toHaveBeenCalledWith({
        identifier: 'student_user',
        password: 'SecurePass123!',
        captchaToken: 'test-captcha-token-abc',
        captchaAnswer: '1234',
      });
    });
  });
});
