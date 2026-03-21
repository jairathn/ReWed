import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { isTestMode } from '@/lib/env';

interface ParsedEvent {
  name: string;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  end_date?: string | null;
  venue_name?: string | null;
  venue_address?: string | null;
  dress_code?: string | null;
  description?: string | null;
  logistics?: string | null;
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/events/import
 *
 * Accepts raw text (copy-pasted from Zola, The Knot, etc.) and uses
 * an LLM to parse it into structured event data, then bulk-inserts.
 *
 * Body: { raw_text: string, step: 'preview' | 'import' }
 *  - preview: returns parsed events for user review before inserting
 *  - import: accepts parsed events array and inserts them
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const { raw_text, step, events: providedEvents } = body as {
      raw_text?: string;
      step: 'preview' | 'import';
      events?: ParsedEvent[];
    };

    // ── Preview: parse raw text with LLM ──
    if (step === 'preview') {
      if (!raw_text || typeof raw_text !== 'string' || !raw_text.trim()) {
        throw new AppError('VALIDATION_ERROR', 'raw_text is required');
      }

      const parsed = await parseEventsWithLLM(raw_text);

      if (parsed.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Could not identify any events in the provided text. Try pasting the event details directly from your wedding website.');
      }

      return Response.json({ events: parsed, count: parsed.length });
    }

    // ── Import: insert parsed events ──
    if (step === 'import') {
      if (!providedEvents || !Array.isArray(providedEvents) || providedEvents.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'events array is required');
      }

      const pool = getPool();
      let imported = 0;
      const errors: string[] = [];

      for (let i = 0; i < providedEvents.length; i++) {
        const ev = providedEvents[i];
        if (!ev.name || !ev.name.trim()) {
          errors.push(`Event ${i + 1}: missing name`);
          continue;
        }

        try {
          await pool.query(
            `INSERT INTO events (wedding_id, name, date, start_time, end_time, end_date, venue_name, venue_address,
                                 dress_code, description, logistics, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              weddingId,
              ev.name.trim(),
              ev.date || null,
              ev.start_time || null,
              ev.end_time || null,
              ev.end_date || null,
              ev.venue_name?.trim() || null,
              ev.venue_address?.trim() || null,
              ev.dress_code?.trim() || null,
              ev.description?.trim() || null,
              ev.logistics?.trim() || null,
              i,
            ]
          );
          imported++;
        } catch (err) {
          errors.push(`Event "${ev.name}": ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Clear FAQ cache since event details are used in chat answers
      if (imported > 0) {
        await pool.query('DELETE FROM faq_cache WHERE wedding_id = $1', [weddingId]);
      }

      return Response.json({ imported, total: providedEvents.length, errors: errors.slice(0, 10) }, { status: 201 });
    }

    throw new AppError('VALIDATION_ERROR', 'step must be "preview" or "import"');
  } catch (error) {
    return handleApiError(error);
  }
}

async function parseEventsWithLLM(rawText: string): Promise<ParsedEvent[]> {
  if (isTestMode()) {
    // In test mode, do a basic split on double newlines
    return basicParse(rawText);
  }

  try {
    const { getOpenAIClient, CHAT_MODEL_MINI } = await import('@/lib/ai/openai');
    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
      model: CHAT_MODEL_MINI,
      messages: [
        {
          role: 'system',
          content: `You are a wedding event parser. Extract structured event data from raw text that has been copy-pasted from wedding websites like Zola, The Knot, or similar platforms.

For each event found, return a JSON object with these fields:
- name: string (required) — event name like "Ceremony", "Reception", "Sangeet", "Haldi", "Mehndi"
- date: string | null — ISO date format YYYY-MM-DD for the START date
- start_time: string | null — 24-hour format HH:MM (e.g., "15:30" for 3:30 PM)
- end_time: string | null — 24-hour format HH:MM
- end_date: string | null — ISO date format YYYY-MM-DD if the event ends on a DIFFERENT day than it starts (e.g., a reception from Friday 3:30 PM to Saturday 2:00 AM). Set to null if same-day event.
- venue_name: string | null — name of the venue
- venue_address: string | null — full address, cleaned of any markdown formatting (remove __ or ** markers)
- dress_code: string | null — any dress code or attire guidance mentioned
- description: string | null — the main description of the event, including cultural context or activities
- logistics: string | null — any logistics info like transportation, parking, links to clothing resources, etc.

CRITICAL: Do NOT rephrase, reword, summarize, or re-interpret ANY of the text. The users wrote their event descriptions with specific wording for a reason — preserve it verbatim. Only extract and categorize the text into the correct fields.

Important:
- Date-time ranges like "Fri, Sep 11, 2026, 3:30 pm - Sat, Sep 12, 2026, 2:00 am" mean the event starts on the first date/time and ends on the second. Extract both dates and times correctly.
- The text may have inconsistent formatting — handle markdown like __text__, **text**, bullet points, etc.
- Remove markdown formatting characters only (**, __, etc.) but keep the underlying text exactly as written
- If text mentions clothing suggestions, links, or tips, put them in logistics (not description)
- Preserve URLs in the logistics field
- If a parenthetical alternate name is given like "Haldi (Pithi)", keep it in the event name
- Return ONLY a JSON array of events, no markdown, no explanation`,
        },
        {
          role: 'user',
          content: rawText,
        },
      ],
      max_tokens: 2000,
      temperature: 0,
    });

    const text = response.choices[0]?.message?.content || '';
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const parsed = JSON.parse(cleaned) as ParsedEvent[];

    if (!Array.isArray(parsed)) {
      return basicParse(rawText);
    }

    return parsed.filter((e) => e.name && e.name.trim());
  } catch {
    // Fall back to basic parsing
    return basicParse(rawText);
  }
}

/**
 * Basic fallback parser: splits on double newlines and treats
 * the first line of each block as the event name.
 */
function basicParse(rawText: string): ParsedEvent[] {
  const blocks = rawText.split(/\n{2,}/).filter((b) => b.trim());
  const events: ParsedEvent[] = [];
  let current: ParsedEvent | null = null;

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const firstLine = lines[0];

    // Detect full date-time range like "Fri, Sep 11, 2026, 3:30 pm - Sat, Sep 12, 2026, 2:00 am"
    const fullDateTimeRange = firstLine.match(
      /^(?:\w+,\s+)?(\w+)\s+(\d{1,2}),?\s*(\d{4}),?\s+(\d{1,2}:\d{2}\s*(?:am|pm))\s*[-–]\s*(?:\w+,\s+)?(\w+)\s+(\d{1,2}),?\s*(\d{4}),?\s+(\d{1,2}:\d{2}\s*(?:am|pm))$/i
    );

    // Detect single date with time range like "Fri, Sep 11, 2026, 3:30 pm - 7:30 pm"
    const singleDateTimeRange = !fullDateTimeRange && firstLine.match(
      /^(?:\w+,\s+)?(\w+)\s+(\d{1,2}),?\s*(\d{4}),?\s+(\d{1,2}:\d{2}\s*(?:am|pm))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:am|pm))$/i
    );

    // Detect time-only pattern like "3:30 pm - 7:30 pm"
    const timeMatch = !fullDateTimeRange && !singleDateTimeRange &&
      firstLine.match(/^(\d{1,2}:\d{2}\s*(?:am|pm))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:am|pm))$/i);

    if (fullDateTimeRange && current) {
      current.date = parseMonthDayYear(fullDateTimeRange[1], fullDateTimeRange[2], fullDateTimeRange[3]);
      current.start_time = convertTo24h(fullDateTimeRange[4]);
      const endDate = parseMonthDayYear(fullDateTimeRange[5], fullDateTimeRange[6], fullDateTimeRange[7]);
      current.end_date = endDate !== current.date ? endDate : null;
      current.end_time = convertTo24h(fullDateTimeRange[8]);
      const rest = lines.slice(1).join('\n').replace(/__/g, '').trim();
      if (rest) {
        current.description = (current.description ? current.description + '\n' : '') + rest;
      }
    } else if (singleDateTimeRange && current) {
      current.date = parseMonthDayYear(singleDateTimeRange[1], singleDateTimeRange[2], singleDateTimeRange[3]);
      current.start_time = convertTo24h(singleDateTimeRange[4]);
      current.end_time = convertTo24h(singleDateTimeRange[5]);
      const rest = lines.slice(1).join('\n').replace(/__/g, '').trim();
      if (rest) {
        current.description = (current.description ? current.description + '\n' : '') + rest;
      }
    } else if (timeMatch && current) {
      current.start_time = convertTo24h(timeMatch[1]);
      current.end_time = convertTo24h(timeMatch[2]);
      const rest = lines.slice(1).join('\n').replace(/__/g, '').trim();
      if (rest) {
        current.description = (current.description ? current.description + '\n' : '') + rest;
      }
    } else if (!timeMatch && !fullDateTimeRange && !singleDateTimeRange && firstLine.length < 80 && !firstLine.includes('.') && !firstLine.startsWith('http')) {
      // Looks like an event name
      if (current) events.push(current);
      current = { name: firstLine };
      if (lines.length > 1) {
        current.description = lines.slice(1).join('\n').replace(/__/g, '').trim();
      }
    } else if (current) {
      // Continuation of current event description
      const text = lines.join('\n').replace(/__/g, '').trim();
      current.description = (current.description ? current.description + '\n\n' : '') + text;
    }
  }

  if (current) events.push(current);
  return events;
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

function parseMonthDayYear(month: string, day: string, year: string): string {
  const m = MONTH_MAP[month.toLowerCase()] || '01';
  return `${year}-${m}-${day.padStart(2, '0')}`;
}

function convertTo24h(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return time;
  let hour = parseInt(match[1]);
  const min = match[2];
  const period = match[3].toLowerCase();
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, '0')}:${min}`;
}
