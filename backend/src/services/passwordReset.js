const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { pool } = require('../config/db');

const expiryMinutes = Math.min(60, Math.max(5, Number(process.env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES) || 15));
const devTokens = new Map();
let transporter;

function isMailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function getTransporter() {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return transporter;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function sendResetEmail(user, token) {
  const mailer = getTransporter();
  if (!mailer) return false;
  const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:5175').replace(/\/$/, '');
  const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const safeUsername = escapeHtml(user.username);
  await mailer.sendMail({
    from: process.env.EMAIL_FROM || `University ERP <${process.env.SMTP_USER}>`,
    to: user.email,
    subject: 'University ERP password reset',
    text: `Hello ${user.username},\n\nUse this one-time link to reset your password within ${expiryMinutes} minutes:\n${link}\n\nIf you did not request this, ignore this message.`,
    html: `<p>Hello ${safeUsername},</p><p>Use this one-time link to reset your password within ${expiryMinutes} minutes:</p><p><a href="${link}">Reset password</a></p><p>If you did not request this, ignore this message.</p>`,
  });
  return true;
}

async function requestReset(identifier) {
  const trimmed = identifier.trim();
  const [users] = await pool.execute(
    'SELECT user_id, username, email, is_active FROM app_user WHERE username=? OR email=? LIMIT 1',
    [trimmed, trimmed],
  );
  const user = users[0];
  if (!user || !user.is_active) {
    // Keep unknown/deactivated identifiers on a similar crypto path.
    crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      'UPDATE password_reset_tokens SET consumed_at=COALESCE(consumed_at,NOW()) WHERE user_id=? AND consumed_at IS NULL',
      [user.user_id],
    );
    await connection.execute(
      'INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(NOW(), INTERVAL ? MINUTE))',
      [user.user_id, tokenHash, expiryMinutes],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (process.env.NODE_ENV !== 'production') {
    devTokens.set(user.username.toLowerCase(), token);
    devTokens.set(user.email.toLowerCase(), token);
  }

  try {
    const delivered = await sendResetEmail(user, token);
    if (!delivered && process.env.NODE_ENV === 'production') {
      await pool.execute('UPDATE password_reset_tokens SET consumed_at=NOW() WHERE token_hash=? AND consumed_at IS NULL', [tokenHash]);
    }
  } catch (error) {
    // Never log the email address or raw token. Production cannot use a link
    // that the mail provider did not accept; local dev retains its test token.
    console.error('Password reset email delivery failed', { errorCode: error.code || error.name });
    if (process.env.NODE_ENV === 'production') {
      await pool.execute('UPDATE password_reset_tokens SET consumed_at=NOW() WHERE token_hash=? AND consumed_at IS NULL', [tokenHash]);
    }
  }
}

async function resetPassword(token, newPassword) {
  if (typeof token !== 'string' || !token.trim()) {
    const error = new Error('Reset token is required.'); error.statusCode = 400; throw error;
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    const error = new Error('Password must be between 8 and 128 characters.'); error.statusCode = 400; throw error;
  }

  const connection = await pool.getConnection();
  let username;
  let email;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT t.reset_token_id,t.user_id,t.expires_at,u.username,u.email,u.is_active
       FROM password_reset_tokens t JOIN app_user u ON u.user_id=t.user_id
       WHERE t.token_hash=? AND t.consumed_at IS NULL FOR UPDATE`,
      [hashToken(token.trim())],
    );
    const reset = rows[0];
    if (!reset || new Date(reset.expires_at) <= new Date() || !reset.is_active) {
      const error = new Error('Reset token is invalid, expired, or has already been used.'); error.statusCode = 400; throw error;
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await connection.execute(
      'UPDATE app_user SET password_hash=?,failed_attempts=0,locked_until=NULL WHERE user_id=?',
      [passwordHash, reset.user_id],
    );
    await connection.execute('UPDATE password_reset_tokens SET consumed_at=NOW() WHERE reset_token_id=?', [reset.reset_token_id]);
    await connection.execute(
      'UPDATE refresh_tokens SET is_revoked=1,revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=? AND is_revoked=0',
      [reset.user_id],
    );
    username = reset.username.toLowerCase();
    email = reset.email.toLowerCase();
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  devTokens.delete(username);
  devTokens.delete(email);
}

function getDevToken(identifier) {
  if (process.env.NODE_ENV === 'production' || typeof identifier !== 'string') return null;
  return devTokens.get(identifier.trim().toLowerCase()) || null;
}

module.exports = { expiryMinutes, isMailConfigured, requestReset, resetPassword, getDevToken };
