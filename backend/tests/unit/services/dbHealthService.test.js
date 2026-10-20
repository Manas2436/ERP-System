/**
 * backend/tests/unit/services/dbHealthService.test.js
 *
 * Unit tests for non-destructive database health checking service.
 */

'use strict';

const { checkDbHealth } = require('../../../src/services/dbHealthService');

describe('Services: dbHealthService.js', () => {
  it('should report live database connectivity without leaking credentials', async () => {
    const health = await checkDbHealth();

    expect(health).toBeDefined();
    expect(['connected', 'disconnected', 'unavailable']).toContain(health.status);

    if (health.status === 'connected') {
      expect(typeof health.latency_ms).toBe('number');
      expect(health.latency_ms).toBeGreaterThanOrEqual(0);
    } else {
      expect(typeof health.reason).toBe('string');
      // Must not leak passwords or host internal details
      expect(health.reason).not.toMatch(/password/i);
    }
  });
});
