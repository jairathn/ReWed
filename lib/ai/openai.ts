import OpenAI from 'openai';
import { isTestMode } from '@/lib/env';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey && !isTestMode()) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    client = new OpenAI({ apiKey: apiKey || 'test-key' });
  }
  return client;
}

// Portrait style definitions
export const AI_PORTRAIT_STYLES = {
  'castle-wedding': {
    name: 'Castle Wedding',
    emoji: '🏰',
    prompt: 'Transform this photo into a dramatic royal castle wedding portrait. The subject should appear as royalty in an ornate palace setting with golden chandeliers and velvet drapes. Oil painting style, warm tones, cinematic lighting.',
    estimatedSeconds: 30,
  },
  'mughal': {
    name: 'Mughal Royalty',
    emoji: '👑',
    prompt: 'Transform this photo into a Mughal-era royal portrait. The subject should appear as Mughal royalty in an ornate palace with intricate Islamic geometric patterns, marble columns, and jeweled accessories. Miniature painting style with rich gold and jewel tones.',
    estimatedSeconds: 30,
  },
  'bollywood-poster': {
    name: 'Bollywood Poster',
    emoji: '🎬',
    prompt: 'Transform this photo into a vintage Bollywood movie poster. Dramatic lighting, bold colors, cinematic pose, with Devanagari-inspired decorative text elements and film reel borders.',
    estimatedSeconds: 25,
  },
  'watercolor': {
    name: 'Watercolor',
    emoji: '🎨',
    prompt: 'Transform this photo into a beautiful watercolor painting. Soft, flowing brushstrokes with delicate color washes. Artistic and dreamy, with subtle paper texture visible.',
    estimatedSeconds: 20,
  },
  'renaissance': {
    name: 'Renaissance',
    emoji: '🖼️',
    prompt: 'Transform this photo into an Italian Renaissance portrait in the style of Raphael or Leonardo da Vinci. Rich oil painting technique with sfumato, classical composition, dramatic chiaroscuro lighting.',
    estimatedSeconds: 30,
  },
  'pop-art': {
    name: 'Pop Art',
    emoji: '🎯',
    prompt: 'Transform this photo into a vibrant Andy Warhol-style pop art portrait. Bold flat colors, high contrast, halftone dots, and graphic comic-book energy.',
    estimatedSeconds: 20,
  },
  'anime': {
    name: 'Anime',
    emoji: '✨',
    prompt: 'Transform this photo into a beautiful Studio Ghibli-inspired anime portrait. Soft cel-shading, large expressive eyes, warm golden-hour lighting, and whimsical background details.',
    estimatedSeconds: 20,
  },
  'oil-painting': {
    name: 'Oil Painting',
    emoji: '🖌️',
    prompt: 'Transform this photo into a classical oil painting portrait. Rich, textured brushstrokes, warm Rembrandt-style lighting, deep shadows, and luminous highlights on a dark background.',
    estimatedSeconds: 25,
  },
  'pixel-art': {
    name: 'Pixel Art',
    emoji: '👾',
    prompt: 'Transform this photo into a charming 16-bit pixel art portrait. Clean pixel grid, limited retro color palette, with a nostalgic video game aesthetic.',
    estimatedSeconds: 15,
  },
  'stained-glass': {
    name: 'Stained Glass',
    emoji: '⛪',
    prompt: 'Transform this photo into a beautiful stained glass window design. Bold black outlines separating vibrant colored glass segments, with light appearing to shine through. Cathedral-inspired composition.',
    estimatedSeconds: 25,
  },
} as const;

export type PortraitStyleId = keyof typeof AI_PORTRAIT_STYLES;

// Current recommended model for image generation
export const IMAGE_MODEL = 'gpt-image-1' as const;
// Chat model for FAQ, CSV parsing, etc.
export const CHAT_MODEL = 'gpt-4.1' as const;
// Smaller chat model for simpler tasks
export const CHAT_MODEL_MINI = 'gpt-4.1-mini' as const;
// Embedding model for FAQ
export const EMBEDDING_MODEL = 'text-embedding-3-small' as const;
