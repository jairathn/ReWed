import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';

// Phone accepts digits, spaces, hyphens, parens, and a leading +
// (e.g. "+34 622 48 92 76", "+1 (812) 484-8334"). We trim to 50 chars in schema.
const phoneSchema = z
  .string()
  .max(50)
  .regex(/^[+\d][\d\s()\-.]*$/, 'Use digits and optional leading +')
  .or(z.literal(''));

const createSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).nullable().optional(),
  category: z.string().max(150).nullable().optional(),
  email: z.string().email().max(255).or(z.literal('')).optional(),
  phone: phoneSchema.optional(),
  whatsapp: z.boolean().optional(),
  deposit_status: z.string().max(2000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

function generateAccessToken(): string {
  return randomBytes(24).toString('hex');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    await requireWeddingAccess(request, weddingId);

    const pool = getPool();
    const result = await pool.query(
      `SELECT v.id, v.name, v.company, v.category, v.email, v.phone, v.whatsapp,
              v.deposit_status, v.notes, v.access_token, v.created_at, v.updated_at,
              (SELECT COUNT(*)::int FROM timeline_entry_vendors tev WHERE tev.vendor_id = v.id) AS entry_count
       FROM vendors v
       WHERE v.wedding_id = $1
       ORDER BY v.category NULLS LAST, v.name ASC`,
      [weddingId]
    );

    return Response.json({ data: { vendors: result.rows } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    await requireWeddingAccess(request, weddingId);

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }
    const d = parsed.data;

    const pool = getPool();
    const ins = await pool.query(
      `INSERT INTO vendors
         (wedding_id, name, company, category, email, phone, whatsapp,
          deposit_status, notes, access_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, access_token`,
      [
        weddingId,
        d.name,
        d.company ?? null,
        d.category ?? null,
        d.email || null,
        d.phone || null,
        d.whatsapp ?? false,
        d.deposit_status ?? null,
        d.notes ?? null,
        generateAccessToken(),
      ]
    );

    return Response.json({
      data: { id: ins.rows[0].id, access_token: ins.rows[0].access_token },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
