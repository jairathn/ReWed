import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
  connect: vi.fn(),
};

vi.mock('@/lib/db/client', () => ({
  getPool: () => mockPool,
}));

import { createGuestSession, validateSession } from '@/lib/session';

describe('Guest Session Management', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('createGuestSession', () => {
    it('creates a session and returns a token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 's-001' }] });

      const result = await createGuestSession(mockPool as unknown as import('pg').Pool, {
        weddingId: 'w-001',
        guestId: 'g-001',
        userAgent: 'Mozilla/5.0',
      });

      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(32);
      expect(result.guestId).toBe('g-001');
      expect(result.sessionId).toBe('s-001');

      // Verify the INSERT was called with correct params
      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO sessions');
      expect(params[0]).toBe('w-001');  // wedding_id
      expect(params[1]).toBe('g-001');  // guest_id
      expect(params[2]).toBeDefined();  // token_hash (not the raw token!)
      expect(params[2]).not.toBe(result.token); // hash !== token
      expect(params[3]).toBe('Mozilla/5.0'); // user_agent
    });

    it('generates unique tokens for different calls', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 's-001' }] });

      const session1 = await createGuestSession(mockPool as unknown as import('pg').Pool, {
        weddingId: 'w-001',
        guestId: 'g-001',
      });
      const session2 = await createGuestSession(mockPool as unknown as import('pg').Pool, {
        weddingId: 'w-001',
        guestId: 'g-001',
      });

      expect(session1.token).not.toBe(session2.token);
    });
  });

  describe('validateSession', () => {
    it('returns session data for a valid token', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 's-001', wedding_id: 'w-001', guest_id: 'g-001' }],
        })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE last_active

      const result = await validateSession(mockPool as unknown as import('pg').Pool, 'some-token');

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('s-001');
      expect(result!.weddingId).toBe('w-001');
      expect(result!.guestId).toBe('g-001');

      // Verify it looked up by token_hash, not raw token
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('token_hash');
      expect(params[0]).not.toBe('some-token'); // should be hashed
    });

    it('returns null for an invalid token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await validateSession(mockPool as unknown as import('pg').Pool, 'invalid-token');

      expect(result).toBeNull();
    });

    it('updates last_active on valid session lookup', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 's-001', wedding_id: 'w-001', guest_id: 'g-001' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await validateSession(mockPool as unknown as import('pg').Pool, 'some-token');

      expect(mockQuery).toHaveBeenCalledTimes(2);
      const [updateSql] = mockQuery.mock.calls[1];
      expect(updateSql).toContain('UPDATE sessions SET last_active');
    });
  });
});
