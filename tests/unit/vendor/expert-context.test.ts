import { describe, it, expect, vi } from 'vitest';
import { buildWeddingExpertContext } from '@/lib/vendor/expert-context';

function makePool(rows: Record<string, unknown[]>) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM weddings')) return { rows: rows.wedding || [] };
    if (sql.includes('FROM events')) return { rows: rows.events || [] };
    if (sql.includes('FROM vendors WHERE wedding_id')) return { rows: rows.vendors || [] };
    if (sql.includes('FROM timeline_entries')) return { rows: rows.timeline || [] };
    if (sql.includes('FROM todos')) return { rows: rows.todos || [] };
    if (sql.includes('FROM meetings')) return { rows: rows.meetings || [] };
    if (sql.includes('FROM vendor_comments')) return { rows: rows.comments || [] };
    if (sql.includes('FROM faq_entries')) return { rows: rows.faqs || [] };
    return { rows: [] };
  });
  return { query } as unknown as import('pg').Pool;
}

const FULL_FIXTURE = {
  wedding: [{
    display_name: 'Shriya & Neil',
    wedding_date: '2026-09-11',
    timezone: 'Europe/Madrid',
    venue_city: 'Barcelona',
    venue_country: 'Spain',
    hashtag: '#ShriyaNeil2026',
    config: {
      knowledge_base: 'Some couple notes about logistics.',
      emergency_contacts: [
        { role: 'Bride', name: 'Shriya', phone: '+13095336646', whatsapp: true },
      ],
    },
  }],
  vendors: [
    { id: 'v-1', name: 'Jas Johal', company: null, category: 'DJ', email: 'jas@x.com', phone: null, whatsapp: false, deposit_status: 'Deposit £2k', notes: null },
  ],
  timeline: [
    { event_date: '2026-09-09', event_name: 'HALDI', time_label: '10 AM', action: 'Decor setup', location: 'Garden', notes: null, status: null, deadline: false, vendor_names: 'Flors Bertran' },
  ],
  todos: [
    { title: 'Confirm song list', description: null, due_date: null, priority: 'high', status: 'open', created_at: new Date().toISOString(), vendor_name: 'Jas Johal', meeting_title: 'Sangeet sound walk' },
  ],
  meetings: [
    { title: 'Sangeet sound walk', meeting_date: '2026-04-12', raw_notes: 'Confirmed final mic setup. Need playlists.', created_at: new Date().toISOString() },
  ],
  comments: [
    { vendor_name: 'Ingrid', comment: 'Need to know towel count', proposed_change: null, status: 'pending', created_at: new Date().toISOString() },
  ],
  faqs: [
    { question: 'What time is the ceremony?', answer: '5:15 PM at Castell de Sant Marçal.' },
  ],
  events: [
    { name: 'Sangeet', date: '2026-09-10', start_time: '4:00 PM', end_time: '12:00 AM', venue_name: 'Xalet del Nin', venue_address: 'Vilanova', dress_code: 'Festive', description: null, logistics: null },
  ],
};

describe('buildWeddingExpertContext', () => {
  it('returns "" when the wedding does not exist', async () => {
    const pool = makePool({});
    const ctx = await buildWeddingExpertContext(pool, 'w-missing');
    expect(ctx).toBe('');
  });

  it('includes every section when data is present', async () => {
    const pool = makePool(FULL_FIXTURE);
    const ctx = await buildWeddingExpertContext(pool, 'w-1');
    expect(ctx).toContain('# Wedding');
    expect(ctx).toContain('Shriya & Neil');
    expect(ctx).toContain('# Knowledge base');
    expect(ctx).toContain('# Emergency contacts');
    expect(ctx).toContain('# Events');
    expect(ctx).toContain('# Vendors');
    expect(ctx).toContain('Jas Johal');
    expect(ctx).toContain('# Master timeline');
    expect(ctx).toContain('Decor setup');
    expect(ctx).toContain('# To-dos');
    expect(ctx).toContain('Confirm song list');
    expect(ctx).toContain('# Recent meeting notes');
    expect(ctx).toContain('# Vendor comments');
    expect(ctx).toContain('Ingrid');
    expect(ctx).toContain('# FAQ');
  });

  it('caps an oversized knowledge_base to keep prompts bounded', async () => {
    const huge = 'x'.repeat(20000);
    const fixture = {
      ...FULL_FIXTURE,
      wedding: [{
        ...FULL_FIXTURE.wedding[0],
        config: { ...FULL_FIXTURE.wedding[0].config, knowledge_base: huge },
      }],
    };
    const ctx = await buildWeddingExpertContext(makePool(fixture), 'w-1');
    expect(ctx).toContain('…[truncated]');
    expect(ctx.length).toBeLessThan(huge.length);
  });

  it('skips empty sections cleanly', async () => {
    const minimal = {
      wedding: [{
        display_name: 'Tiny Wedding',
        wedding_date: null,
        timezone: null,
        venue_city: null,
        venue_country: null,
        hashtag: null,
        config: null,
      }],
    };
    const ctx = await buildWeddingExpertContext(makePool(minimal), 'w-1');
    expect(ctx).toContain('# Wedding');
    expect(ctx).not.toContain('# Vendors');
    expect(ctx).not.toContain('# Master timeline');
    expect(ctx).not.toContain('# To-dos');
  });
});
