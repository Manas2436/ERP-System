/**
 * backend/scripts/verifySchema.js
 *
 * Verifies the database schema, table definitions, constraints, indexes,
 * views, stored procedures, functions, triggers, and migrations for the
 * College ERP database.
 */

'use strict';

const mysql = require('mysql2/promise');
const env = require('../src/config/env');

async function verify() {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  console.log('\n================== DATABASE SCHEMA VERIFICATION ==================');
  console.log(`Target Database: ${env.DB_NAME} on ${env.DB_HOST}:${env.DB_PORT}\n`);

  console.log('--- 1. TABLE STRUCTURE: users ---');
  const [userCols] = await conn.query('DESCRIBE `users`');
  console.table(userCols);

  console.log('\n--- 2. TABLE STRUCTURE: user_audit_logs ---');
  const [auditCols] = await conn.query('DESCRIBE `user_audit_logs`');
  console.table(auditCols);

  console.log('\n--- 2b. TABLE STRUCTURE: refresh_tokens ---');
  const [refreshCols] = await conn.query('DESCRIBE `refresh_tokens`');
  console.table(refreshCols);

  console.log('\n--- 3. INDEXES: users, user_audit_logs & refresh_tokens ---');
  const [userIndexes] = await conn.query('SHOW INDEX FROM `users`');
  console.log('Table: users');
  console.table(
    userIndexes.map((idx) => ({
      Table: idx.Table,
      Key_name: idx.Key_name,
      Column_name: idx.Column_name,
      Non_unique: idx.Non_unique,
      Index_type: idx.Index_type,
    }))
  );

  const [auditIndexes] = await conn.query('SHOW INDEX FROM `user_audit_logs`');
  console.log('Table: user_audit_logs');
  console.table(
    auditIndexes.map((idx) => ({
      Table: idx.Table,
      Key_name: idx.Key_name,
      Column_name: idx.Column_name,
      Non_unique: idx.Non_unique,
      Index_type: idx.Index_type,
    }))
  );

  const [refreshIndexes] = await conn.query('SHOW INDEX FROM `refresh_tokens`');
  console.log('Table: refresh_tokens');
  console.table(
    refreshIndexes.map((idx) => ({
      Table: idx.Table,
      Key_name: idx.Key_name,
      Column_name: idx.Column_name,
      Non_unique: idx.Non_unique,
      Index_type: idx.Index_type,
    }))
  );

  console.log('\n--- 4. FOREIGN KEY CONSTRAINTS ---');
  const [fks] = await conn.query(
    `SELECT 
       TABLE_NAME,
       CONSTRAINT_NAME, 
       COLUMN_NAME, 
       REFERENCED_TABLE_NAME, 
       REFERENCED_COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? 
       AND REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY TABLE_NAME, CONSTRAINT_NAME`,
    [env.DB_NAME]
  );
  console.table(fks);

  console.log('\n--- 5. VIEWS ---');
  const [views] = await conn.query(
    `SELECT 
       TABLE_NAME AS \`View_Name\`,
       IS_UPDATABLE,
       DEFINER
     FROM information_schema.VIEWS
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME`,
    [env.DB_NAME]
  );
  console.table(views);

  console.log('\n--- 6. STORED PROCEDURES ---');
  const [procedures] = await conn.query(
    `SELECT 
       ROUTINE_NAME AS \`Procedure_Name\`,
       ROUTINE_TYPE,
       DEFINER,
       CREATED
     FROM information_schema.ROUTINES
     WHERE ROUTINE_SCHEMA = ? 
       AND ROUTINE_TYPE = 'PROCEDURE'
     ORDER BY ROUTINE_NAME`,
    [env.DB_NAME]
  );
  console.table(procedures);

  console.log('\n--- 7. USER-DEFINED FUNCTIONS (UDFs) ---');
  const [functions] = await conn.query(
    `SELECT 
       ROUTINE_NAME AS \`Function_Name\`,
       DATA_TYPE AS \`Return_Type\`,
       IS_DETERMINISTIC,
       SQL_DATA_ACCESS
     FROM information_schema.ROUTINES
     WHERE ROUTINE_SCHEMA = ? 
       AND ROUTINE_TYPE = 'FUNCTION'
     ORDER BY ROUTINE_NAME`,
    [env.DB_NAME]
  );
  console.table(functions);

  console.log('\n--- 8. TRIGGERS ---');
  const [triggers] = await conn.query(
    `SELECT 
       TRIGGER_NAME,
       EVENT_MANIPULATION,
       EVENT_OBJECT_TABLE,
       ACTION_TIMING,
       CREATED
     FROM information_schema.TRIGGERS
     WHERE TRIGGER_SCHEMA = ?
     ORDER BY TRIGGER_NAME`,
    [env.DB_NAME]
  );
  console.table(triggers);

  console.log('\n--- 9. APPLIED MIGRATIONS (schema_migrations) ---');
  const [migrations] = await conn.query(
    'SELECT `id`, `migration_name`, `executed_at` FROM `schema_migrations` ORDER BY `id` ASC'
  );
  console.table(migrations);

  console.log('==================================================================\n');

  await conn.end();
}

verify().catch((err) => {
  console.error('[verifySchema] [ERROR]:', err.message);
  process.exit(1);
});
