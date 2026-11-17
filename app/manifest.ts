import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Endeavour Buses',
    short_name: 'Endeavour',
    start_url: '/',
    display: 'standalone',
    background_color: '#12284a',
    theme_color: '#12284a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
