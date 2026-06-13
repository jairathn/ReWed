/**
 * Resolve an SMS audience to a deduped list of E.164 recipients. Shared by the
 * send-now and schedule routes so they pick recipients identically: same
 * audience filters, same phone normalization, same "one text per number"
 * dedupe (couples sharing a phone get one message), same skip-count for
 * numbers that don't normalize.
 */
import type { Pool } from 'pg';
import { AppError } from '@/lib/errors';
import { normalizePhone } from './normalize-phone';

export type SmsAudience = 'all' | 'attending' | 'pending' | 'declined' | 'group' | 'selected';

export interface AudienceSelector {
  audience: SmsAudience;
  group_labels?: string[];
  guest_ids?: string[];
}

export interface ResolvedRecipients {
  recipients: Array<{ name: string; phone: string }>;
  skippedBadPhone: number;
}

interface GuestRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
}

export async function resolveRecipients(
  pool: Pool,
  weddingId: string,
  sel: AudienceSelector
): Promise<ResolvedRecipients> {
  const baseSelect = `
    SELECT id, first_name, last_name, phone
    FROM guests
    WHERE wedding_id = $1 AND phone IS NOT NULL AND phone != '' AND soft_deleted_at IS NULL`;

  let guestsResult;
  if (sel.audience === 'selected') {
    if (!sel.guest_ids || sel.guest_ids.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No guests selected');
    }
    guestsResult = await pool.query(`${baseSelect} AND id = ANY($2::uuid[])`, [
      weddingId,
      sel.guest_ids,
    ]);
  } else if (sel.audience === 'group') {
    if (!sel.group_labels || sel.group_labels.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No groups selected');
    }
    guestsResult = await pool.query(`${baseSelect} AND group_label = ANY($2::text[])`, [
      weddingId,
      sel.group_labels,
    ]);
  } else if (sel.audience === 'all') {
    guestsResult = await pool.query(baseSelect, [weddingId]);
  } else {
    guestsResult = await pool.query(`${baseSelect} AND rsvp_status = $2`, [
      weddingId,
      sel.audience,
    ]);
  }

  const guests: GuestRow[] = guestsResult.rows;

  const seen = new Set<string>();
  const recipients: Array<{ name: string; phone: string }> = [];
  let skippedBadPhone = 0;

  for (const g of guests) {
    const norm = normalizePhone(g.phone);
    if (!norm.ok) {
      skippedBadPhone += 1;
      continue;
    }
    if (seen.has(norm.e164!)) continue;
    seen.add(norm.e164!);
    recipients.push({ name: `${g.first_name} ${g.last_name}`.trim(), phone: norm.e164! });
  }

  return { recipients, skippedBadPhone };
}
