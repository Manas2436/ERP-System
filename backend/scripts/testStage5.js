/**
 * backend/scripts/testStage5.js
 *
 * Automated verification and functional test suite for Stage 5:
 *   - User-Defined Functions (UDFs): fn_normalize_role, fn_format_role_label, fn_get_account_status
 *   - Stored Procedures: sp_create_user, sp_update_user_status, sp_update_user_role, sp_get_user_by_username
 *   - Triggers: trg_users_after_update
 *   - Audit Table: user_audit_logs
 *   - Views: vw_user_summary, vw_active_users
 *   - Full cleanup of test data
 *   - Health check service verification
 */

'use strict';

const mysql = require('mysql2/promise');
const env = require('../src/config/env');
const pool = require('../src/config/db');
const { checkDbHealth } = require('../src/services/dbHealthService');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}: ${details}`);
    throw new Error(`Assertion failed: ${testName} (${details})`);
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('       STAGE 5 AUTH STORED OBJECTS VERIFICATION TEST SUITE       ');
  console.log('================================================================\n');

  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  const createdUserIds = [];

  try {
    // -------------------------------------------------------------------------
    // TEST SECTION 1: USER-DEFINED FUNCTIONS (UDFs)
    // -------------------------------------------------------------------------
    console.log('--- 1. Testing User-Defined Functions (UDFs) ---');

    // 1.1 fn_normalize_role
    const [normAdmin] = await conn.query("SELECT fn_normalize_role('admin') AS val");
    assert(normAdmin[0].val === 'ADMIN', "fn_normalize_role('admin') -> 'ADMIN'");

    const [normFaculty] = await conn.query("SELECT fn_normalize_role('  faculty  ') AS val");
    assert(normFaculty[0].val === 'FACULTY', "fn_normalize_role('  faculty  ') -> 'FACULTY'");

    const [normStudent] = await conn.query("SELECT fn_normalize_role('Student') AS val");
    assert(normStudent[0].val === 'STUDENT', "fn_normalize_role('Student') -> 'STUDENT'");

    const [normInvalid] = await conn.query("SELECT fn_normalize_role('SUPERUSER') AS val");
    assert(normInvalid[0].val === null, "fn_normalize_role('SUPERUSER') -> NULL");

    const [normNull] = await conn.query("SELECT fn_normalize_role(NULL) AS val");
    assert(normNull[0].val === null, "fn_normalize_role(NULL) -> NULL");

    // 1.2 fn_format_role_label
    const [labelAdmin] = await conn.query("SELECT fn_format_role_label('ADMIN') AS val");
    assert(labelAdmin[0].val === 'Administrator', "fn_format_role_label('ADMIN') -> 'Administrator'");

    const [labelFaculty] = await conn.query("SELECT fn_format_role_label('FACULTY') AS val");
    assert(labelFaculty[0].val === 'Faculty Member', "fn_format_role_label('FACULTY') -> 'Faculty Member'");

    const [labelStudent] = await conn.query("SELECT fn_format_role_label('STUDENT') AS val");
    assert(labelStudent[0].val === 'Enrolled Student', "fn_format_role_label('STUDENT') -> 'Enrolled Student'");

    const [labelUnknown] = await conn.query("SELECT fn_format_role_label('UNKNOWN') AS val");
    assert(labelUnknown[0].val === 'Unknown', "fn_format_role_label('UNKNOWN') -> 'Unknown'");

    // 1.3 fn_get_account_status
    const [statusActive] = await conn.query("SELECT fn_get_account_status(1, NULL, NOW()) AS val");
    assert(statusActive[0].val === 'ACTIVE', 'fn_get_account_status(1, NULL, NOW()) -> ACTIVE');

    const [statusInactive] = await conn.query("SELECT fn_get_account_status(0, NULL, NOW()) AS val");
    assert(statusInactive[0].val === 'INACTIVE', 'fn_get_account_status(0, NULL, NOW()) -> INACTIVE');

    const [statusLocked] = await conn.query(
      "SELECT fn_get_account_status(1, DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW()) AS val"
    );
    assert(statusLocked[0].val === 'LOCKED', 'fn_get_account_status(1, future, NOW()) -> LOCKED');

    // -------------------------------------------------------------------------
    // TEST SECTION 2: STORED PROCEDURES (Safe Account Creation & Updates)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Stored Procedures ---');

    // 2.1 sp_create_user - Successful creations
    const testUsername1 = `test_admin_${Date.now()}`;
    const testEmail1 = `${testUsername1}@college.edu`;
    const dummyHash = '$2a$12$e8rXp90L4gqAOBs95k2R.uN.i6b0w1O99Qn3G37tYV3Yj7E2L6nWa';

    const [resCreate1] = await conn.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [testUsername1, testEmail1, dummyHash, 'admin', null]
    );
    const userId1 = resCreate1[0][0].user_id;
    assert(Number(userId1) > 0, `sp_create_user created admin user with ID ${userId1}`);
    createdUserIds.push(userId1);

    const testUsername2 = `test_student_${Date.now()}`;
    const testEmail2 = `${testUsername2}@college.edu`;
    const [resCreate2] = await conn.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [testUsername2, testEmail2, dummyHash, 'STUDENT', userId1]
    );
    const userId2 = resCreate2[0][0].user_id;
    assert(Number(userId2) > 0, `sp_create_user created student user with ID ${userId2} (created_by=${userId1})`);
    createdUserIds.push(userId2);

    // 2.2 sp_create_user - Validations
    let errorCaught = false;
    try {
      await conn.query('CALL sp_create_user(?, ?, ?, ?, ?, @dummy)', ['', testEmail1, dummyHash, 'ADMIN', null]);
    } catch (e) {
      errorCaught = true;
      assert(e.sqlState === '45000', 'sp_create_user rejects empty username (SQLSTATE 45000)');
    }
    assert(errorCaught, 'sp_create_user rejected empty username');

    errorCaught = false;
    try {
      await conn.query('CALL sp_create_user(?, ?, ?, ?, ?, @dummy)', ['valid_user', '', dummyHash, 'ADMIN', null]);
    } catch (e) {
      errorCaught = true;
      assert(e.sqlState === '45000', 'sp_create_user rejects empty email (SQLSTATE 45000)');
    }
    assert(errorCaught, 'sp_create_user rejected empty email');

    errorCaught = false;
    try {
      await conn.query('CALL sp_create_user(?, ?, ?, ?, ?, @dummy)', ['valid_user', 'u@test.com', '', 'ADMIN', null]);
    } catch (e) {
      errorCaught = true;
      assert(e.sqlState === '45000', 'sp_create_user rejects empty password hash (SQLSTATE 45000)');
    }
    assert(errorCaught, 'sp_create_user rejected empty password hash');

    errorCaught = false;
    try {
      await conn.query('CALL sp_create_user(?, ?, ?, ?, ?, @dummy)', ['valid_user', 'u@test.com', dummyHash, 'SUPERADMIN', null]);
    } catch (e) {
      errorCaught = true;
      assert(e.sqlState === '45000', 'sp_create_user rejects invalid role (SQLSTATE 45000)');
    }
    assert(errorCaught, 'sp_create_user rejected invalid role');

    // 2.3 sp_create_user - Uniqueness constraint enforcement
    errorCaught = false;
    try {
      await conn.query('CALL sp_create_user(?, ?, ?, ?, ?, @dummy)', [testUsername1, 'different@college.edu', dummyHash, 'FACULTY', null]);
    } catch (e) {
      errorCaught = true;
      assert(e.code === 'ER_DUP_ENTRY', 'Duplicate username rejected by uq_users_username constraint');
    }
    assert(errorCaught, 'Duplicate username was blocked');

    errorCaught = false;
    try {
      await conn.query('CALL sp_create_user(?, ?, ?, ?, ?, @dummy)', ['different_user', testEmail1, dummyHash, 'FACULTY', null]);
    } catch (e) {
      errorCaught = true;
      assert(e.code === 'ER_DUP_ENTRY', 'Duplicate email rejected by uq_users_email constraint');
    }
    assert(errorCaught, 'Duplicate email was blocked');

    // 2.4 sp_get_user_by_username
    const [lookupRows] = await conn.query('CALL sp_get_user_by_username(?)', [testUsername1]);
    const foundUser = lookupRows[0][0];
    assert(foundUser && foundUser.id === userId1, 'sp_get_user_by_username finds created user by username');
    assert(foundUser.role === 'ADMIN', 'sp_get_user_by_username returns correct role');
    assert(foundUser.password_hash === dummyHash, 'sp_get_user_by_username returns expected password_hash for backend auth');

    // 2.5 sp_update_user_status
    await conn.query('CALL sp_update_user_status(?, ?)', [userId2, 0]);
    const [checkInactive] = await conn.query('SELECT is_active FROM users WHERE id = ?', [userId2]);
    assert(checkInactive[0].is_active === 0, 'sp_update_user_status sets is_active = 0');

    await conn.query('CALL sp_update_user_status(?, ?)', [userId2, 1]);
    const [checkActive] = await conn.query('SELECT is_active FROM users WHERE id = ?', [userId2]);
    assert(checkActive[0].is_active === 1, 'sp_update_user_status restores is_active = 1');

    errorCaught = false;
    try {
      await conn.query('CALL sp_update_user_status(?, ?)', [userId2, 5]);
    } catch (e) {
      errorCaught = true;
      assert(e.sqlState === '45000', 'sp_update_user_status rejects invalid status value (SQLSTATE 45000)');
    }
    assert(errorCaught, 'sp_update_user_status rejected invalid status value');

    // 2.6 sp_update_user_role
    await conn.query('CALL sp_update_user_role(?, ?)', [userId2, 'FACULTY']);
    const [checkRole] = await conn.query('SELECT role FROM users WHERE id = ?', [userId2]);
    assert(checkRole[0].role === 'FACULTY', "sp_update_user_role updated role to 'FACULTY'");

    errorCaught = false;
    try {
      await conn.query('CALL sp_update_user_role(?, ?)', [userId2, 'ROOT']);
    } catch (e) {
      errorCaught = true;
      assert(e.sqlState === '45000', 'sp_update_user_role rejects unauthorized role value (SQLSTATE 45000)');
    }
    assert(errorCaught, 'sp_update_user_role rejected invalid role');

    // -------------------------------------------------------------------------
    // TEST SECTION 3: TRIGGERS & AUDIT TRAIL (trg_users_after_update)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Triggers and Audit Logging ---');

    const [auditRecords] = await conn.query(
      'SELECT * FROM user_audit_logs WHERE user_id = ? ORDER BY id ASC',
      [userId2]
    );

    // Expecting 3 audit records: 2 status changes (1->0, 0->1) and 1 role change (STUDENT->FACULTY)
    assert(auditRecords.length === 3, `Expected 3 audit log rows for user ${userId2}, found ${auditRecords.length}`);

    const [audit1, audit2, audit3] = auditRecords;
    assert(
      audit1.action === 'STATUS_CHANGE' && audit1.field_name === 'is_active' && audit1.old_value === '1' && audit1.new_value === '0',
      'Audit log recorded 1 -> 0 status transition correctly'
    );
    assert(
      audit2.action === 'STATUS_CHANGE' && audit2.field_name === 'is_active' && audit2.old_value === '0' && audit2.new_value === '1',
      'Audit log recorded 0 -> 1 status transition correctly'
    );
    assert(
      audit3.action === 'ROLE_CHANGE' && audit3.field_name === 'role' && audit3.old_value === 'STUDENT' && audit3.new_value === 'FACULTY',
      'Audit log recorded STUDENT -> FACULTY role change correctly'
    );

    // Controlled test: updating non-audited field (failed_login_attempts) should NOT create audit log entry
    await conn.query('UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?', [userId2]);
    const [auditAfterNonAudited] = await conn.query(
      'SELECT COUNT(1) AS cnt FROM user_audit_logs WHERE user_id = ?',
      [userId2]
    );
    assert(
      auditAfterNonAudited[0].cnt === 3,
      'Updating failed_login_attempts did NOT generate unnecessary audit log row'
    );

    // Verify secrets are NEVER stored in user_audit_logs
    const [suspiciousLogs] = await conn.query(
      `SELECT COUNT(1) AS cnt FROM user_audit_logs 
       WHERE field_name IN ('password_hash', 'password_reset_token_hash')`
    );
    assert(suspiciousLogs[0].cnt === 0, 'No secrets or password token hashes are present in user_audit_logs');

    // -------------------------------------------------------------------------
    // TEST SECTION 4: VIEWS (vw_user_summary, vw_active_users)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Views & Security Guarantees ---');

    // 4.1 Verify vw_user_summary columns contain no secret hashes
    const [viewSummaryCols] = await conn.query('DESCRIBE vw_user_summary');
    const summaryColNames = viewSummaryCols.map((c) => c.Field);
    assert(!summaryColNames.includes('password_hash'), 'vw_user_summary does NOT contain password_hash');
    assert(!summaryColNames.includes('password_reset_token_hash'), 'vw_user_summary does NOT contain password_reset_token_hash');
    assert(summaryColNames.includes('id') && summaryColNames.includes('username') && summaryColNames.includes('role'),
      'vw_user_summary contains appropriate administrative metadata columns');

    // 4.2 Query vw_user_summary
    const [summaryRows] = await conn.query('SELECT * FROM vw_user_summary WHERE id = ?', [userId1]);
    assert(summaryRows.length === 1 && summaryRows[0].username === testUsername1, 'vw_user_summary returns row for created user');

    // 4.3 Verify vw_active_users columns contain no secret hashes
    const [viewActiveCols] = await conn.query('DESCRIBE vw_active_users');
    const activeColNames = viewActiveCols.map((c) => c.Field);
    assert(!activeColNames.includes('password_hash'), 'vw_active_users does NOT contain password_hash');
    assert(!activeColNames.includes('password_reset_token_hash'), 'vw_active_users does NOT contain password_reset_token_hash');

    // 4.4 Verify filtering on vw_active_users
    // Deactivate userId2 temporarily
    await conn.query('UPDATE users SET is_active = 0 WHERE id = ?', [userId2]);
    const [activeRowsBefore] = await conn.query('SELECT * FROM vw_active_users WHERE id = ?', [userId2]);
    assert(activeRowsBefore.length === 0, 'vw_active_users filters out inactive user');

    await conn.query('UPDATE users SET is_active = 1 WHERE id = ?', [userId2]);
    const [activeRowsAfter] = await conn.query('SELECT * FROM vw_active_users WHERE id = ?', [userId2]);
    assert(activeRowsAfter.length === 1, 'vw_active_users includes user when active');

    // -------------------------------------------------------------------------
    // TEST SECTION 5: HEALTH CHECK SERVICE INTEGRATION
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing API Health Check Service ---');
    const health = await checkDbHealth();
    assert(health.status === 'connected', `checkDbHealth() status is '${health.status}'`);
    assert(typeof health.latency_ms === 'number' && health.latency_ms >= 0, `checkDbHealth() reports valid latency (${health.latency_ms}ms)`);

    console.log('\n================================================================');
    console.log(` ALL TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests} assertions) `);
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ TEST RUN ABORTED DUE TO ERROR:\n', err);
    throw err;
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP: Clean up test users and associated audit rows
    // -------------------------------------------------------------------------
    console.log('--- Cleaning up test records ---');
    if (createdUserIds.length > 0) {
      // Because foreign key on user_audit_logs is ON DELETE CASCADE, deleting users clears audit logs
      const placeholders = createdUserIds.map(() => '?').join(',');
      await conn.query(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds);
      console.log(`Cleaned up ${createdUserIds.length} test user record(s).`);
    }

    // Confirm users table is clean
    const [remainingTestUsers] = await conn.query(
      "SELECT COUNT(1) AS cnt FROM users WHERE username LIKE 'test_%'"
    );
    console.log(`Remaining test users in DB: ${remainingTestUsers[0].cnt}`);

    await conn.end();
    await pool.end();
  }
}

runTests().then(() => {
  process.exit(0);
}).catch(() => {
  process.exit(1);
});
