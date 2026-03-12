import { NextRequest } from 'next/server';
import { authenticateTravelRequest } from '@/lib/travel/auth';
import { travelPlanSchema, sanitizeText } from '@/lib/validation';
import { AppError, handleApiError } from '@/lib/errors';

// GET /api/v1/w/[slug]/travel/my-plan — get current guest's travel plan
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { pool, weddingId, guestId } = await authenticateTravelRequest(request, slug);

    const planResult = await pool.query(
      `SELECT id, plan_type, origin_city, origin_lat, origin_lng, origin_country,
              share_transport, share_contact, visibility, notes, created_at, updated_at
       FROM travel_plans WHERE wedding_id = $1 AND guest_id = $2`,
      [weddingId, guestId]
    );

    if (planResult.rows.length === 0) {
      return Response.json({ data: { plan: null } });
    }

    const plan = planResult.rows[0];

    const stopsResult = await pool.query(
      `SELECT id, stop_type, city, region, country, country_code,
              latitude, longitude, arrive_date, depart_date, arrive_time, depart_time,
              transport_mode, transport_details, accommodation,
              open_to_meetup, notes, sort_order
       FROM travel_stops WHERE plan_id = $1
       ORDER BY sort_order ASC`,
      [plan.id]
    );

    return Response.json({
      data: {
        plan: {
          ...plan,
          stops: stopsResult.rows,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT /api/v1/w/[slug]/travel/my-plan — create or update travel plan
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { pool, weddingId, guestId } = await authenticateTravelRequest(request, slug);

    const body = await request.json();
    const parsed = travelPlanSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid travel plan');
    }

    const data = parsed.data;

    // Upsert travel plan
    const planResult = await pool.query(
      `INSERT INTO travel_plans (wedding_id, guest_id, plan_type, origin_city, origin_lat, origin_lng,
         origin_country, share_transport, share_contact, visibility, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (wedding_id, guest_id) DO UPDATE SET
         plan_type = EXCLUDED.plan_type,
         origin_city = EXCLUDED.origin_city,
         origin_lat = EXCLUDED.origin_lat,
         origin_lng = EXCLUDED.origin_lng,
         origin_country = EXCLUDED.origin_country,
         share_transport = EXCLUDED.share_transport,
         share_contact = EXCLUDED.share_contact,
         visibility = EXCLUDED.visibility,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING id, plan_type, origin_city, origin_lat, origin_lng, origin_country,
                 share_transport, share_contact, visibility, notes, created_at, updated_at`,
      [
        weddingId, guestId, data.plan_type,
        data.origin_city || null, data.origin_lat ?? null, data.origin_lng ?? null,
        data.origin_country || null, data.share_transport,
        data.share_contact ? sanitizeText(data.share_contact) : null,
        data.visibility,
        data.notes ? sanitizeText(data.notes) : null,
      ]
    );

    const plan = planResult.rows[0];

    // Replace all stops: delete existing, insert new
    await pool.query(`DELETE FROM travel_stops WHERE plan_id = $1`, [plan.id]);

    const stops = [];
    for (let i = 0; i < data.stops.length; i++) {
      const stop = data.stops[i];
      const stopResult = await pool.query(
        `INSERT INTO travel_stops (plan_id, wedding_id, stop_type, city, region, country,
           country_code, latitude, longitude, arrive_date, depart_date, arrive_time, depart_time,
           transport_mode, transport_details, accommodation, open_to_meetup, notes, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING id, stop_type, city, region, country, country_code,
                   latitude, longitude, arrive_date, depart_date, arrive_time, depart_time,
                   transport_mode, transport_details, accommodation,
                   open_to_meetup, notes, sort_order`,
        [
          plan.id, weddingId, stop.stop_type, stop.city, stop.region || null,
          stop.country, stop.country_code || null, stop.latitude, stop.longitude,
          stop.arrive_date || null, stop.depart_date || null, stop.arrive_time || null,
          stop.depart_time || null,
          stop.transport_mode || null, stop.transport_details || null,
          stop.accommodation || null, stop.open_to_meetup,
          stop.notes ? sanitizeText(stop.notes) : null, i,
        ]
      );
      stops.push(stopResult.rows[0]);
    }

    return Response.json({
      data: { plan: { ...plan, stops } },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/v1/w/[slug]/travel/my-plan — delete travel plan
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { pool, weddingId, guestId } = await authenticateTravelRequest(request, slug);

    await pool.query(
      `DELETE FROM travel_plans WHERE wedding_id = $1 AND guest_id = $2`,
      [weddingId, guestId]
    );

    return Response.json({ data: { deleted: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
