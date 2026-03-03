import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { slugSchema } from '@/lib/validation';
import { z } from 'zod';

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
  timezone: z.string().default('America/New_York'),
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
      `SELECT id, slug, display_name, wedding_date, status, config, package_config, created_at
       FROM weddings WHERE couple_id = $1 ORDER BY created_at DESC`,
      [coupleId]
    );

    return Response.json({ weddings: result.rows });
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

    const defaultConfig = {
      theme: { preset: 'classic', primary_color: '#8B7355' },
      features: {
        ai_portraits: true,
        social_feed: false,
        faq_chatbot: false,
        sms_notifications: false,
      },
      limits: { portraits_per_guest: 3 },
    };

    const result = await pool.query(
      `INSERT INTO weddings (couple_id, slug, display_name, wedding_date, timezone, config, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'setup')
       RETURNING id, slug, display_name, wedding_date, status, config, created_at`,
      [coupleId, parsed.slug, parsed.display_name, parsed.wedding_date || null, parsed.timezone, JSON.stringify(defaultConfig)]
    );

    return Response.json({ wedding: result.rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
