/**
 * backend/src/services/emailService.js
 *
 * Dispatches transactional emails (e.g. password reset links)
 * using nodemailer via SMTP.
 */

'use strict';

const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // If credentials are configured, create active SMTP transporter
  if (env.SMTP_USER && env.SMTP_PASSWORD) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST || 'smtp.gmail.com',
      port: env.SMTP_PORT || 465,
      secure: env.SMTP_SECURE !== false, // true for 465, false for 587
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
    });
  } else {
    logger.warn('No SMTP credentials configured. Email sending will be skipped.');
  }

  return transporter;
}

/**
 * Sends a password reset email containing the secure one-time link.
 *
 * @param {object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.username - User's username
 * @param {string} params.resetToken - The raw reset token
 * @returns {Promise<boolean>} Whether the email was accepted for delivery
 */
async function sendPasswordResetEmail({ to, username, resetToken }) {
  if (process.env.NODE_ENV === 'test') {
    logger.info(`[TEST MODE] Suppressed email dispatch to ${to}`);
    return true;
  }

  const transport = getTransporter();
  if (!transport) {
    logger.warn(`Email not sent to ${to}: Transporter not configured.`);
    return false;
  }

  const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  const mailOptions = {
    from: env.EMAIL_FROM || `"College ERP" <${env.SMTP_USER}>`,
    to,
    subject: 'College ERP - Password Reset Request',
    text: `Hello ${username || 'User'},

A password reset request was received for your College ERP account.

Please use the following link to choose a new password:
${resetUrl}

This link is valid for ${env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES || 15} minutes.
If you did not request this password reset, please ignore this email or notify the system administrator.

Sincerely,
College ERP Security Team`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { text-align: center; margin-bottom: 24px; }
    .title { font-size: 20px; font-weight: 700; color: #1e3a8a; margin: 0 0 8px 0; }
    .subtitle { font-size: 14px; color: #64748b; margin: 0; }
    .content { font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px; }
    .btn-container { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2); }
    .link-alt { font-size: 12px; color: #64748b; word-break: break-all; margin-top: 16px; }
    .footer { border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 class="title">College ERP</h1>
      <p class="subtitle">Secure Authentication Portal</p>
    </div>
    <div class="content">
      <p>Hello <strong>${username || 'User'}</strong>,</p>
      <p>We received a request to reset your password. Click the button below to set a new password:</p>
      <div class="btn-container">
        <a href="${resetUrl}" class="btn" target="_blank" rel="noopener noreferrer">Set New Password</a>
      </div>
      <p>This password reset link is strictly valid for <strong>${env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES || 15} minutes</strong> and can only be used once.</p>
      <p class="link-alt">If the button does not work, copy and paste this URL into your browser:<br/><a href="${resetUrl}">${resetUrl}</a></p>
    </div>
    <div class="footer">
      <p>If you did not request this password reset, no action is needed. Your account remains secure.</p>
      <p>&copy; 2026 College ERP System. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`,
  };

  try {
    const info = await transport.sendMail(mailOptions);
    logger.info(`Password reset email delivered to ${to}`, { messageId: info.messageId });
    return true;
  } catch (error) {
    logger.error(`Failed to send password reset email to ${to}`, { error: error.message });
    return false;
  }
}

module.exports = {
  sendPasswordResetEmail,
  getTransporter,
};
