import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/env', () => ({ isTestMode: () => true }));

import { generateSuggestions } from '@/lib/google/suggest';

describe('generateSuggestions (test-mode stub)', () => {
  it('returns one create_todo per email', async () => {
    const out = await generateSuggestions({
      context: {
        weddingName: 'Test',
        vendorNames: ['Jas Johal'],
        openTodos: [],
        upcomingTimeline: [],
      },
      emails: [
        { id: 'm-1', threadId: 't-1', subject: 'Sangeet menu', from: 'caterer@x', date: '', snippet: 'check', body: '' },
        { id: 'm-2', threadId: 't-2', subject: 'Floral count', from: 'florist@x', date: '', snippet: 'count', body: '' },
      ],
      files: [],
    });
    expect(out).toHaveLength(2);
    expect(out[0].action_type).toBe('create_todo');
    expect(out[0].source_ref).toBe('m-1');
    expect((out[0].payload.title as string)).toContain('Sangeet menu');
  });

  it('returns nothing when there are no emails or files', async () => {
    const out = await generateSuggestions({
      context: { weddingName: 'Test', vendorNames: [], openTodos: [], upcomingTimeline: [] },
      emails: [],
      files: [],
    });
    expect(out).toHaveLength(0);
  });
});
