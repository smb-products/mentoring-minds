import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera for photos of homework. Nothing uses the microphone.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // A starting policy that can't break Next.js scripts: no framing, no plugins, no <base> tricks.
  // (A full script-src policy needs nonces; see docs/DEPLOY.md "Hardening later".)
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
];

const nextConfig: NextConfig = {
  experimental: {
    // Kept at 4 MB (Vercel's own cap is 4.5 MB). Files go straight to storage, so no server action
    // sends a body near this since the photo read was removed (S33).
    serverActions: { bodySizeLimit: '4mb' },
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        // The service worker must never be cached, so updates reach every device.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
