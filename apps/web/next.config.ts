import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  turbopack: {
    // Point Turbopack at the monorepo root so it resolves workspace packages correctly
    root: path.resolve(__dirname, '../..'),
  },
};

export default nextConfig;
