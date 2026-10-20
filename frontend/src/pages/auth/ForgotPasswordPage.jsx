import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import authService from '../../services/authService';
import apiClient from '../../services/apiClient';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import { KeyRound, ArrowLeft, User, CheckCircle2, Mail } from 'lucide-react';

export const ForgotPasswordPage = () => {
  const [identifier, setIdentifier] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [serverAlert, setServerAlert] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerAlert(null);
    setFormError('');
    setDevResetUrl(null);

    if (!identifier.trim()) {
      setFormError('Please enter your username or registered email.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await authService.forgotPassword({ identifier: identifier.trim() });

      // In local development (browser), check if a token was actually generated (account exists)
      let accountExists = true;
      if (import.meta.env.MODE !== 'test') {
        try {
          const devRes = await apiClient.get(`/auth/dev-reset-token/${encodeURIComponent(identifier.trim())}`);
          if (devRes.data?.data?.resetUrl) {
            setDevResetUrl(devRes.data.data.resetUrl);
            accountExists = true;
          } else if (devRes.data?.data === null) {
            accountExists = false;
          }
        } catch (_) {
          accountExists = true;
        }
      }

      if (!accountExists) {
        setIsSubmitted(false);
        setServerAlert({
          type: 'error',
          title: 'Account Not Found',
          message: 'Account does not exist. No registered user was found matching this username or email address.',
        });
        return;
      }

      setIsSubmitted(true);
      setServerAlert({
        type: 'success',
        title: 'Reset Request Dispatched',
        message: `Password reset link has been dispatched for ${identifier.trim()}.`,
      });
    } catch (err) {
      // If network or 429 rate limit happens:
      setServerAlert({
        type: err.status === 429 ? 'warning' : 'error',
        title: err.status === 429 ? 'Rate Limited' : 'Request Failed',
        message: err.message || 'Unable to process reset request at this time.',
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
            <KeyRound className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Forgot Password</h1>
            <p className="text-sm text-slate-500 mt-1">
              Enter your credentials to receive a password reset link
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

        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              id="identifier"
              name="identifier"
              label="Username or Institutional Email"
              placeholder="Enter username or email address"
              icon={User}
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setFormError('');
              }}
              required
              error={formError}
              disabled={isSubmitting}
              autoComplete="username"
            />

            <Button type="submit" className="w-full text-base py-3" isLoading={isSubmitting}>
              Send Reset Link
            </Button>
          </form>
        ) : (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Password reset instructions have been dispatched for your account.
              The reset token expires in 15 minutes.
            </p>
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

export default ForgotPasswordPage;
