/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Disable the Next.js dev overlay indicator ("1 Issue" red badge)
  // so it doesn't appear during demos or confuse stakeholders.
  devIndicators: false,

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/api/:path*',
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
          },
        ],
      },
    ];
  },

  // Webpack alias resolution for monorepo shared modules
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },

  // Production optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Image domains for any external assets
  images: {
    domains: ['localhost'],
  },

  // Standalone output for Docker deployments
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
};

module.exports = nextConfig;
