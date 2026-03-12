import { NextRequest } from 'next/server';
import { authenticateTravelRequest } from '@/lib/travel/auth';
import { handleApiError } from '@/lib/errors';

// GET /api/v1/w/[slug]/travel/map — all non-private travel stops for the map
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { pool, weddingId } = await authenticateTravelRequest(request, slug);

    // Get all stops from non-private plans, excluding arrival/departure (wedding destination)
    const result = await pool.query(
      `SELECT
         ts.id, ts.city, ts.country, ts.country_code,
         ts.latitude, ts.longitude, ts.stop_type,
         ts.arrive_date, ts.depart_date, ts.open_to_meetup, ts.notes AS stop_notes,
         g.id AS guest_id, g.display_name,
         tp.visibility
       FROM travel_stops ts
       JOIN travel_plans tp ON ts.plan_id = tp.id
       JOIN guests g ON tp.guest_id = g.id
       WHERE ts.wedding_id = $1
         AND tp.visibility != 'private'
         AND ts.stop_type NOT IN ('arrival', 'departure')
       ORDER BY ts.city, ts.arrive_date`,
      [weddingId]
    );

    // Group by city (using city+country as key)
    const cityMap = new Map<string, {
      city: string;
      country: string;
      country_code: string | null;
      latitude: number;
      longitude: number;
      guests: Array<{
        guest_id: string;
        display_name: string;
        arrive_date: string | null;
        depart_date: string | null;
        open_to_meetup: boolean;
        notes: string | null;
        stop_type: string;
        visibility: string;
      }>;
    }>();

    for (const row of result.rows) {
      const key = `${row.city}|${row.country}`;
      if (!cityMap.has(key)) {
        cityMap.set(key, {
          city: row.city,
          country: row.country,
          country_code: row.country_code,
          latitude: row.latitude,
          longitude: row.longitude,
          guests: [],
        });
      }

      const isCityOnly = row.visibility === 'city_only';

      cityMap.get(key)!.guests.push({
        guest_id: row.guest_id,
        display_name: row.display_name,
        arrive_date: isCityOnly ? null : row.arrive_date,
        depart_date: isCityOnly ? null : row.depart_date,
        open_to_meetup: row.open_to_meetup,
        notes: isCityOnly ? null : row.stop_notes,
        stop_type: row.stop_type,
        visibility: row.visibility,
      });
    }

    const stops = Array.from(cityMap.values()).map((city) => ({
      ...city,
      guest_count: city.guests.length,
    }));

    return Response.json({ data: { stops } });
  } catch (error) {
    return handleApiError(error);
  }
}
