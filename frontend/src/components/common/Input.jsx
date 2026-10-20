import React, { forwardRef } from 'react';

export const Input = forwardRef(
  (
    {
      label,
      id,
      name,
      type = 'text',
      value,
      onChange,
      placeholder,
      error,
      helperText,
      required = false,
      disabled = false,
      icon: Icon,
      endAdornment,
      className = '',
      ...props
    },
    ref
  ) => {
    const inputId = id || name;

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
          >
            {label}
            {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <div className="relative rounded-lg shadow-sm">
          {Icon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            name={name}
            type={type}
            value={value}
            onChange={onChange}
            disabled={disabled}
            required={required}
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-help` : undefined}
            className={`w-full rounded-lg bg-white border text-slate-900 placeholder-slate-400 text-sm py-2.5 transition-colors duration-200 outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 disabled:opacity-50 disabled:bg-slate-100 ${
              Icon ? 'pl-9' : 'pl-3.5'
            } ${endAdornment ? 'pr-11' : 'pr-3.5'} ${
              error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-slate-300'
            } ${className}`}
            {...props}
          />

          {endAdornment && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              {endAdornment}
            </div>
          )}
        </div>

        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-xs text-red-400 font-medium">
            {error}
          </p>
        )}

        {!error && helperText && (
          <p id={`${inputId}-help`} className="text-xs text-slate-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
