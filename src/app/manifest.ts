import type { MetadataRoute } from 'next';

/** Web app manifest: lets families and Vienne add the app to their home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Mentoring Minds',
    short_name: 'Mentoring Minds',
    description: 'Math tutoring with Vienne Elliott: sessions, book homework and progress.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0b1f5c',
    theme_color: '#0b1f5c',
    categories: ['education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Today', url: '/admin/today' },
      { name: 'Homework', url: '/parent/learning' },
    ],
  };
}
