import { describe, it, expect, vi } from 'vitest';
import { checkPortraitQuota } from '@/lib/ai/quota';

describe('AI Portrait Quota', () => {
  it('allows generation when under quota', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({ rows: [{ count: '2' }] }),
    };

    const result = await checkPortraitQuota(mockClient as any, {
      weddingId: 'w-001',
      guestId: 'g-001',
      perGuestLimit: 5,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
    expect(result.used).toBe(2);
  });

  it('blocks generation when at quota', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({ rows: [{ count: '5' }] }),
    };

    const result = await checkPortraitQuota(mockClient as any, {
      weddingId: 'w-001',
      guestId: 'g-001',
      perGuestLimit: 5,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.used).toBe(5);
    expect(result.message).toContain("You've used all 5 of your portraits");
  });

  it('blocks generation when over quota', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({ rows: [{ count: '7' }] }),
    };

    const result = await checkPortraitQuota(mockClient as any, {
      weddingId: 'w-001',
      guestId: 'g-001',
      perGuestLimit: 5,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('handles zero usage correctly', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({ rows: [{ count: '0' }] }),
    };

    const result = await checkPortraitQuota(mockClient as any, {
      weddingId: 'w-001',
      guestId: 'g-001',
      perGuestLimit: 3,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
    expect(result.used).toBe(0);
  });

  it('queries only completed and processing jobs', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({ rows: [{ count: '0' }] }),
    };

    await checkPortraitQuota(mockClient as any, {
      weddingId: 'w-001',
      guestId: 'g-001',
      perGuestLimit: 5,
    });

    const [sql] = mockClient.query.mock.calls[0];
    expect(sql).toContain("'completed', 'processing'");
    expect(sql).toContain("type = 'portrait'");
  });
});
