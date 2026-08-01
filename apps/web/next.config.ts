import type { NextConfig } from 'next';

const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://api:3333';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` },
      { source: '/health/:path*', destination: `${apiInternalUrl}/health/:path*` }
    ];
  }
};

export default nextConfig;
