import { Pool, PoolClient } from 'pg';
import { neon } from '@neondatabase/serverless';

// For serverless environments (Vercel Edge), use Neon's HTTP driver
// For long-running processes (tests, scripts), use pg Pool

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

export async function withWeddingContext<T>(
  weddingId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_wedding_id = $1`, [weddingId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// For use in serverless API routes (Neon HTTP driver)
export function getServerlessDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return neon(connectionString);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
