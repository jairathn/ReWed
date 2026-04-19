import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import { authenticateVendor } from '@/lib/vendor/auth';
import { getOpenAIClient, CHAT_MODEL_MINI } from '@/lib/ai/openai';
import { sanitizeText } from '@/lib/validation';
import { AppError, handleApiError } from '@/lib/errors';
import { isTestMode } from '@/lib/env';
import { enforceChatbotLimit, getRequestIp, DAILY_CHATBOT_LIMIT } from '@/lib/chatbot-limit';

const askSchema = z.object({
  question: z.string().min(2).max(500),
});

interface TimelineRow {
  event_date: string | null;
  event_name: string | null;
  time_label: string | null;
  action: string;
  location: string | null;
  notes: string | null;
  status: string | null;
}

interface ContactRow {
  name: string;
  category: string | null;
  phone: string | null;
  whatsapp: boolean;
  email: string | null;
}

interface EmergencyContact {
  role?: string;
  name?: string;
  phone?: string | null;
  whatsapp?: boolean;
}

function formatTimelineRow(r: TimelineRow): string {
  const parts: string[] = [];
  if (r.event_date) parts.push(`Date: ${r.event_date}`);
  if (r.event_name) parts.push(`Event: ${r.event_name}`);
  if (r.time_label) parts.push(`Time: ${r.time_label}`);
  if (r.action) parts.push(`Action: ${r.action}`);
  if (r.location) parts.push(`Location: ${r.location}`);
  if (r.notes) parts.push(`Notes: ${r.notes}`);
  if (r.status) parts.push(`Status: ${r.status}`);
  return parts.join(' | ');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> }
) {
  try {
    const { slug, token } = await params;
    const pool = getPool();
    const ctx = await authenticateVendor(pool, slug, token);

    const body = await request.json();
    const parsed = askSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }
    const question = sanitizeText(parsed.data.question);

    // Enforce 20/day cap per vendor (falls back to IP for defense in depth).
    const limit = await enforceChatbotLimit(
      pool,
      ctx.wedding.id,
      ctx.vendor.id,
      'vendor',
      getRequestIp(request.headers)
    );
    if (!limit.allowed) {
      throw new AppError(
        'RATE_LIMITED',
        `You've asked ${DAILY_CHATBOT_LIMIT} questions today — the limit resets at midnight. For anything urgent, reach out to the couple directly.`
      );
    }

    // Pull vendor-scoped context: their own entries, who they coordinate with,
    // and the emergency contacts list.
    const assignedResult = await pool.query(
      `SELECT te.event_date, te.event_name, te.time_label, te.action,
              te.location, te.notes, te.status
       FROM timeline_entries te
       JOIN timeline_entry_vendors tev ON tev.timeline_entry_id = te.id
       WHERE te.wedding_id = $1 AND tev.vendor_id = $2
       ORDER BY te.event_date ASC NULLS LAST, te.sort_order ASC`,
      [ctx.wedding.id, ctx.vendor.id]
    );

    const coordResult = await pool.query(
      `SELECT DISTINCT v.name, v.category, v.phone, v.whatsapp, v.email
       FROM timeline_entry_vendors tev
       JOIN vendors v ON v.id = tev.vendor_id
       WHERE v.id <> $1
         AND tev.timeline_entry_id IN (
           SELECT timeline_entry_id FROM timeline_entry_vendors WHERE vendor_id = $1
         )`,
      [ctx.vendor.id]
    );

    let answer: string;
    if (isTestMode()) {
      answer = `(mock vendor answer) Based on your ${assignedResult.rows.length} assigned entries for ${ctx.wedding.display_name}.`;
    } else {
      const openai = getOpenAIClient();

      const contextParts: string[] = [];
      const weddingDetails: string[] = [
        `Wedding: ${ctx.wedding.display_name}`,
        ctx.wedding.wedding_date ? `Date: ${ctx.wedding.wedding_date}` : '',
        ctx.wedding.venue_city ? `Location: ${ctx.wedding.venue_city}${ctx.wedding.venue_country ? ', ' + ctx.wedding.venue_country : ''}` : '',
      ].filter(Boolean);
      contextParts.push(`Wedding Details:\n${weddingDetails.join('\n')}`);

      contextParts.push(
        `You are the vendor: ${ctx.vendor.name}` +
          (ctx.vendor.category ? ` (${ctx.vendor.category})` : '') +
          (ctx.vendor.notes ? `\nNotes from couple: ${ctx.vendor.notes}` : '')
      );

      if (assignedResult.rows.length > 0) {
        contextParts.push(
          `Your assigned timeline entries:\n${(assignedResult.rows as TimelineRow[])
            .map((r) => `- ${formatTimelineRow(r)}`)
            .join('\n')}`
        );
      }

      if (coordResult.rows.length > 0) {
        contextParts.push(
          `Other vendors you coordinate with:\n${(coordResult.rows as ContactRow[])
            .map(
              (r) =>
                `- ${r.name}${r.category ? ` (${r.category})` : ''}` +
                (r.phone ? ` · ${r.phone}${r.whatsapp ? ' WhatsApp' : ''}` : '') +
                (r.email ? ` · ${r.email}` : '')
            )
            .join('\n')}`
        );
      }

      const emergency: EmergencyContact[] = Array.isArray(ctx.wedding.config.emergency_contacts)
        ? (ctx.wedding.config.emergency_contacts as EmergencyContact[])
        : [];
      if (emergency.length > 0) {
        contextParts.push(
          `Emergency contacts:\n${emergency
            .map(
              (c) =>
                `- ${c.role || 'Contact'}: ${c.name}` +
                (c.phone ? ` · ${c.phone}${c.whatsapp ? ' WhatsApp' : ''}` : '')
            )
            .join('\n')}`
        );
      }

      const fullContext = contextParts.join('\n\n---\n\n');

      const chatResponse = await openai.chat.completions.create({
        model: CHAT_MODEL_MINI,
        messages: [
          {
            role: 'system',
            content: `You are a concise assistant helping a wedding vendor. Answer questions using ONLY the provided context about their timeline, coordination partners, and emergency contacts. If the context doesn't contain the answer, say so in one short sentence and suggest reaching out to the couple or the wedding planner. Never invent specifics.`,
          },
          {
            role: 'user',
            content: `${fullContext}\n\nVendor question: ${question}`,
          },
        ],
        max_tokens: 300,
        temperature: 0.5,
      });

      answer =
        chatResponse.choices[0]?.message?.content ||
        "I'm not sure — reach out to the couple directly for specifics.";
    }

    return Response.json({
      data: {
        answer,
        remaining: limit.remaining,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
