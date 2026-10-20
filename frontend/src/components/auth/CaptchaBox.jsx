import React from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import Input from '../common/Input';

export const CaptchaBox = ({
  captchaSvg,
  question,
  captchaAnswer,
  onAnswerChange,
  onRefresh,
  isLoadingCaptcha,
  error,
}) => {
  const hasSvg = Boolean(captchaSvg && typeof captchaSvg === 'string' && captchaSvg.trim().startsWith('<'));
  const challengeQuestion = question || (!hasSvg && captchaSvg ? captchaSvg : null);

  return (
    <div className="space-y-1.5 text-left">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
        Security Verification
        <span className="text-red-500 ml-1" aria-hidden="true">*</span>
      </label>

      <div className="flex items-center gap-3">
        {/* Challenge Box */}
        <div
          className="relative flex-1 h-12 bg-slate-50 border border-slate-300 rounded-lg flex items-center justify-center overflow-hidden captcha-container select-none px-3"
          title="Security CAPTCHA challenge"
        >
          {isLoadingCaptcha ? (
            <div className="flex items-center gap-2 text-slate-500 text-xs animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Loading challenge...</span>
            </div>
          ) : hasSvg ? (
            <div
              className="w-full h-full flex items-center justify-center p-1"
              dangerouslySetInnerHTML={{ __html: captchaSvg }}
            />
          ) : challengeQuestion ? (
            <div className="flex items-center justify-center gap-2 text-slate-800 font-mono text-base font-bold tracking-wider">
              <span className="px-3 py-1 rounded bg-blue-50 border border-blue-200 text-blue-900 shadow-sm">
                {challengeQuestion}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-600 text-xs">
              <ShieldAlert className="w-4 h-4" />
              <span>Failed to load CAPTCHA</span>
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoadingCaptcha}
          aria-label="Refresh security CAPTCHA"
          className="h-12 w-12 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          <RefreshCw
            className={`w-4 h-4 ${isLoadingCaptcha ? 'animate-spin text-blue-600' : ''}`}
          />
        </button>
      </div>

      {/* Answer Input */}
      <Input
        id="captchaAnswer"
        name="captchaAnswer"
        placeholder="Enter characters shown above"
        value={captchaAnswer}
        onChange={onAnswerChange}
        required
        error={error}
        autoComplete="off"
        spellCheck="false"
      />
    </div>
  );
};

export default CaptchaBox;
