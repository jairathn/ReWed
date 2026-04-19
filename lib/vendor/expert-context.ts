import type { Pool } from 'pg';

/**
 * Pull every piece of wedding state the couple's expert chatbot might need
 * to answer a question. Returns a compact text dump bounded by smart caps so
 * a single huge knowledge_base or hundreds of comments doesn't blow up the
 * prompt.
 */
export async function buildWeddingExpertContext(
  pool: Pool,
  weddingId: string
): Promise<string> {
  const sections: string[] = [];

  // Wedding metadata
  const weddingResult = await pool.query(
    `SELECT display_name, wedding_date, timezone, venue_city, venue_country, hashtag, config
     FROM weddings WHERE id = $1`,
    [weddingId]
  );
  if (weddingResult.rows.length === 0) return '';
  const wedding = weddingResult.rows[0];
  const config = (wedding.config || {}) as Record<string, unknown>;

  const meta: string[] = [`Wedding: ${wedding.display_name}`];
  if (wedding.wedding_date) meta.push(`Date: ${wedding.wedding_date}`);
  if (wedding.venue_city) {
    meta.push(`Location: ${wedding.venue_city}${wedding.venue_country ? `, ${wedding.venue_country}` : ''}`);
  }
  if (wedding.timezone) meta.push(`Timezone: ${wedding.timezone}`);
  if (wedding.hashtag) meta.push(`Hashtag: ${wedding.hashtag}`);
  sections.push(`# Wedding\n${meta.join('\n')}`);

  // Couple-pasted knowledge base (cap to keep prompt size sane)
  if (typeof config.knowledge_base === 'string' && config.knowledge_base.trim()) {
    const kb = config.knowledge_base.trim();
    sections.push(
      `# Knowledge base (couple notes)\n${kb.length > 8000 ? kb.slice(0, 8000) + '\n…[truncated]' : kb}`
    );
  }

  // Emergency contacts
  if (Array.isArray(config.emergency_contacts) && config.emergency_contacts.length > 0) {
    type EC = { role?: string; name?: string; phone?: string | null; whatsapp?: boolean };
    const lines = (config.emergency_contacts as EC[])
      .map((c) => `- ${c.role || 'Contact'}: ${c.name}${c.phone ? ` · ${c.phone}` : ''}${c.whatsapp ? ' (WhatsApp)' : ''}`)
      .join('\n');
    sections.push(`# Emergency contacts\n${lines}`);
  }

  // Events
  const events = await pool.query(
    `SELECT name, date, start_time, end_time, venue_name, venue_address, dress_code, description, logistics
     FROM events WHERE wedding_id = $1 ORDER BY sort_order ASC, date ASC`,
    [weddingId]
  );
  if (events.rows.length > 0) {
    const lines = events.rows.map((e) => {
      const parts = [`- ${e.name}`];
      if (e.date) parts.push(`  Date: ${e.date}`);
      if (e.start_time) parts.push(`  Start: ${e.start_time}${e.end_time ? `–${e.end_time}` : ''}`);
      if (e.venue_name) parts.push(`  Venue: ${e.venue_name}${e.venue_address ? ` (${e.venue_address})` : ''}`);
      if (e.dress_code) parts.push(`  Dress code: ${e.dress_code}`);
      if (e.description) parts.push(`  Description: ${e.description}`);
      if (e.logistics) parts.push(`  Logistics: ${e.logistics}`);
      return parts.join('\n');
    }).join('\n');
    sections.push(`# Events\n${lines}`);
  }

  // Vendors
  const vendors = await pool.query(
    `SELECT id, name, company, category, email, phone, whatsapp, deposit_status, notes
     FROM vendors WHERE wedding_id = $1 ORDER BY category NULLS LAST, name ASC`,
    [weddingId]
  );
  if (vendors.rows.length > 0) {
    const lines = vendors.rows.map((v) => {
      const parts = [`- ${v.name}${v.category ? ` (${v.category})` : ''}`];
      if (v.email || v.phone) {
        parts.push(`  Contact:${v.email ? ` ${v.email}` : ''}${v.phone ? ` ${v.phone}${v.whatsapp ? ' (WA)' : ''}` : ''}`);
      }
      if (v.deposit_status) parts.push(`  Status: ${v.deposit_status}`);
      if (v.notes) parts.push(`  Notes: ${v.notes}`);
      return parts.join('\n');
    }).join('\n');
    sections.push(`# Vendors\n${lines}`);
  }

  // Master timeline (compact)
  const timeline = await pool.query(
    `SELECT te.event_date, te.event_name, te.time_label, te.action,
            te.location, te.notes, te.status, te.deadline,
            COALESCE(string_agg(v.name, ', '), '') AS vendor_names
     FROM timeline_entries te
     LEFT JOIN timeline_entry_vendors tev ON tev.timeline_entry_id = te.id
     LEFT JOIN vendors v ON v.id = tev.vendor_id
     WHERE te.wedding_id = $1
     GROUP BY te.id
     ORDER BY te.event_date ASC NULLS LAST, te.sort_order ASC`,
    [weddingId]
  );
  if (timeline.rows.length > 0) {
    const lines = timeline.rows.map((t) => {
      const head = `- ${t.event_date || ''} ${t.event_name || ''} ${t.time_label || ''}`.trim();
      const detail = `${t.action}${t.location ? ` @ ${t.location}` : ''}${t.vendor_names ? ` — ${t.vendor_names}` : ''}${t.deadline ? ' [DEADLINE]' : ''}${t.status ? ` [${t.status}]` : ''}${t.notes ? `\n    ${t.notes}` : ''}`;
      return `${head}\n  ${detail}`;
    }).join('\n');
    sections.push(`# Master timeline\n${lines}`);
  }

  // To-dos
  const todos = await pool.query(
    `SELECT t.title, t.description, t.due_date, t.priority, t.status, t.created_at,
            v.name AS vendor_name, m.title AS meeting_title
     FROM todos t
     LEFT JOIN vendors v ON v.id = t.assigned_to_vendor_id
     LEFT JOIN meetings m ON m.id = t.meeting_id
     WHERE t.wedding_id = $1
     ORDER BY (t.status = 'open') DESC, (t.priority = 'high') DESC, t.created_at DESC`,
    [weddingId]
  );
  if (todos.rows.length > 0) {
    const lines = todos.rows.map((t) => {
      const who = t.vendor_name || 'Couple';
      const status = t.status === 'completed' ? '[done]' : '[open]';
      const due = t.due_date ? ` due ${t.due_date}` : '';
      const meeting = t.meeting_title ? ` (from "${t.meeting_title}")` : '';
      const desc = t.description ? `\n  ${t.description}` : '';
      const prio = t.priority === 'high' ? ' [HIGH]' : '';
      return `- ${status}${prio} ${who}: ${t.title}${due}${meeting}${desc}`;
    }).join('\n');
    sections.push(`# To-dos\n${lines}`);
  }

  // Recent meetings (titles + first 600 chars of notes)
  const meetings = await pool.query(
    `SELECT title, meeting_date, raw_notes, created_at
     FROM meetings WHERE wedding_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [weddingId]
  );
  if (meetings.rows.length > 0) {
    const lines = meetings.rows.map((m) => {
      const notesSnippet = (m.raw_notes as string).slice(0, 600);
      return `- ${m.meeting_date || ''} "${m.title}"\n  ${notesSnippet}${(m.raw_notes as string).length > 600 ? '…' : ''}`;
    }).join('\n\n');
    sections.push(`# Recent meeting notes\n${lines}`);
  }

  // Vendor comments (recent — what's been raised in the last week's worth)
  const comments = await pool.query(
    `SELECT vc.comment, vc.proposed_change, vc.status, vc.created_at, v.name AS vendor_name
     FROM vendor_comments vc
     JOIN vendors v ON v.id = vc.vendor_id
     WHERE vc.wedding_id = $1
     ORDER BY vc.created_at DESC LIMIT 30`,
    [weddingId]
  );
  if (comments.rows.length > 0) {
    const lines = comments.rows.map((c) => {
      const proposal = c.proposed_change ? ` [proposed: ${c.proposed_change}]` : '';
      return `- ${c.vendor_name}: ${c.comment}${proposal}`;
    }).join('\n');
    sections.push(`# Vendor comments\n${lines}`);
  }

  // FAQ entries
  const faqs = await pool.query(
    `SELECT question, answer FROM faq_entries WHERE wedding_id = $1`,
    [weddingId]
  );
  if (faqs.rows.length > 0) {
    const lines = faqs.rows.map((f) => `- Q: ${f.question}\n  A: ${f.answer}`).join('\n');
    sections.push(`# FAQ\n${lines}`);
  }

  return sections.join('\n\n');
}
