import dotenv from 'dotenv';

const PRODUCTION_BRANCH = 'main';
const { BUILD_ENV, WORKERS_CI_BRANCH } = process.env;

// An explicit BUILD_ENV wins; otherwise Workers Builds non-production branches use `.env.stg`.
const isPreviewBranch = WORKERS_CI_BRANCH && WORKERS_CI_BRANCH !== PRODUCTION_BRANCH;
const buildEnv = BUILD_ENV || (isPreviewBranch ? 'stg' : undefined);

const { parsed: localEnv } = buildEnv ? dotenv.config({ path: `.env.${buildEnv}` }) : {};

// Keep in sync with the `/*` rule in `public/_headers`, which covers the static assets
// that Cloudflare serves without invoking the Worker.
const responseHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Access-Control-Allow-Origin', value: '*' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Stops `next dev` from generating AGENTS.md and CLAUDE.md when it detects an AI agent.
  agentRules: false,
  reactStrictMode: true,
  output: 'standalone',
  env: {
    ...localEnv,
  },
  headers: async () => [{ source: '/:path*', headers: responseHeaders }],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_AWS_S3_URL.replace('https://', ''),
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
