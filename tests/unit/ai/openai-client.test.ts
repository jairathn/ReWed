import { describe, it, expect } from 'vitest';
import { AI_PORTRAIT_STYLES, IMAGE_MODEL, CHAT_MODEL, CHAT_MODEL_MINI, EMBEDDING_MODEL } from '@/lib/ai/openai';

describe('OpenAI Client Configuration', () => {
  it('uses non-deprecated models', () => {
    // gpt-image-1 is the current image generation model
    expect(IMAGE_MODEL).toBe('gpt-image-1');
    // gpt-4.1 is the current chat model
    expect(CHAT_MODEL).toBe('gpt-4.1');
    // gpt-4.1-mini is the current small chat model
    expect(CHAT_MODEL_MINI).toBe('gpt-4.1-mini');
    // text-embedding-3-small is current embedding model
    expect(EMBEDDING_MODEL).toBe('text-embedding-3-small');

    // Ensure we're NOT using deprecated models
    expect(IMAGE_MODEL).not.toBe('dall-e-2');
    expect(IMAGE_MODEL).not.toBe('dall-e-3');
    expect(CHAT_MODEL).not.toBe('gpt-4o-mini');
    expect(CHAT_MODEL).not.toBe('gpt-3.5-turbo');
    expect(CHAT_MODEL_MINI).not.toBe('gpt-4o-mini');
  });

  it('defines all portrait styles with required fields', () => {
    const styles = Object.entries(AI_PORTRAIT_STYLES);
    expect(styles.length).toBeGreaterThanOrEqual(8);

    for (const [id, style] of styles) {
      expect(id).toBeTruthy();
      expect(style.name).toBeTruthy();
      expect(style.prompt).toBeTruthy();
      expect(style.prompt.length).toBeGreaterThan(20);
      expect(style.estimatedSeconds).toBeGreaterThan(0);
    }
  });

  it('has unique style IDs', () => {
    const ids = Object.keys(AI_PORTRAIT_STYLES);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('includes expected styles', () => {
    expect(AI_PORTRAIT_STYLES['watercolor']).toBeDefined();
    expect(AI_PORTRAIT_STYLES['castle-wedding']).toBeDefined();
    expect(AI_PORTRAIT_STYLES['pop-art']).toBeDefined();
    expect(AI_PORTRAIT_STYLES['anime']).toBeDefined();
  });
});
