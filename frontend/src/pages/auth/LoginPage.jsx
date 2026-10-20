import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import authService from '../../services/authService';
import { getRoleDashboardPath } from '../../components/auth/PublicOnlyRoute';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import CaptchaBox from '../../components/auth/CaptchaBox';
import { GraduationCap, Lock, User, Eye, EyeOff, ShieldCheck, Info } from 'lucide-react';

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Form State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');

  // UI States
  const [isLoadingCaptcha, setIsLoadingCaptcha] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [serverAlert, setServerAlert] = useState(null); // { type: 'error'|'warning', title: string, message: string }

  // Fetch CAPTCHA on mount
  const fetchCaptcha = useCallback(async () => {
    setIsLoadingCaptcha(true);
    setCaptchaAnswer('');
    try {
      const data = await authService.getCaptcha();
      setCaptchaToken(data.captchaId || data.captchaToken);
      setCaptchaSvg(data.svg || '');
      setCaptchaQuestion(data.question || '');
    } catch (err) {
      setServerAlert({
        type: 'error',
        title: 'CAPTCHA Service Unavailable',
        message: err.message || 'Unable to load security verification challenge. Please refresh the page.',
      });
    } finally {
      setIsLoadingCaptcha(false);
    }
  }, []);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  // Client validation
  const validateForm = () => {
    const errors = {};
    if (!identifier.trim()) {
      errors.identifier = 'Username or institutional email is required.';
    }
    if (!password) {
      errors.password = 'Password is required.';
    }
    if (!captchaAnswer.trim()) {
      errors.captchaAnswer = 'Please enter the CAPTCHA characters.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerAlert(null);

    if (!validateForm()) {
      return;
    }

    if (!captchaToken) {
      setServerAlert({
        type: 'error',
        title: 'Security Token Missing',
        message: 'Security challenge is missing or still loading. Please refresh the CAPTCHA.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await login({
        identifier: identifier.trim(),
        username: identifier.trim(),
        password,
        captchaId: captchaToken,
        captchaToken,
        captchaAnswer: captchaAnswer.trim(),
      });

      // Role navigation strictly driven by server-issued user.role
      const targetPath =
        location.state?.from?.pathname || getRoleDashboardPath(user.role);
      navigate(targetPath, { replace: true });
    } catch (err) {
      // Backend error response status categorization
      const status = err.status;
      const message = err.message;

      // Always regenerate CAPTCHA on failed attempt to protect against replay/brute-force
      fetchCaptcha();

      if (status === 400) {
        // Validation failure or incorrect CAPTCHA
        setServerAlert({
          type: 'error',
          title: 'Invalid Submission',
          message: message || 'Invalid credentials or CAPTCHA answer. Please try again.',
        });
      } else if (status === 401) {
        // Invalid credentials
        setServerAlert({
          type: 'error',
          title: 'Authentication Failed',
          message: message || 'Invalid username/email or password.',
        });
      } else if (status === 403) {
        // Account deactivated
        setServerAlert({
          type: 'warning',
          title: 'Account Inactive',
          message: message || 'This account has been deactivated. Please contact your department administrator.',
        });
      } else if (status === 423) {
        // Account locked
        setServerAlert({
          type: 'warning',
          title: 'Account Temporarily Locked',
          message: message || 'Too many consecutive failed login attempts. Your account has been temporarily locked.',
        });
      } else if (status === 429) {
        // Rate limit exceeded
        setServerAlert({
          type: 'warning',
          title: 'Rate Limit Exceeded',
          message: message || 'Too many attempts from your IP address. Please wait before retrying.',
        });
      } else {
        // Network or 500 error
        setServerAlert({
          type: 'error',
          title: 'System Communication Error',
          message: message || 'Unable to establish secure connection with authentication service.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center py-10 px-4 sm:px-6 lg:px-8">
      {/* Main card */}
      <div className="w-full max-w-md space-y-6 bg-white border border-slate-200 p-8 sm:p-10 rounded-2xl shadow-xl">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-blue-700 text-white shadow-md">
            <GraduationCap className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Sign In to College ERP
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Centralized Institutional Authentication Portal
            </p>
          </div>
        </div>

        {/* Server Alert Message */}
        {serverAlert && (
          <Alert
            variant={serverAlert.type}
            title={serverAlert.title}
            message={serverAlert.message}
            onClose={() => setServerAlert(null)}
          />
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Identifier Input */}
          <Input
            id="identifier"
            name="identifier"
            label="Username or Institutional Email"
            placeholder="Enter username or email address"
            icon={User}
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              if (formErrors.identifier) {
                setFormErrors((prev) => ({ ...prev, identifier: null }));
              }
            }}
            required
            error={formErrors.identifier}
            autoComplete="username"
            disabled={isSubmitting}
          />

          {/* Password Input */}
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            label="Password"
            placeholder="••••••••••••"
            icon={Lock}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (formErrors.password) {
                setFormErrors((prev) => ({ ...prev, password: null }));
              }
            }}
            required
            error={formErrors.password}
            autoComplete="current-password"
            disabled={isSubmitting}
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

          {/* CAPTCHA Challenge & Input */}
          <CaptchaBox
            captchaSvg={captchaSvg}
            question={captchaQuestion}
            captchaAnswer={captchaAnswer}
            onAnswerChange={(e) => {
              setCaptchaAnswer(e.target.value);
              if (formErrors.captchaAnswer) {
                setFormErrors((prev) => ({ ...prev, captchaAnswer: null }));
              }
            }}
            onRefresh={fetchCaptcha}
            isLoadingCaptcha={isLoadingCaptcha}
            error={formErrors.captchaAnswer}
          />

          {/* Forgot Password Link */}
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-500 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Role verified by server
            </span>
            <Link
              to="/forgot-password"
              className="font-medium text-blue-600 hover:text-blue-800 transition-colors hover:underline"
            >
              Forgot Password?
            </Link>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full text-base py-3"
            isLoading={isSubmitting}
            disabled={isLoadingCaptcha || !captchaToken}
          >
            Authenticate & Enter
          </Button>
        </form>

        {/* Public Signup Disabled Information Banner */}
        <div className="pt-4 border-t border-slate-200">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-900">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              <strong className="text-blue-950">Self-registration is disabled.</strong> Student,
              Faculty, and Admin credentials are provisioned exclusively by Institutional
              Administration.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} College ERP Management System. All rights reserved.
      </footer>
    </div>
  );
};

export default LoginPage;
