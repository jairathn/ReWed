import type { Pool } from 'pg';
import { AppError } from '@/lib/errors';

export type VendorContext = {
  vendor: {
    id: string;
    name: string;
    company: string | null;
    category: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: boolean;
    notes: string | null;
  };
  wedding: {
    id: string;
    slug: string;
    display_name: string;
    wedding_date: string | null;
    timezone: string | null;
    venue_city: string | null;
    venue_country: string | null;
    config: Record<string, unknown>;
  };
};

/**
 * Resolve the (slug, access_token) path params into the authenticated vendor
 * plus their wedding. Throws WEDDING_NOT_FOUND if anything doesn't match — we
 * deliberately do NOT reveal whether the slug or the token was the bad part.
 */
export async function authenticateVendor(
  pool: Pool,
  slug: string,
  token: string
): Promise<VendorContext> {
  if (!token || token.length < 16) throw new AppError('WEDDING_NOT_FOUND');

  const result = await pool.query(
    `SELECT v.id AS vendor_id, v.name, v.company, v.category, v.email,
            v.phone, v.whatsapp, v.notes,
            w.id AS wedding_id, w.slug, w.display_name, w.wedding_date,
            w.timezone, w.venue_city, w.venue_country, w.config
     FROM vendors v
     JOIN weddings w ON w.id = v.wedding_id
     WHERE w.slug = $1 AND v.access_token = $2
     LIMIT 1`,
    [slug, token]
  );

  if (result.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');

  const row = result.rows[0];
  return {
    vendor: {
      id: row.vendor_id,
      name: row.name,
      company: row.company,
      category: row.category,
      email: row.email,
      phone: row.phone,
      whatsapp: row.whatsapp,
      notes: row.notes,
    },
    wedding: {
      id: row.wedding_id,
      slug: row.slug,
      display_name: row.display_name,
      wedding_date: row.wedding_date,
      timezone: row.timezone,
      venue_city: row.venue_city,
      venue_country: row.venue_country,
      config: row.config || {},
    },
  };
}
