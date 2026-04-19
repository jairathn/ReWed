import { describe, it, expect, vi } from 'vitest';

// Force "test mode" so extractTodosFromNotes returns the deterministic stub
// instead of calling OpenAI.
vi.mock('@/lib/env', () => ({
  isTestMode: () => true,
}));

import { extractTodosFromNotes, resolveAssignees } from '@/lib/vendor/meetings';

describe('extractTodosFromNotes (test-mode stub)', () => {
  it('returns at least one couple to-do plus one per stakeholder (capped at 1)', async () => {
    const todos = await extractTodosFromNotes({
      weddingName: 'Test Wedding',
      meetingTitle: 'Sangeet sound check',
      meetingDate: null,
      stakeholders: [
        { name: 'Jas Johal', category: 'DJ' },
        { name: 'Raich', category: 'Sound' },
      ],
      rawNotes: 'we need to confirm playlists',
    });

    expect(todos.length).toBeGreaterThanOrEqual(2);
    expect(todos.find((t) => t.assignee === 'couple')).toBeDefined();
    expect(todos.find((t) => t.assignee === 'Jas Johal')).toBeDefined();
  });
});

describe('resolveAssignees', () => {
  const stakeholders = [
    { id: 'v-1', name: 'Jas Johal' },
    { id: 'v-2', name: 'Flors Bertran' },
  ];

  it('maps "couple" assignee to vendor_id null', () => {
    const resolved = resolveAssignees(
      [{ assignee: 'couple', title: 'Confirm playlists', description: null, due_date: null, priority: 'normal' }],
      stakeholders
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0].vendor_id).toBeNull();
  });

  it('matches exact (case-insensitive) vendor names', () => {
    const resolved = resolveAssignees(
      [{ assignee: 'JAS JOHAL', title: 'Send setlist', description: null, due_date: null, priority: 'normal' }],
      stakeholders
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0].vendor_id).toBe('v-1');
  });

  it('drops to-dos whose assignee cannot be matched (instead of dumping on couple)', () => {
    const resolved = resolveAssignees(
      [{ assignee: 'Mystery Person', title: 'Do thing', description: null, due_date: null, priority: 'normal' }],
      stakeholders
    );
    expect(resolved).toHaveLength(0);
  });

  it('treats bride/groom mentions as the couple', () => {
    const resolved = resolveAssignees(
      [{ assignee: 'bride and groom', title: 'Pick songs', description: null, due_date: null, priority: 'normal' }],
      stakeholders
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0].vendor_id).toBeNull();
  });
});
