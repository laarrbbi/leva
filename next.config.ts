import type { NextConfig } from 'next';

/**
 * Headers that never depend on the request are declared here so they are applied
 * by the edge/CDN layer without running any JavaScript. The Content-Security-Policy
 * is *not* here: it carries a per-request nonce and therefore lives in `src/proxy.ts`.
 *
 * See `docs/02-security-architecture.md` for the rationale behind each value.
 */
const securityHeaders = [
  // Stop MIME sniffing turning an uploaded/echoed file into an executable script.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Legacy clickjacking defence; modern browsers use CSP `frame-ancestors`.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Never leak the full kiosk URL (which contains the tag id) to third parties.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Deny every powerful feature by default. NFC is re-enabled per-route for /admin/tags.
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'display-capture=()',
      'geolocation=()',
      'gyroscope=()',
      'interest-cohort=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
    ].join(', '),
  },
  // Isolate the browsing context so cross-origin popups cannot reach back into it.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
  // Two years, subdomains included, preload-eligible. Only meaningful over HTTPS.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // No Google/Bing indexing of a customer's individual feedback confirmation.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // better-sqlite3 is a native addon: keep it out of the bundler and require it at runtime.
  serverExternalPackages: ['better-sqlite3'],

  // Self-contained server build for container deployment.
  output: 'standalone',

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // The tag writer needs the Web NFC permission; nothing else in the app does.
        source: '/admin/tags',
        headers: [{ key: 'Permissions-Policy', value: 'nfc=(self)' }],
      },
    ];
  },
};

export default nextConfig;
