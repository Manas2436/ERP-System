import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from '../pages/auth/LoginPage';
import { AuthProvider } from '../context/AuthContext';
import authService from '../services/authService';

// Mock authService
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

const mockCaptchaResponse = {
  captchaToken: 'mock-captcha-token-123',
  svg: '<svg><text>ABCD</text></svg>',
  expiresIn: 300,
};

const renderLoginPage = (initialEntries = ['/login']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin/dashboard" element={<div>Admin Dashboard Page</div>} />
          <Route path="/faculty/dashboard" element={<div>Faculty Dashboard Page</div>} />
          <Route path="/student/dashboard" element={<div>Student Dashboard Page</div>} />
          <Route path="/forgot-password" element={<div>Forgot Password Page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('LoginPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authService.getCaptcha.mockResolvedValue(mockCaptchaResponse);
  });

  it('renders login form, controls, and disabled public registration notice', async () => {
    renderLoginPage();

    // Check headings and labels
    expect(screen.getByRole('heading', { name: /sign in to college erp/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username or institutional email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter characters shown above/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /authenticate & enter/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forgot password\?/i })).toBeInTheDocument();

    // Verify absence of public signup/registration
    expect(screen.getByText(/self-registration is disabled/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign up|register|create account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign up|register|create account/i })).not.toBeInTheDocument();
  });

  it('fetches and displays CAPTCHA on initial mount', async () => {
    renderLoginPage();

    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTitle(/security captcha challenge/i)).toBeInTheDocument();
  });

  it('refreshes CAPTCHA challenge when clicking the refresh button', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(1);
    });

    const refreshButton = screen.getByRole('button', { name: /refresh security captcha/i });
    await user.click(refreshButton);

    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(2);
    });
  });

  it('validates required fields before submitting to authService', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(1);
    });

    const submitButton = screen.getByRole('button', { name: /authenticate & enter/i });
    await user.click(submitButton);

    // Form errors should display
    expect(screen.getByText(/username or institutional email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(screen.getByText(/please enter the captcha characters/i)).toBeInTheDocument();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('handles successful login and routes according to server-issued role ADMIN', async () => {
    const user = userEvent.setup();
    authService.login.mockResolvedValueOnce({
      token: 'jwt-access-token-admin',
      refreshToken: 'jwt-refresh-token-admin',
      tokenType: 'Bearer',
      expiresIn: '8h',
      user: {
        id: 1,
        username: 'netal_admin',
        email: 'netal@college.edu',
        role: 'ADMIN',
      },
    });

    renderLoginPage();

    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(1);
    });

    await user.type(screen.getByLabelText(/username or institutional email/i), 'netal_admin');
    await user.type(screen.getByLabelText(/^password/i), 'AdminPassword123!');
    await user.type(screen.getByPlaceholderText(/enter characters shown above/i), 'ABCD');

    await user.click(screen.getByRole('button', { name: /authenticate & enter/i }));

    await waitFor(() => {
      expect(authService.login).toHaveBeenCalledWith({
        identifier: 'netal_admin',
        password: 'AdminPassword123!',
        captchaToken: 'mock-captcha-token-123',
        captchaAnswer: 'ABCD',
      });
    });

    // Verify redirected to Admin Dashboard
    await waitFor(() => {
      expect(screen.getByText('Admin Dashboard Page')).toBeInTheDocument();
    });
  });

  it('routes to Faculty Dashboard when server-issued role is FACULTY', async () => {
    const user = userEvent.setup();
    authService.login.mockResolvedValueOnce({
      token: 'jwt-access-token-faculty',
      refreshToken: 'jwt-refresh-token-faculty',
      tokenType: 'Bearer',
      expiresIn: '8h',
      user: {
        id: 2,
        username: 'prof_mohit',
        email: 'mohit@college.edu',
        role: 'FACULTY',
      },
    });

    renderLoginPage();

    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(1);
    });

    await user.type(screen.getByLabelText(/username or institutional email/i), 'prof_mohit');
    await user.type(screen.getByLabelText(/^password/i), 'FacultyPass123!');
    await user.type(screen.getByPlaceholderText(/enter characters shown above/i), 'ABCD');

    await user.click(screen.getByRole('button', { name: /authenticate & enter/i }));

    await waitFor(() => {
      expect(screen.getByText('Faculty Dashboard Page')).toBeInTheDocument();
    });
  });

  it('routes to Student Dashboard when server-issued role is STUDENT', async () => {
    const user = userEvent.setup();
    authService.login.mockResolvedValueOnce({
      token: 'jwt-access-token-student',
      refreshToken: 'jwt-refresh-token-student',
      tokenType: 'Bearer',
      expiresIn: '8h',
      user: {
        id: 3,
        username: 'nidhi_student',
        email: 'nidhi@college.edu',
        role: 'STUDENT',
      },
    });

    renderLoginPage();

    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(1);
    });

    await user.type(screen.getByLabelText(/username or institutional email/i), 'nidhi_student');
    await user.type(screen.getByLabelText(/^password/i), 'StudentPass123!');
    await user.type(screen.getByPlaceholderText(/enter characters shown above/i), 'ABCD');

    await user.click(screen.getByRole('button', { name: /authenticate & enter/i }));

    await waitFor(() => {
      expect(screen.getByText('Student Dashboard Page')).toBeInTheDocument();
    });
  });

  it('handles invalid credentials (401) and refreshes CAPTCHA', async () => {
    const user = userEvent.setup();
    authService.login.mockRejectedValueOnce({
      status: 401,
      message: 'Invalid username/email or password.',
    });

    renderLoginPage();

    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(1);
    });

    await user.type(screen.getByLabelText(/username or institutional email/i), 'wrong_user');
    await user.type(screen.getByLabelText(/^password/i), 'WrongPass123!');
    await user.type(screen.getByPlaceholderText(/enter characters shown above/i), 'ABCD');

    await user.click(screen.getByRole('button', { name: /authenticate & enter/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid username\/email or password/i)).toBeInTheDocument();
    });

    // CAPTCHA must be refreshed on failed attempt
    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(2);
    });
  });

  it('handles wrong CAPTCHA answer (400) and displays clear alert', async () => {
    const user = userEvent.setup();
    authService.login.mockRejectedValueOnce({
      status: 400,
      message: 'Invalid or expired CAPTCHA. Please try again.',
    });

    renderLoginPage();

    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(1);
    });

    await user.type(screen.getByLabelText(/username or institutional email/i), 'netal_admin');
    await user.type(screen.getByLabelText(/^password/i), 'AdminPassword123!');
    await user.type(screen.getByPlaceholderText(/enter characters shown above/i), 'WRONG');

    await user.click(screen.getByRole('button', { name: /authenticate & enter/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid or expired captcha/i)).toBeInTheDocument();
    });
  });

  it('handles temporarily locked account (423)', async () => {
    const user = userEvent.setup();
    authService.login.mockRejectedValueOnce({
      status: 423,
      message: 'Account is temporarily locked due to excessive failed login attempts.',
    });

    renderLoginPage();

    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(1);
    });

    await user.type(screen.getByLabelText(/username or institutional email/i), 'netal_admin');
    await user.type(screen.getByLabelText(/^password/i), 'Password123!');
    await user.type(screen.getByPlaceholderText(/enter characters shown above/i), 'ABCD');

    await user.click(screen.getByRole('button', { name: /authenticate & enter/i }));

    await waitFor(() => {
      expect(screen.getByText(/account temporarily locked/i)).toBeInTheDocument();
      expect(screen.getByText(/account is temporarily locked due to excessive failed login attempts/i)).toBeInTheDocument();
    });
  });

  it('handles deactivated account (403)', async () => {
    const user = userEvent.setup();
    authService.login.mockRejectedValueOnce({
      status: 403,
      message: 'Account is deactivated. Please contact administrator.',
    });

    renderLoginPage();

    await waitFor(() => {
      expect(authService.getCaptcha).toHaveBeenCalledTimes(1);
    });

    await user.type(screen.getByLabelText(/username or institutional email/i), 'deactivated_user');
    await user.type(screen.getByLabelText(/^password/i), 'Password123!');
    await user.type(screen.getByPlaceholderText(/enter characters shown above/i), 'ABCD');

    await user.click(screen.getByRole('button', { name: /authenticate & enter/i }));

    await waitFor(() => {
      expect(screen.getByText(/account inactive/i)).toBeInTheDocument();
      expect(screen.getByText(/account is deactivated\. please contact administrator\./i)).toBeInTheDocument();
    });
  });
});
