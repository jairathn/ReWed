import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { trackActivity } from '@/lib/activity';
import { sanitizeText } from '@/lib/validation';
import { handleApiError, AppError } from '@/lib/errors';

const contactShareSchema = z.object({
  instagram_handle: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(255).optional(),
  share_message: z.string().max(500).optional(),
}).refine(
  (d) => d.instagram_handle || d.phone || d.email,
  'Please share at least one way to stay connected'
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const pool = getPool();

    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) throw new AppError('AUTH_NOT_REGISTERED');

    const session = await validateSession(pool, sessionToken);
    if (!session) throw new AppError('AUTH_TOKEN_EXPIRED');

    const result = await pool.query(
      `SELECT cs.id, cs.instagram_handle, cs.phone, cs.email, cs.share_message, cs.created_at,
              g.id as guest_id, g.first_name, g.last_name, g.display_name, g.group_label
       FROM contact_shares cs
       JOIN guests g ON cs.guest_id = g.id
       WHERE cs.wedding_id = $1
       ORDER BY cs.created_at DESC`,
      [session.weddingId]
    );

    // Check if current guest has shared
    const myShare = result.rows.find(r => r.guest_id === session.guestId);

    return Response.json({
      data: {
        contacts: result.rows.map(r => ({
          id: r.id,
          guest: {
            id: r.guest_id,
            first_name: r.first_name,
            last_name: r.last_name,
            display_name: r.display_name,
            group_label: r.group_label,
          },
          instagram_handle: r.instagram_handle,
          phone: r.phone,
          email: r.email,
          share_message: r.share_message,
          is_you: r.guest_id === session.guestId,
        })),
        my_share: myShare ? {
          instagram_handle: myShare.instagram_handle,
          phone: myShare.phone,
          email: myShare.email,
          share_message: myShare.share_message,
        } : null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const pool = getPool();

    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) throw new AppError('AUTH_NOT_REGISTERED');

    const session = await validateSession(pool, sessionToken);
    if (!session) throw new AppError('AUTH_TOKEN_EXPIRED');

    const body = await request.json();
    const parsed = contactShareSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message || parsed.error.errors[0]?.message);
    }

    await pool.query(
      `INSERT INTO contact_shares (wedding_id, guest_id, instagram_handle, phone, email, share_message)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (wedding_id, guest_id)
       DO UPDATE SET instagram_handle = $3, phone = $4, email = $5, share_message = $6`,
      [
        session.weddingId,
        session.guestId,
        parsed.data.instagram_handle || null,
        parsed.data.phone || null,
        parsed.data.email || null,
        parsed.data.share_message ? sanitizeText(parsed.data.share_message) : null,
      ]
    );

    await trackActivity(pool, {
      weddingId: session.weddingId,
      guestId: session.guestId,
      eventType: 'contact_shared',
    });

    return Response.json({ data: { saved: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
