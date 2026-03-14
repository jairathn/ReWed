import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { handleApiError, AppError } from '@/lib/errors';
import { guestRegisterSchema } from '@/lib/validation';
import { createGuestSession } from '@/lib/session';
import { cookies } from 'next/headers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();

    const parsed = guestRegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid guest ID');
    }

    const { guest_id } = parsed.data;
    const pool = getPool();

    // Resolve slug to wedding_id
    const weddingResult = await pool.query(
      'SELECT id, status FROM weddings WHERE slug = $1',
      [slug]
    );

    if (weddingResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND');
    }

    const wedding = weddingResult.rows[0];

    if (wedding.status === 'archived') {
      throw new AppError('WEDDING_INACTIVE');
    }

    // Verify guest exists for this wedding
    const guestResult = await pool.query(
      `SELECT id, first_name, last_name, email, group_label
       FROM guests WHERE id = $1 AND wedding_id = $2`,
      [guest_id, wedding.id]
    );

    if (guestResult.rows.length === 0) {
      throw new AppError('AUTH_GUEST_NOT_FOUND');
    }

    const guest = guestResult.rows[0];

    // Create session
    const userAgent = request.headers.get('user-agent') || undefined;
    const session = await createGuestSession(pool, {
      weddingId: wedding.id,
      guestId: guest.id,
      userAgent,
    });

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set('wedding_session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 90, // 90 days
    });

    return Response.json({
      data: {
        session_token: session.token,
        guest: {
          id: guest.id,
          first_name: guest.first_name,
          last_name: guest.last_name,
          display_name: `${guest.first_name} ${guest.last_name}`,
          email: guest.email,
          group_label: guest.group_label,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
