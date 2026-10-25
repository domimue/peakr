import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@peakr/engine', '@peakr/i18n', '@peakr/quiz', '@peakr/theme'],
  cacheComponents: true,
  async redirects() {
    return [{ source: '/get-the-app', destination: '/get-app', permanent: true }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
