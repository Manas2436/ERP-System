/**
 * backend/scripts/migrate.js
 *
 * Minimal, safe migration runner for College ERP.
 *
 * Functionality:
 *  1. Connects to the configured MySQL database (`college_erp`) using credentials
 *     from backend/.env via the project's env loader.
 *  2. Creates a tracking table `schema_migrations` if not already present.
 *  3. Scans `src/db/migrations/*.sql` in sorted order.
 *  4. Applies any unapplied migrations inside an isolated statement execution.
 *  5. Records applied migrations in `schema_migrations` to prevent duplicate runs.
 *  6. Does NOT drop tables, alter unrelated databases, or print credentials.
 *
 * Usage:
 *   npm run migrate
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

const MIGRATIONS_DIR = path.resolve(__dirname, '../src/db/migrations');

// Guard against missing credentials
if (!env.DB_USER || !env.DB_PASSWORD || !env.DB_NAME) {
  console.error('\n[migrate] [ERROR] Database credentials not configured in backend/.env');
  process.exit(1);
}

async function runMigrations() {
  console.log(`\n[migrate] Connecting to '${env.DB_NAME}' on ${env.DB_HOST}:${env.DB_PORT}...`);

  let connection;
  try {
    connection = await mysql.createConnection({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      multipleStatements: true,
      timezone: '+00:00',
    });

    console.log('[migrate] Connected successfully.');

    // 1. Ensure migration tracking table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        \`migration_name\` VARCHAR(255) NOT NULL UNIQUE,
        \`executed_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Fetch already executed migrations
    const [rows] = await connection.query(
      'SELECT `migration_name` FROM `schema_migrations`'
    );
    const appliedMigrations = new Set(rows.map((r) => r.migration_name));

    // 3. Read migration files
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    console.log(`[migrate] Found ${files.length} migration file(s).`);

    let appliedCount = 0;
    for (const file of files) {
      if (appliedMigrations.has(file)) {
        console.log(`[migrate] - ${file}: ALREADY APPLIED (skipping)`);
        continue;
      }

      console.log(`[migrate] -> Applying ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute SQL content
      await connection.query(sql);

      // Record in tracking table
      await connection.query(
        'INSERT INTO `schema_migrations` (`migration_name`) VALUES (?)',
        [file]
      );

      console.log(`[migrate] ✅ ${file} applied successfully.`);
      appliedCount++;
    }

    if (appliedCount === 0) {
      console.log('[migrate] Database is already up to date. No pending migrations.');
    } else {
      console.log(`[migrate] Finished applying ${appliedCount} migration(s).`);
    }

    console.log('\n[migrate] Migration process complete.\n');
  } catch (err) {
    console.error(`\n[migrate] [ERROR] Migration failed: ${err.message || err.code}`);
    if (err.sql) {
      console.error(`[migrate] [ERROR] Near SQL statement:\n${err.sql.substring(0, 300)}...`);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigrations();
