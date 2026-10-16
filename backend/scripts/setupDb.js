/**
 * backend/scripts/setupDb.js
 *
 * One-time database setup script.
 *
 * Run AFTER updating backend/.env with real MySQL credentials:
 *   node scripts/setupDb.js
 *
 * What it does:
 *  1. Reads credentials from .env (never hardcoded).
 *  2. Connects to MySQL without specifying a database first.
 *  3. Runs: CREATE DATABASE IF NOT EXISTS college_erp ...
 *  4. Prints success confirmation.
 *  5. Closes the connection.
 *
 * What it does NOT do:
 *  - Does NOT drop, reset, or alter any existing database.
 *  - Does NOT create any tables (that is handled by Stage 4 migrations).
 *  - Does NOT expose or print the password.
 *
 * Prerequisites:
 *  - MySQL service must be running.
 *  - DB_USER must have CREATE DATABASE privilege on the server.
 *  - backend/.env must have real (non-placeholder) DB_USER and DB_PASSWORD.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mysql = require('mysql2/promise');

const DB_HOST     = process.env.DB_HOST     || 'localhost';
const DB_PORT     = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER     = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME     = process.env.DB_NAME     || 'college_erp';

// Guard: refuse to run with placeholder values.
if (!DB_USER || DB_USER === 'your_mysql_user') {
  console.error('\n[ERROR] DB_USER is not set or is still a placeholder in backend/.env.');
  console.error('        Update DB_USER and DB_PASSWORD with your real MySQL credentials.\n');
  process.exit(1);
}
if (!DB_PASSWORD || DB_PASSWORD === 'your_mysql_password') {
  console.error('\n[ERROR] DB_PASSWORD is not set or is still a placeholder in backend/.env.');
  console.error('        Update DB_PASSWORD with your real MySQL password.\n');
  process.exit(1);
}

async function setup() {
  console.log(`\n[setupDb] Connecting to MySQL at ${DB_HOST}:${DB_PORT} as '${DB_USER}'...`);

  let conn;
  try {
    // Connect WITHOUT specifying a database so we can create it.
    conn = await mysql.createConnection({
      host    : DB_HOST,
      port    : DB_PORT,
      user    : DB_USER,
      password: DB_PASSWORD,
    });

    console.log('[setupDb] Connected successfully.');

    // Check MySQL version.
    const [[versionRow]] = await conn.query('SELECT VERSION() AS version');
    console.log(`[setupDb] MySQL version: ${versionRow.version}`);

    // Create database if not present.
    const createSql = `
      CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
        CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
    `;
    await conn.query(createSql);

    // Confirm.
    const [[dbRow]] = await conn.query(
      `SELECT SCHEMA_NAME AS db, DEFAULT_CHARACTER_SET_NAME AS charset,
              DEFAULT_COLLATION_NAME AS collation
       FROM information_schema.SCHEMATA
       WHERE SCHEMA_NAME = ?`,
      [DB_NAME]
    );

    if (dbRow) {
      console.log(`\n[setupDb] ✅ Database ready:`);
      console.log(`           Name    : ${dbRow.db}`);
      console.log(`           Charset : ${dbRow.charset}`);
      console.log(`           Collation: ${dbRow.collation}`);
    } else {
      console.error('[setupDb] ❌ Database creation appeared to succeed but verification failed.');
      process.exit(1);
    }

    console.log('\n[setupDb] Done. You can now start the backend: npm run dev\n');
  } catch (err) {
    // Print a safe error message — do not expose credentials.
    console.error(`\n[setupDb] ❌ Failed: ${err.code || err.message}`);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('          Check DB_USER and DB_PASSWORD in backend/.env.\n');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('          MySQL service does not appear to be running on',
        `${DB_HOST}:${DB_PORT}.\n`);
    }
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

setup();
