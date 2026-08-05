/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Build output directory.
   *
   * `next dev` and `next start` both read and write this, so a dev server and
   * a production server pointed at the same one fight: whichever ran last
   * wins, and the other dies with `Cannot find module './383.js'` from
   * `.next/server/webpack-runtime.js` — a running dev server loses its module
   * graph the moment a production build replaces the chunks underneath it.
   *
   * Left at `.next` by default, because the Dockerfile copies
   * `src/frontend/.next/standalone` and CI archives `src/frontend/.next/` by
   * that name. Point the production server elsewhere with NEXT_DIST_DIR —
   * `npm run build:frontend:prod` and `npm run start:frontend:prod` do exactly
   * that, so both servers can run side by side. The variable has to be set for
   * the build *and* the start, or `start` looks for a build that is not there.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

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
