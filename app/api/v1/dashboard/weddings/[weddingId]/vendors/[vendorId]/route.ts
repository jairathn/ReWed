import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';

const phoneSchema = z
  .string()
  .max(50)
  .regex(/^[+\d][\d\s()\-.]*$/, 'Use digits and optional leading +')
  .or(z.literal(''));

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  company: z.string().max(200).nullable().optional(),
  category: z.string().max(150).nullable().optional(),
  email: z.string().email().max(255).or(z.literal('')).optional(),
  phone: phoneSchema.optional(),
  whatsapp: z.boolean().optional(),
  deposit_status: z.string().max(2000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  rotate_access_token: z.boolean().optional(),
});

async function ensureVendorOwned(weddingId: string, vendorId: string) {
  const pool = getPool();
  const row = await pool.query(
    `SELECT id FROM vendors WHERE id = $1 AND wedding_id = $2`,
    [vendorId, weddingId]
  );
  if (row.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; vendorId: string }> }
) {
  try {
    const { weddingId, vendorId } = await params;
    await requireWeddingAccess(request, weddingId);
    await ensureVendorOwned(weddingId, vendorId);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }
    const d = parsed.data;

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    const fields = [
      'name', 'company', 'category', 'email', 'phone',
      'whatsapp', 'deposit_status', 'notes',
    ] as const;
    for (const f of fields) {
      if (d[f] !== undefined) {
        updates.push(`${f} = $${i++}`);
        values.push(d[f] === '' ? null : d[f]);
      }
    }

    if (d.rotate_access_token) {
      updates.push(`access_token = $${i++}`);
      values.push(randomBytes(24).toString('hex'));
    }

    if (updates.length === 0) {
      return Response.json({ data: { id: vendorId } });
    }

    updates.push(`updated_at = NOW()`);
    values.push(vendorId);

    const pool = getPool();
    const result = await pool.query(
      `UPDATE vendors SET ${updates.join(', ')} WHERE id = $${i} RETURNING access_token`,
      values
    );
    return Response.json({
      data: { id: vendorId, access_token: result.rows[0].access_token },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; vendorId: string }> }
) {
  try {
    const { weddingId, vendorId } = await params;
    await requireWeddingAccess(request, weddingId);
    await ensureVendorOwned(weddingId, vendorId);

    const pool = getPool();
    await pool.query(`DELETE FROM vendors WHERE id = $1`, [vendorId]);
    return Response.json({ data: { id: vendorId } });
  } catch (error) {
    return handleApiError(error);
  }
}
