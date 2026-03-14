import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { invalidateSession } from '@/lib/session';
import { handleApiError } from '@/lib/errors';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('wedding_session')?.value;

    if (sessionToken) {
      const pool = getPool();
      await invalidateSession(pool, sessionToken);
    }

    const cookieStore = await cookies();
    cookieStore.set('wedding_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return Response.json({ data: { success: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
