import { describe, it, expect, vi } from 'vitest';
import { applySuggestion } from '@/lib/google/apply-suggestion';

function makePool(handlers: Record<string, (params: unknown[]) => Promise<{ rows: unknown[] }>>) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    for (const key of Object.keys(handlers)) {
      if (sql.includes(key)) return handlers[key](params);
    }
    return { rows: [] };
  });
  return { query, _query: query } as unknown as import('pg').Pool & { _query: typeof query };
}

describe('applySuggestion', () => {
  it('creates a couple to-do when assignee_hint is "couple"', async () => {
    const pool = makePool({
      'INSERT INTO todos': async () => ({ rows: [{ id: 'todo-new' }] }),
    });
    const id = await applySuggestion(pool, {
      id: 's-1',
      wedding_id: 'w-1',
      action_type: 'create_todo',
      payload: {
        title: 'Pick playlist',
        priority: 'high',
        assignee_hint: 'couple',
      },
    });
    expect(id).toBe('todo-new');
  });

  it('resolves assignee_hint to a vendor by fuzzy name match', async () => {
    let inserted: unknown[] | null = null;
    const pool = makePool({
      'SELECT id, name FROM vendors': async () => ({
        rows: [
          { id: 'v-1', name: 'Jas Johal' },
          { id: 'v-2', name: 'Flors Bertran' },
        ],
      }),
      'INSERT INTO todos': async (params) => {
        inserted = params;
        return { rows: [{ id: 'todo-new' }] };
      },
    });
    await applySuggestion(pool, {
      id: 's-2',
      wedding_id: 'w-1',
      action_type: 'create_todo',
      payload: {
        title: 'Send setlist',
        assignee_hint: 'jas johal',
      },
    });
    expect(inserted).not.toBeNull();
    // params: [wedding_id, vendor_id, title, ...]
    expect((inserted as unknown as unknown[])[1]).toBe('v-1');
  });

  it('marks an existing todo complete when update_todo says so', async () => {
    let updateCalled = false;
    const pool = makePool({
      'SELECT id FROM todos': async () => ({ rows: [{ id: 'todo-existing' }] }),
      'UPDATE todos': async () => {
        updateCalled = true;
        return { rows: [] };
      },
    });
    const id = await applySuggestion(pool, {
      id: 's-3',
      wedding_id: 'w-1',
      action_type: 'update_todo',
      payload: { todo_match: 'deposit', new_status: 'completed' },
    });
    expect(updateCalled).toBe(true);
    expect(id).toBe('todo-existing');
  });

  it('throws when update_todo finds no matching open todo', async () => {
    const pool = makePool({
      'SELECT id FROM todos': async () => ({ rows: [] }),
    });
    await expect(
      applySuggestion(pool, {
        id: 's-4',
        wedding_id: 'w-1',
        action_type: 'update_todo',
        payload: { todo_match: 'nothing matches' },
      })
    ).rejects.toThrow(/No matching open to-do/);
  });

  it('updates a timeline entry when matched', async () => {
    let setSql = '';
    const pool = makePool({
      'SELECT id FROM timeline_entries': async () => ({ rows: [{ id: 'entry-1' }] }),
      'UPDATE timeline_entries SET': async () => {
        setSql = 'called';
        return { rows: [] };
      },
    });
    const id = await applySuggestion(pool, {
      id: 's-5',
      wedding_id: 'w-1',
      action_type: 'update_timeline',
      payload: {
        entry_match: 'baraat',
        new_time_label: '4:00 PM',
        new_notes: 'pushed back 30 min',
      },
    });
    expect(setSql).toBe('called');
    expect(id).toBe('entry-1');
  });
});
