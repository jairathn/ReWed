import { NextRequest } from 'next/server';
import { authenticateTravelRequest } from '@/lib/travel/auth';
import { toDateString } from '@/lib/db/format';
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
              share_transport, share_contact, visibility, notes,
              traveling_with_guest_ids,
              created_at, updated_at
       FROM travel_plans WHERE wedding_id = $1 AND guest_id = $2`,
      [weddingId, guestId]
    );

    if (planResult.rows.length === 0) {
      return Response.json({ data: { plan: null, guest_id: guestId } });
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

    const stops = stopsResult.rows.map((s) => ({
      ...s,
      arrive_date: toDateString(s.arrive_date),
      depart_date: toDateString(s.depart_date),
    }));

    // Resolve companion names
    let travelingWith: Array<{ id: string; first_name: string; last_name: string; display_name: string }> = [];
    if (plan.traveling_with_guest_ids?.length > 0) {
      const namesResult = await pool.query(
        'SELECT id, first_name, last_name, display_name FROM guests WHERE id = ANY($1)',
        [plan.traveling_with_guest_ids]
      );
      travelingWith = namesResult.rows;
    }

    return Response.json({
      data: {
        plan: { ...plan, stops, traveling_with: travelingWith },
        guest_id: guestId,
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
    const companionIds = (data.traveling_with_guest_ids || []).filter((id) => id !== guestId);

    // Verify companions belong to this wedding
    let validCompanionIds: string[] = [];
    if (companionIds.length > 0) {
      const checkResult = await pool.query(
        'SELECT id FROM guests WHERE id = ANY($1) AND wedding_id = $2',
        [companionIds, weddingId]
      );
      validCompanionIds = checkResult.rows.map((r) => r.id);
    }

    // Upsert travel plan
    const planResult = await pool.query(
      `INSERT INTO travel_plans (wedding_id, guest_id, plan_type, origin_city, origin_lat, origin_lng,
         origin_country, share_transport, share_contact, visibility, notes, traveling_with_guest_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
         traveling_with_guest_ids = EXCLUDED.traveling_with_guest_ids,
         updated_at = NOW()
       RETURNING id, plan_type, origin_city, origin_lat, origin_lng, origin_country,
                 share_transport, share_contact, visibility, notes,
                 traveling_with_guest_ids, created_at, updated_at`,
      [
        weddingId, guestId, data.plan_type,
        data.origin_city || null, data.origin_lat ?? null, data.origin_lng ?? null,
        data.origin_country || null, data.share_transport,
        data.share_contact ? sanitizeText(data.share_contact) : null,
        data.visibility,
        data.notes ? sanitizeText(data.notes) : null,
        validCompanionIds.length > 0 ? validCompanionIds : null,
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
      const saved = stopResult.rows[0];
      stops.push({
        ...saved,
        arrive_date: toDateString(saved.arrive_date),
        depart_date: toDateString(saved.depart_date),
      });
    }

    // Autofill companion travel plans. Each companion's traveling_with points to
    // the primary guest plus any other companions, so the group is symmetric.
    for (const companionId of validCompanionIds) {
      const companionTravelingWith = [guestId, ...validCompanionIds.filter((id) => id !== companionId)];
      const companionPlan = await pool.query(
        `INSERT INTO travel_plans (wedding_id, guest_id, plan_type, origin_city, origin_lat, origin_lng,
           origin_country, share_transport, share_contact, visibility, notes, traveling_with_guest_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, null, $8, null, $9)
         ON CONFLICT (wedding_id, guest_id) DO UPDATE SET
           plan_type = EXCLUDED.plan_type,
           origin_city = EXCLUDED.origin_city,
           origin_lat = EXCLUDED.origin_lat,
           origin_lng = EXCLUDED.origin_lng,
           origin_country = EXCLUDED.origin_country,
           visibility = EXCLUDED.visibility,
           traveling_with_guest_ids = EXCLUDED.traveling_with_guest_ids,
           updated_at = NOW()
         RETURNING id`,
        [
          weddingId, companionId, data.plan_type,
          data.origin_city || null, data.origin_lat ?? null, data.origin_lng ?? null,
          data.origin_country || null, data.visibility, companionTravelingWith,
        ]
      );

      const companionPlanId = companionPlan.rows[0].id;
      await pool.query('DELETE FROM travel_stops WHERE plan_id = $1', [companionPlanId]);

      for (let i = 0; i < data.stops.length; i++) {
        const stop = data.stops[i];
        await pool.query(
          `INSERT INTO travel_stops (plan_id, wedding_id, stop_type, city, region, country,
             country_code, latitude, longitude, arrive_date, depart_date, arrive_time, depart_time,
             transport_mode, transport_details, accommodation, open_to_meetup, notes, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            companionPlanId, weddingId, stop.stop_type, stop.city, stop.region || null,
            stop.country, stop.country_code || null, stop.latitude, stop.longitude,
            stop.arrive_date || null, stop.depart_date || null, stop.arrive_time || null,
            stop.depart_time || null,
            stop.transport_mode || null, stop.transport_details || null,
            stop.accommodation || null, stop.open_to_meetup,
            stop.notes ? sanitizeText(stop.notes) : null, i,
          ]
        );
      }
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
