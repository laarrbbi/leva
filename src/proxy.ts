import { NextResponse, type NextRequest } from 'next/server';

/**
 * Per-request Content-Security-Policy.
 *
 * This runs in the edge runtime on every request, so it stays deliberately
 * small: mint a nonce, build the policy, forward the nonce to the renderer.
 * Static headers that never vary live in `next.config.ts` instead.
 */

/** Edge runtime has Web Crypto but not `node:crypto`. */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCsp(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],

    // `strict-dynamic` means: trust scripts this nonce loads, and ignore any
    // host allowlist. That is what makes the policy robust — an injected
    // <script src="evil.com"> is blocked without us maintaining a domain list.
    // Dev needs eval for React Fast Refresh; production must never allow it.
    'script-src': isDev
      ? ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'unsafe-eval'"]
      : ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"],

    // Next injects small inline <style> blocks it does not nonce, so
    // 'unsafe-inline' is unavoidable here. The residual risk is low: the app
    // renders no user-controlled markup anywhere, so there is no injection
    // point for a style payload. Tracked in docs/03-threat-model.md.
    'style-src': ["'self'", "'unsafe-inline'"],

    // QR codes are generated server-side as data: URIs.
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],

    // Same-origin fetches only. The app talks to no third-party API.
    'connect-src': isDev ? ["'self'", 'ws:'] : ["'self'"],

    // Nothing is embedded, and nothing may embed us.
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],

    // Forms post only to this origin. Stops an injected <form action="evil">
    // from exfiltrating whatever the customer typed.
    'form-action': ["'self'"],

    'manifest-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
  };

  const policy = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');

  // Only meaningful over HTTPS, and it would break a plain-HTTP dev server.
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

export default function proxy(request: NextRequest): NextResponse {
  const isDev = process.env.NODE_ENV !== 'production';
  const nonce = generateNonce();
  const csp = buildCsp(nonce, isDev);

  // Next reads `x-nonce` off the request to nonce the scripts it emits.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  /**
   * Skip static assets and prefetches: they need no policy, and running this on
   * every image request would cost latency for nothing.
   */
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
