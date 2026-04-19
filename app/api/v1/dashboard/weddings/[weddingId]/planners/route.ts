import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { sendEmail, isResendConfigured } from '@/lib/email/resend-client';
import { buildGuestEmail } from '@/lib/email/templates';

const createSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().max(200).optional(),
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
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, email, access_token, created_at, revoked_at
       FROM planner_access
       WHERE wedding_id = $1
       ORDER BY revoked_at NULLS FIRST, created_at DESC`,
      [weddingId]
    );
    return Response.json({ data: { planners: result.rows } });
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
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    const pool = getPool();
    const token = generateAccessToken();

    // Upsert: re-granting an existing planner just refreshes the token and
    // clears any prior revocation so the new magic link works immediately.
    const upsert = await pool.query(
      `INSERT INTO planner_access (wedding_id, name, email, access_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (wedding_id, email)
       DO UPDATE SET name = EXCLUDED.name,
                     access_token = EXCLUDED.access_token,
                     revoked_at = NULL
       RETURNING id, name, email, access_token, created_at, revoked_at`,
      [weddingId, parsed.data.name || null, parsed.data.email, token]
    );

    const wedding = await pool.query(
      `SELECT display_name FROM weddings WHERE id = $1`,
      [weddingId]
    );
    const weddingName = wedding.rows[0]?.display_name || 'Your wedding';

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const magicLink = `${appUrl}/planner/${token}`;

    let emailSent = false;
    if (isResendConfigured()) {
      const { html, text } = buildGuestEmail({
        weddingName,
        heading: 'You\'ve been added as a wedding planner',
        body: `The couple gave you edit access to their master timeline and vendor list on ReWed.\n\nClick the button below to open the planner dashboard. The link works on any device and stays signed in for 90 days.`,
        ctaLabel: 'Open the planner dashboard',
        ctaUrl: magicLink,
        footerNote: 'This link is private — please don\'t share it.',
      });

      const result = await sendEmail({
        to: parsed.data.email,
        subject: `Planner access — ${weddingName}`,
        html,
        text,
      });
      emailSent = !result.error;
    }

    return Response.json({
      data: {
        ...upsert.rows[0],
        magic_link: magicLink,
        email_sent: emailSent,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
