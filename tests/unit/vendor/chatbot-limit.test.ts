import { describe, it, expect, vi } from 'vitest';
import {
  enforceChatbotLimit,
  getRequestIp,
  DAILY_CHATBOT_LIMIT,
} from '@/lib/chatbot-limit';

function makePool(initialCount = 0) {
  let count = initialCount;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('INSERT INTO chatbot_usage')) {
      count += 1;
      return { rows: [{ count }] };
    }
    return { rows: [] };
  });
  return {
    query,
    connect: vi.fn(),
    // typecast — the tests only call .query
  } as unknown as import('pg').Pool;
}

describe('enforceChatbotLimit', () => {
  it('allows the first request and reports remaining', async () => {
    const pool = makePool(0);
    const result = await enforceChatbotLimit(pool, 'w-1', 'g-1', 'guest', '1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(DAILY_CHATBOT_LIMIT);
    expect(result.remaining).toBe(DAILY_CHATBOT_LIMIT - 1);
  });

  it('denies once the daily count exceeds the limit', async () => {
    const pool = makePool(DAILY_CHATBOT_LIMIT);
    const result = await enforceChatbotLimit(pool, 'w-1', 'g-1', 'guest', '1.2.3.4');
    // count after increment = limit + 1, so allowed === false
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('still hits the cap when no guest id is given (uses hashed IP)', async () => {
    const pool = makePool(DAILY_CHATBOT_LIMIT);
    const result = await enforceChatbotLimit(pool, 'w-1', '', 'vendor', '9.8.7.6');
    expect(result.allowed).toBe(false);
  });
});

describe('getRequestIp', () => {
  it('reads x-forwarded-for first', () => {
    const headers = new Headers({ 'x-forwarded-for': '8.8.8.8, 4.4.4.4' });
    expect(getRequestIp(headers)).toBe('8.8.8.8');
  });

  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '5.5.5.5' });
    expect(getRequestIp(headers)).toBe('5.5.5.5');
  });

  it('falls back to a stable placeholder when no proxy headers exist', () => {
    expect(getRequestIp(new Headers())).toBe('0.0.0.0');
  });
});
