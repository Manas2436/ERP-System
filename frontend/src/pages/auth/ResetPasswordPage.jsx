import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import authService from '../../services/authService';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import { Lock, CheckCircle2, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [serverAlert, setServerAlert] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      setToken(urlToken);
    }
  }, [searchParams]);

  const validateForm = () => {
    const errors = {};
    if (!token.trim()) {
      errors.token = 'Reset token is required.';
    }
    if (!newPassword) {
      errors.newPassword = 'New password is required.';
    } else if (newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters long.';
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Confirmation password is required.';
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerAlert(null);

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const response = await authService.resetPassword({
        token: token.trim(),
        newPassword,
        confirmPassword,
      });

      setIsSuccess(true);
      setServerAlert({
        type: 'success',
        title: 'Password Reset Successful',
        message: response.message || 'Your password has been updated. You may now log in with your new password.',
      });
    } catch (err) {
      setServerAlert({
        type: 'error',
        title: 'Reset Failed',
        message: err.message || 'The reset link is invalid, expired, or has already been used.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 bg-white border border-slate-200 p-8 sm:p-10 rounded-2xl shadow-xl">
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Set New Password</h1>
            <p className="text-sm text-slate-500 mt-1">
              Choose a strong, unique password for your account
            </p>
          </div>
        </div>

        {serverAlert && (
          <Alert
            variant={serverAlert.type}
            title={serverAlert.title}
            message={serverAlert.message}
            onClose={() => setServerAlert(null)}
          />
        )}

        {!isSuccess ? (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {!searchParams.get('token') && (
              <Input
                id="token"
                name="token"
                label="Security Reset Token"
                placeholder="Paste the reset token from your email"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  if (formErrors.token) setFormErrors((p) => ({ ...p, token: null }));
                }}
                required
                error={formErrors.token}
                disabled={isSubmitting}
              />
            )}

            <Input
              id="newPassword"
              name="newPassword"
              type={showPassword ? 'text' : 'password'}
              label="New Password"
              placeholder="Minimum 8 characters"
              icon={Lock}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (formErrors.newPassword) setFormErrors((p) => ({ ...p, newPassword: null }));
              }}
              required
              error={formErrors.newPassword}
              disabled={isSubmitting}
              autoComplete="new-password"
              endAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              label="Confirm New Password"
              placeholder="Re-enter new password"
              icon={Lock}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (formErrors.confirmPassword) setFormErrors((p) => ({ ...p, confirmPassword: null }));
              }}
              required
              error={formErrors.confirmPassword}
              disabled={isSubmitting}
              autoComplete="new-password"
            />

            <Button type="submit" className="w-full text-base py-3" isLoading={isSubmitting}>
              Update Password
            </Button>
          </form>
        ) : (
          <div className="space-y-4 pt-2">
            <Button
              type="button"
              className="w-full text-base py-3"
              onClick={() => navigate('/login')}
            >
              Proceed to Sign In
            </Button>
          </div>
        )}

        <div className="pt-4 border-t border-slate-200 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Authentication
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
