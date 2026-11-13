import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
// Par défaut, le site refuse d'être affiché dans un cadre (protection contre le détournement de clic).
// ALLOW_FRAMING=true lève cette protection pour un aperçu de démonstration intégré ; ne jamais l'activer en production.
const ALLOW_FRAMING = process.env.ALLOW_FRAMING === 'true';

const config: NextConfig = {
  // La sortie « standalone » sert à l'image Docker ; ailleurs, le site se lance avec `next start`.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  poweredByHeader: false,
  // L'API est servie sous la même origine que le site : les cookies de session restent « same-site ».
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API_URL}/uploads/:path*` },
    ];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        ...(ALLOW_FRAMING ? [] : [{ key: 'X-Frame-Options', value: 'DENY' }]),
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
      ],
    }];
  },
};

export default config;
