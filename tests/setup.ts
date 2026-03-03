import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Set test environment
process.env.TEST_MODE = 'true';
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.GUEST_SESSION_SECRET = 'test-session-secret-that-is-at-least-32-chars-long';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';

// Mock R2 storage
vi.mock('@/lib/storage/r2', () => ({
  generatePresignedPutUrl: vi.fn().mockImplementation(async (params: any) => {
    if (params.contentLength > 500_000_000) {
      throw new Error('File too large (max 500MB)');
    }
    const now = new Date();
    const yearMonth = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const key = `weddings/${params.weddingId}/uploads/${yearMonth}/${params.uploadId}/original.jpg`;
    return {
      url: 'https://mock-r2.example.com/presigned',
      key,
      expiresAt: new Date(Date.now() + 3600000),
      multipart: params.contentLength > 100_000_000,
      uploadId: params.contentLength > 100_000_000 ? `multipart-${params.uploadId}` : undefined,
    };
  }),
  getCdnUrl: vi.fn().mockImplementation((key: string) => `https://mock-cdn.example.com/${key}`),
  getThumbnailKey: vi.fn().mockImplementation((key: string) => key.replace('/original.', '/thumbnail.')),
}));

// Mock OpenAI
vi.mock('@/lib/ai/openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/openai')>();
  return {
    ...actual,
    getOpenAIClient: vi.fn().mockReturnValue({
      images: {
        edit: vi.fn().mockResolvedValue({
          data: [{ url: 'https://mock-openai.example.com/portrait.png' }],
        }),
      },
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Mock AI response' } }],
          }),
        },
      },
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: new Array(1536).fill(0.01) }],
        }),
      },
      audio: {
        transcriptions: {
          create: vi.fn().mockResolvedValue({ text: 'Mock transcript of a wedding toast.' }),
        },
      },
    }),
  };
});

// Mock email
vi.mock('@/lib/email/ses', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'mock-ses-id' }),
}));

// Mock SMS
vi.mock('@/lib/sms/twilio', () => ({
  sendSms: vi.fn().mockResolvedValue({ sid: 'mock-twilio-sid' }),
}));
