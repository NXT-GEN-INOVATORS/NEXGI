/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/evidence/:path*',
        destination: 'http://127.0.0.1:8001/evidence/:path*',
      },
      {
        source: '/clips/:path*',
        destination: 'http://127.0.0.1:8001/clips/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
