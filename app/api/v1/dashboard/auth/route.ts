import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  display_name: z.string().min(1).max(200),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production-min-32-chars!!';
}

function signToken(coupleId: string, email: string): string {
  return jwt.sign(
    { sub: coupleId, email },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

/**
 * POST /api/v1/dashboard/auth
 * Register a new couple account or login.
 *
 * Body: { action: "register" | "login", ... }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'register') {
      const parsed = registerSchema.parse(body);
      const pool = getPool();

      // Check if email exists
      const existing = await pool.query(
        'SELECT id FROM couples WHERE email = $1',
        [parsed.email.toLowerCase()]
      );
      if (existing.rows.length > 0) {
        throw new AppError('AUTH_INVALID_CREDENTIALS', 'An account with this email already exists');
      }

      const passwordHash = await bcrypt.hash(parsed.password, 12);
      const result = await pool.query(
        `INSERT INTO couples (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name`,
        [parsed.email.toLowerCase(), passwordHash, parsed.display_name]
      );

      const couple = result.rows[0];
      const token = signToken(couple.id, couple.email);

      const response = NextResponse.json({
        couple: { id: couple.id, email: couple.email },
        message: 'Account created successfully',
      }, { status: 201 });

      response.cookies.set('couple_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/',
      });

      return response;
    }

    if (action === 'login') {
      const parsed = loginSchema.parse(body);
      const pool = getPool();

      const result = await pool.query(
        'SELECT id, email, password_hash FROM couples WHERE email = $1',
        [parsed.email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        throw new AppError('AUTH_INVALID_CREDENTIALS');
      }

      const couple = result.rows[0];
      const valid = await bcrypt.compare(parsed.password, couple.password_hash);
      if (!valid) {
        throw new AppError('AUTH_INVALID_CREDENTIALS');
      }

      const token = signToken(couple.id, couple.email);

      const response = NextResponse.json({
        couple: { id: couple.id, email: couple.email },
        message: 'Logged in successfully',
      });

      response.cookies.set('couple_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      });

      return response;
    }

    throw new AppError('VALIDATION_ERROR', 'action must be "register" or "login"');
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/v1/dashboard/auth
 * Returns the current couple's info from their JWT cookie.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('couple_token')?.value;
    if (!token) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    const decoded = jwt.verify(token, getJwtSecret()) as { sub: string; email: string };
    const pool = getPool();

    const result = await pool.query(
      'SELECT id, email, created_at FROM couples WHERE id = $1',
      [decoded.sub]
    );

    if (result.rows.length === 0) {
      throw new AppError('AUTH_INVALID_CREDENTIALS');
    }

    const couple = result.rows[0];
    return Response.json({ couple: { id: couple.id, email: couple.email, created_at: couple.created_at } });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return new AppError('AUTH_TOKEN_EXPIRED').toResponse();
    }
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/dashboard/auth
 * Logout — clears the couple_token cookie.
 */
export async function DELETE() {
  const response = NextResponse.json({ message: 'Logged out' });
  response.cookies.set('couple_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
