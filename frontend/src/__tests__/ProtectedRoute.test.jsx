import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import * as AuthContextModule from '../context/AuthContext';

describe('ProtectedRoute Guard', () => {
  it('redirects to /login when user is not authenticated', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <div>Secret Admin Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Redirected to Login</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Redirected to Login')).toBeInTheDocument();
    expect(screen.queryByText('Secret Admin Dashboard')).not.toBeInTheDocument();
  });

  it('redirects to /unauthorized when user role does not match allowedRoles', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 10, username: 'student_user', role: 'STUDENT' },
    });

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <div>Secret Admin Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/unauthorized" element={<div>Access Denied 403</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Access Denied 403')).toBeInTheDocument();
    expect(screen.queryByText('Secret Admin Dashboard')).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated with permitted role', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 1, username: 'admin_user', role: 'ADMIN' },
    });

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <div>Secret Admin Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Secret Admin Dashboard')).toBeInTheDocument();
  });
});
