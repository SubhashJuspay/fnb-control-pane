import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Default config — enabled by Next 15 by default. We declare explicitly
      // so future tweaks to allowed origins / body size land here.
    },
  },
  transpilePackages: ['@repo/ui', '@repo/validation', '@repo/db', '@repo/types'],
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // The shared ESM packages (e.g. @repo/ui) author imports with explicit `.js` extensions
  // so they work under Node ESM. Webpack's default resolver does not map `.js` -> `.ts`,
  // so we register an extensionAlias to handle that during transpile.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    const existing = (config.resolve as { extensionAlias?: Record<string, string[]> })
      .extensionAlias ?? {};
    (config.resolve as { extensionAlias?: Record<string, string[]> }).extensionAlias = {
      ...existing,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
