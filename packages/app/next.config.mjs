/** @type {import('next').NextConfig} */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { parsed: localEnv } = process.env.BUILD_ENV
  ? dotenv.config({
      path: `.env.${process.env.BUILD_ENV}`,
    })
  : {};

const nextConfig = {
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
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.module.rules.push({
      test: /satoshi-wellet/,
      use: [
        {
          loader: 'ts-loader',
          options: {
            compilerOptions: { noEmit: false },
            onlyCompileBundledFiles: true,
            allowTsInNodeModules: true,
          },
        },
      ],
    });
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
};

export default nextConfig;
