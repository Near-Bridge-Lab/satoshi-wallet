import dotenv from 'dotenv';

const PRODUCTION_BRANCH = 'main';
const { BUILD_ENV, WORKERS_CI_BRANCH } = process.env;

// An explicit BUILD_ENV wins; otherwise Workers Builds non-production branches use `.env.stg`.
const isPreviewBranch = WORKERS_CI_BRANCH && WORKERS_CI_BRANCH !== PRODUCTION_BRANCH;
const buildEnv = BUILD_ENV || (isPreviewBranch ? 'stg' : undefined);

const { parsed: localEnv } = buildEnv ? dotenv.config({ path: `.env.${buildEnv}` }) : {};

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Stops `next dev` from generating AGENTS.md and CLAUDE.md when it detects an AI agent.
  agentRules: false,
  reactStrictMode: true,
  output: 'standalone',
  env: {
    ...localEnv,
  },
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
