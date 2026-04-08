import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],

  theme: {
    extend: {
      colors: {
        // CapitalForge Brand Palette
        brand: {
          navy: {
            DEFAULT: '#0A1628',
            50:  '#E8ECF3',
            100: '#C5CFDF',
            200: '#9EAECC',
            300: '#778EB8',
            400: '#5A72A8',
            500: '#3E5899',
            600: '#2E4580',
            700: '#1E3267',
            800: '#12214E',
            900: '#0A1628',
            950: '#060D18',
          },
          gold: {
            DEFAULT: '#C9A84C',
            50:  '#FDF9EE',
            100: '#F8EFCF',
            200: '#F0DDAA',
            300: '#E5C87C',
            400: '#D8B55C',
            500: '#C9A84C',
            600: '#B08A30',
            700: '#8D6C22',
            800: '#6B5019',
            900: '#4A3610',
          },
        },

        // Semantic aliases for consistent usage
        primary: {
          DEFAULT: '#0A1628',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#C9A84C',
          foreground: '#0A1628',
        },

        // Neutral grays (slate-based for professional feel)
        surface: {
          DEFAULT: '#F8FAFC',   // page background
          raised: '#FFFFFF',    // cards, panels
          overlay: '#F1F5F9',   // hover, subtle sections
          border: '#E2E8F0',    // dividers
          muted: '#94A3B8',     // secondary text
        },

        // Status palette
        status: {
          approved:  { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
          pending:   { bg: '#FEF9C3', text: '#854D0E', border: '#FDE047' },
          declined:  { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
          review:    { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
          inactive:  { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' },
        },

        // Standard Tailwind grays kept accessible
        gray: {
          50:  '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
          950: '#030712',
        },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },

      borderRadius: {
        sm:  '0.25rem',
        md:  '0.375rem',
        lg:  '0.5rem',
        xl:  '0.75rem',
        '2xl': '1rem',
      },

      boxShadow: {
        card:    '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.10), 0 2px 4px -1px rgb(0 0 0 / 0.08)',
        panel:   '0 0 0 1px rgb(0 0 0 / 0.05), 0 2px 8px 0 rgb(0 0 0 / 0.08)',
        nav:     '1px 0 0 0 #E2E8F0',
        header:  '0 1px 0 0 #E2E8F0',
      },

      spacing: {
        sidebar: '16rem',    // 256px sidebar width
        'sidebar-collapsed': '4rem', // 64px collapsed
        header: '3.5rem',   // 56px header height
      },

      transitionDuration: {
        DEFAULT: '150ms',
      },

      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%':   { transform: 'translateX(-8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'slide-in-right': {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        'highlight-pulse': {
          '0%, 100%': { borderColor: 'transparent', boxShadow: 'none' },
          '50%':      { borderColor: '#C9A84C', boxShadow: '0 0 12px 2px rgba(201, 168, 76, 0.35)' },
        },
      },
      animation: {
        'fade-in':  'fade-in 200ms ease-out',
        'slide-in': 'slide-in 200ms ease-out',
        'slide-in-right': 'slide-in-right 250ms ease-out',
        shimmer:    'shimmer 1.5s infinite linear',
        'highlight-pulse': 'highlight-pulse 600ms ease-in-out 3',
      },
    },
  },

  plugins: [],
};

export default config;
