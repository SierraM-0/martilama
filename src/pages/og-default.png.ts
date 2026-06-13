import type { APIRoute } from 'astro';
import { renderCard } from '../og/card';

export const GET: APIRoute = async () => {
  const png = await renderCard({
    title: 'martilama',
    subtitle: 'Writing about life and my small opinions.',
  });
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
