import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const pool = getPool();

    const result = await pool.query(
      'SELECT display_name, config FROM weddings WHERE slug = $1',
      [slug]
    );

    if (result.rows.length === 0) {
      return Response.json(
        { error: { code: 'WEDDING_NOT_FOUND', message: 'Wedding not found' } },
        { status: 404 }
      );
    }

    const wedding = result.rows[0];
    const displayName = wedding.display_name || 'ReWed';
    const config = wedding.config || {};
    const themeColor = config.theme?.colors?.primary || '#C4704B';

    const manifest = {
      name: displayName,
      short_name: displayName.length > 12 ? displayName.slice(0, 12) : displayName,
      description: `Guest experience for ${displayName}`,
      start_url: `/w/${slug}/home`,
      scope: `/w/${slug}/`,
      display: 'standalone',
      background_color: '#FEFCF9',
      theme_color: themeColor,
      icons: [
        {
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    };

    return Response.json(manifest, {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Manifest error:', error);
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate manifest' } },
      { status: 500 }
    );
  }
}
