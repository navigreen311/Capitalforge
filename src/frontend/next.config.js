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

  // Webpack resolution for monorepo shared modules.
  //
  // The alias itself comes from `paths` in tsconfig.json, which Next reads; this block
  // spread the existing aliases and added none, and the comment claimed otherwise.
  //
  // What was actually missing is the extension mapping. The root tsconfig is
  // `moduleResolution: "NodeNext"`, which requires a `.js` suffix on relative imports,
  // and this app is `moduleResolution: "Bundler"`, where the suffix is wrong. The first
  // frontend file to import from `@shared` wrote it the backend's way and webpack
  // resolved `@shared/types/index.js` to a file that does not exist - `index.ts` does.
  //
  // `Failed to compile. Module not found: Can't resolve '@shared/types/index.js'`, and
  // the same line inside Playwright's `[WebServer]`, where it hung the browser suite
  // until the job was killed at thirty minutes. Neither had run: the branch had never
  // been through CI.
  //
  // So both conventions resolve now. `.js` in a shared import is not a mistake anybody
  // should have to remember not to make, and it is the convention on the other side of
  // the same repository.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
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
