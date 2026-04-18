import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { handleApiError, AppError } from '@/lib/errors';
import { guestSearchSchema } from '@/lib/validation';

const FUZZY_MAX_DISTANCE = 2;
const FUZZY_MAX_RESULTS = 5;

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const searchParams = request.nextUrl.searchParams;

    const parsed = guestSearchSchema.safeParse({
      q: searchParams.get('q'),
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Search query must be at least 2 characters');
    }

    const { q } = parsed.data;
    const query = normalize(q);
    const pool = getPool();

    // Resolve slug to wedding_id
    const weddingResult = await pool.query(
      'SELECT id FROM weddings WHERE slug = $1',
      [slug]
    );

    if (weddingResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND');
    }

    const weddingId = weddingResult.rows[0].id;

    const guestsResult = await pool.query(
      `SELECT id, first_name, last_name FROM guests WHERE wedding_id = $1`,
      [weddingId]
    );

    type Row = { id: string; first_name: string; last_name: string };
    const rows: Row[] = guestsResult.rows;
    const indexed = rows.map((g) => ({
      id: g.id,
      first_name: g.first_name,
      last_name: g.last_name,
      full: normalize(`${g.first_name} ${g.last_name}`),
      first: normalize(g.first_name),
    }));

    // Rule 1: Exact full-name match (case-insensitive)
    const exact = indexed.find((g) => g.full === query);
    if (exact) {
      return Response.json({
        data: {
          guests: [{ id: exact.id, first_name: exact.first_name, last_name: exact.last_name }],
          match_type: 'exact' as const,
        },
      });
    }

    // Rule 3: Unique first-name match (only if query is a single word)
    if (!query.includes(' ')) {
      const firstMatches = indexed.filter((g) => g.first === query);
      if (firstMatches.length === 1) {
        const only = firstMatches[0];
        return Response.json({
          data: {
            guests: [{ id: only.id, first_name: only.first_name, last_name: only.last_name }],
            match_type: 'unique_first' as const,
          },
        });
      }
    }

    // Rule 2: Fuzzy match (Levenshtein ≤ 2) on full name
    const fuzzy = indexed
      .map((g) => ({ guest: g, distance: levenshtein(query, g.full) }))
      .filter((r) => r.distance <= FUZZY_MAX_DISTANCE)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, FUZZY_MAX_RESULTS);

    if (fuzzy.length > 0) {
      return Response.json({
        data: {
          guests: fuzzy.map((f) => ({
            id: f.guest.id,
            first_name: f.guest.first_name,
            last_name: f.guest.last_name,
          })),
          match_type: 'fuzzy' as const,
        },
      });
    }

    return Response.json({
      data: { guests: [], match_type: 'none' as const },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
