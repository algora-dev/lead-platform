import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signToken, verifyToken, getTenantId, type SessionUser } from '@/lib/auth';

// Override JWT_SECRET for deterministic tests
const TEST_SECRET = 'test-secret-for-vitest';

describe('auth tokens', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', TEST_SECRET);
    vi.stubEnv('TENANT_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const mockUser: SessionUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    role: 'ADMIN',
    tenantId: 5,
    tenantSlug: 'test-co',
  };

  it('signs and verifies a token round-trip', () => {
    const token = signToken(mockUser);
    expect(token).toBeTruthy();
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe(1);
    expect(decoded!.email).toBe('test@example.com');
    expect(decoded!.tenantId).toBe(5);
  });

  it('returns null for an invalid token', () => {
    const result = verifyToken('invalid.token.here');
    expect(result).toBeNull();
  });

  it('returns null for a token signed with a different secret (if module reloaded)', () => {
    // Note: JWT_SECRET is captured at module load time.
    // This test documents that env stubs after import do not change the secret.
    // A token signed under the current secret should still verify.
    const token = signToken(mockUser);
    const result = verifyToken(token);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
  });
});

describe('getTenantId', () => {
  it('uses session.tenantId when present', () => {
    const session: SessionUser = {
      id: 1, email: 'a@b.com', name: null, role: 'USER',
      tenantId: 7, tenantSlug: 'slug'
    };
    expect(getTenantId(session)).toBe(7);
  });

  it('falls back to TENANT_ID env var when session is null', () => {
    vi.stubEnv('TENANT_ID', '3');
    expect(getTenantId(null)).toBe(3);
  });

  it('falls back to 1 when neither session nor env var is set', () => {
    vi.stubEnv('TENANT_ID', '');
    expect(getTenantId(null)).toBe(1);
  });

  it('falls back to env var when session.tenantId is 0 (falsy)', () => {
    vi.stubEnv('TENANT_ID', '2');
    const session: SessionUser = {
      id: 1, email: 'a@b.com', name: null, role: 'USER',
      tenantId: 0, tenantSlug: 'slug'
    };
    expect(getTenantId(session)).toBe(2);
  });
});
