import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { slugSchema } from '@/lib/validation';
import { z } from 'zod';
import { generateWeddingQrCode, uploadQrCodeToR2 } from '@/lib/qr';
import { getMediaUrl } from '@/lib/storage/r2';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production-min-32-chars!!';
}

function getCoupleId(request: NextRequest): string {
  const token = request.cookies.get('couple_token')?.value;
  if (!token) throw new AppError('AUTH_NOT_REGISTERED');

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { sub: string };
    return decoded.sub;
  } catch {
    throw new AppError('AUTH_TOKEN_EXPIRED');
  }
}

const createWeddingSchema = z.object({
  slug: slugSchema,
  display_name: z.string().min(1).max(200),
  wedding_date: z.string().optional(),
  timezone: z.string().max(100).optional(),
  venue_city: z.string().max(200).optional(),
  venue_country: z.string().max(200).optional(),
  venue_lat: z.number().min(-90).max(90).optional(),
  venue_lng: z.number().min(-180).max(180).optional(),
  guest_count: z.string().optional(),
  event_count: z.string().optional(),
  features: z.object({
    ai_portraits: z.boolean().default(true),
    social_feed: z.boolean().default(false),
    faq_chatbot: z.boolean().default(false),
  }).optional(),
});

/**
 * GET /api/v1/dashboard/weddings
 * List all weddings for the authenticated couple.
 */
export async function GET(request: NextRequest) {
  try {
    const coupleId = getCoupleId(request);
    const pool = getPool();

    const result = await pool.query(
      `SELECT id, slug, display_name, wedding_date, status, config, package_config, qr_code_key, created_at
       FROM weddings WHERE couple_id = $1 ORDER BY created_at DESC`,
      [coupleId]
    );

    const weddings = await Promise.all(result.rows.map(async (w: Record<string, unknown>) => ({
      ...w,
      qr_code_url: w.qr_code_key ? await getMediaUrl(w.qr_code_key as string) : null,
    })));

    return Response.json({ weddings });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/dashboard/weddings
 * Create a new wedding for the authenticated couple.
 */
export async function POST(request: NextRequest) {
  try {
    const coupleId = getCoupleId(request);
    const body = await request.json();
    const parsed = createWeddingSchema.parse(body);
    const pool = getPool();

    // Check slug uniqueness
    const existing = await pool.query('SELECT id FROM weddings WHERE slug = $1', [parsed.slug]);
    if (existing.rows.length > 0) {
      throw new AppError('WEDDING_SLUG_TAKEN');
    }

    const features = parsed.features;
    const weddingConfig = {
      theme: { preset: 'classic', primary_color: '#8B7355' },
      features: {
        ai_portraits: features?.ai_portraits ?? true,
        social_feed: features?.social_feed ?? false,
        faq_chatbot: features?.faq_chatbot ?? false,
        sms_notifications: false,
      },
      limits: { portraits_per_guest: 3 },
    };

    const packageConfig = {
      guest_count: parsed.guest_count || '200',
      event_count: parsed.event_count || '1 event',
    };

    const result = await pool.query(
      `INSERT INTO weddings (couple_id, slug, display_name, wedding_date, timezone, venue_city, venue_country, venue_lat, venue_lng, config, package_config, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, 'setup')
       RETURNING id, slug, display_name, wedding_date, timezone, venue_city, venue_country, venue_lat, venue_lng, status, config, package_config, created_at`,
      [coupleId, parsed.slug, parsed.display_name, parsed.wedding_date || null, parsed.timezone || 'America/New_York', parsed.venue_city || null, parsed.venue_country || null, parsed.venue_lat || null, parsed.venue_lng || null, JSON.stringify(weddingConfig), JSON.stringify(packageConfig)]
    );

    const wedding = result.rows[0];

    // Auto-generate QR code for the guest sign-in page
    try {
      const pngBuffer = await generateWeddingQrCode(parsed.slug);
      const qrKey = await uploadQrCodeToR2(wedding.id, pngBuffer);
      await pool.query('UPDATE weddings SET qr_code_key = $1 WHERE id = $2', [qrKey, wedding.id]);
      wedding.qr_code_url = await getMediaUrl(qrKey);
    } catch (err) {
      // QR generation is non-blocking — wedding still created if R2 is unavailable
      console.warn('[wedding-create] QR code generation failed:', err);
    }

    return Response.json({ wedding }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
