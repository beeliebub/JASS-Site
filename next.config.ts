import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    // script-src needs 'unsafe-inline' alongside 'self': the App Router
    // injects unnonced inline <script> tags on every page to stream the RSC
    // payload (self.__next_f.push(...)). Without 'unsafe-inline' here the
    // browser blocks those tags outright and the page never hydrates -
    // verified locally: a strict `script-src 'self'` policy left every page
    // fully static (no client interactivity) with CSP violations logged to
    // the console for each inline script. Next's own CSP guide
    // (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md,
    // "Without Nonces" section) recommends this exact allowance for apps not
    // using per-request nonces. A nonce-based policy (via proxy.ts) would
    // remove the need for 'unsafe-inline' but requires opting every page
    // into dynamic rendering - deferred for now ("tighten to a
    // nonce-based policy later if desired, don't block on it now").
    // img-src additionally allows https: the new `image` block
    // type takes an admin-supplied absolute URL with no upload pipeline /
    // configured domain allow-list, so the source could be any HTTPS host.
    // Still no plain http: or arbitrary scheme.
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
