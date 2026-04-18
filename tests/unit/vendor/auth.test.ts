import { describe, it, expect, vi } from 'vitest';
import { authenticateVendor } from '@/lib/vendor/auth';

function makePool(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query } as unknown as import('pg').Pool;
}

describe('authenticateVendor', () => {
  it('returns vendor + wedding when slug + token match', async () => {
    const pool = makePool([
      {
        vendor_id: 'v-1',
        name: 'Jas Johal',
        company: null,
        category: 'DJ / MC',
        email: 'jas@example.com',
        phone: '+44 1234',
        whatsapp: false,
        notes: null,
        wedding_id: 'w-1',
        slug: 'shriya-neil',
        display_name: 'Shriya & Neil',
        wedding_date: '2026-09-11',
        timezone: 'Europe/Madrid',
        venue_city: 'Barcelona',
        venue_country: 'Spain',
        config: {},
      },
    ]);

    const ctx = await authenticateVendor(
      pool,
      'shriya-neil',
      'a'.repeat(48)
    );
    expect(ctx.vendor.id).toBe('v-1');
    expect(ctx.wedding.slug).toBe('shriya-neil');
    expect(ctx.wedding.display_name).toBe('Shriya & Neil');
  });

  it('rejects when no row matches', async () => {
    const pool = makePool([]);
    await expect(
      authenticateVendor(pool, 'shriya-neil', 'b'.repeat(48))
    ).rejects.toMatchObject({ code: 'WEDDING_NOT_FOUND' });
  });

  it('rejects empty/short tokens before hitting the DB', async () => {
    const pool = makePool([]);
    await expect(authenticateVendor(pool, 'shriya-neil', '')).rejects.toMatchObject({
      code: 'WEDDING_NOT_FOUND',
    });
    await expect(authenticateVendor(pool, 'shriya-neil', 'short')).rejects.toMatchObject({
      code: 'WEDDING_NOT_FOUND',
    });
  });
});
