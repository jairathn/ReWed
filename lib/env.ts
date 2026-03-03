import { z } from 'zod';

// Transform empty strings to undefined so optional() validators work correctly
const optionalStr = z.string().optional().transform(v => v === '' ? undefined : v);
const optionalUrl = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().url().optional()
);
const optionalEmail = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().email().optional()
);
const optionalMinStr = (min: number) => z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().min(min).optional()
);

const envSchema = z.object({
  // Database (Neon via Vercel — postgresql:// URLs don't pass url() validation)
  DATABASE_URL: optionalMinStr(1),
  DATABASE_URL_UNPOOLED: optionalMinStr(1),

  // Storage
  R2_ACCOUNT_ID: optionalStr,
  R2_ACCESS_KEY_ID: optionalStr,
  R2_SECRET_ACCESS_KEY: optionalStr,
  R2_BUCKET_NAME: z.string().default('wedding-media'),
  R2_PUBLIC_URL: optionalUrl,

  // Auth
  JWT_SECRET: optionalMinStr(32),
  GUEST_SESSION_SECRET: optionalMinStr(32),

  // AI
  OPENAI_API_KEY: optionalStr,

  // Billing
  STRIPE_SECRET_KEY: optionalStr,
  STRIPE_WEBHOOK_SECRET: optionalStr,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalStr,

  // Email
  SES_REGION: z.string().default('us-east-1'),
  SES_ACCESS_KEY_ID: optionalStr,
  SES_SECRET_ACCESS_KEY: optionalStr,
  SES_FROM_EMAIL: optionalEmail,

  // SMS
  TWILIO_ACCOUNT_SID: optionalStr,
  TWILIO_AUTH_TOKEN: optionalStr,
  TWILIO_PHONE_NUMBER: optionalStr,

  // Cache
  UPSTASH_REDIS_URL: optionalUrl,
  UPSTASH_REDIS_TOKEN: optionalStr,

  // App
  NEXT_PUBLIC_APP_URL: z.preprocess(
    (v) => (v === '' || v === undefined ? 'http://localhost:3000' : v),
    z.string().url().default('http://localhost:3000')
  ),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TEST_MODE: z.string().default('false'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Feature flags
  ENABLE_AI_PORTRAITS: z.string().default('true'),
  ENABLE_SMS: z.string().default('true'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

function getEnv(): Env {
  if (_env) return _env;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.warn('[env] Validation warnings:', parsed.error.flatten().fieldErrors);
    // Return a safe fallback using raw values + defaults
    _env = {
      DATABASE_URL: process.env.DATABASE_URL || undefined,
      DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED || undefined,
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || undefined,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || undefined,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || undefined,
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'wedding-media',
      R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || undefined,
      JWT_SECRET: process.env.JWT_SECRET || undefined,
      GUEST_SESSION_SECRET: process.env.GUEST_SESSION_SECRET || undefined,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || undefined,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || undefined,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined,
      SES_REGION: process.env.SES_REGION || 'us-east-1',
      SES_ACCESS_KEY_ID: process.env.SES_ACCESS_KEY_ID || undefined,
      SES_SECRET_ACCESS_KEY: process.env.SES_SECRET_ACCESS_KEY || undefined,
      SES_FROM_EMAIL: process.env.SES_FROM_EMAIL || undefined,
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || undefined,
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || undefined,
      TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || undefined,
      UPSTASH_REDIS_URL: process.env.UPSTASH_REDIS_URL || undefined,
      UPSTASH_REDIS_TOKEN: process.env.UPSTASH_REDIS_TOKEN || undefined,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
      TEST_MODE: process.env.TEST_MODE || 'false',
      LOG_LEVEL: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
      ENABLE_AI_PORTRAITS: process.env.ENABLE_AI_PORTRAITS || 'true',
      ENABLE_SMS: process.env.ENABLE_SMS || 'true',
    } as Env;
    return _env;
  }

  _env = parsed.data;
  return _env;
}

// Lazy proxy — validation runs on first property access, not at import time.
// This prevents build failures when env vars aren't available during next build.
export const env = new Proxy({} as Env, {
  get(_, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});

export function isTestMode(): boolean {
  const e = getEnv();
  return e.TEST_MODE === 'true' || e.NODE_ENV === 'test';
}
