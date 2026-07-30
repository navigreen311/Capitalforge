// ============================================================
// CapitalForge — ESLint flat config
//
// ESLint 9 dropped .eslintrc support and looks for this file. The
// repository had neither, so `npm run lint` failed instantly with
// "ESLint couldn't find an eslint.config.(js|mjs|cjs) file" — which
// gates the whole CI pipeline, so no test or build job has ever run.
//
// Scope: the TypeScript sources (backend, frontend, shared) plus tests.
// Generated output, dependencies and build artefacts are ignored.
// ============================================================

const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  // ── Ignores ────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'src/frontend/.next/**',
      'prisma/migrations/**',
      '**/*.d.ts',
      // Generated Prisma client output, if ever emitted in-tree
      'prisma/generated/**',
    ],
  },

  // ── Base JS recommendations ────────────────────────────────
  js.configs.recommended,

  // ── TypeScript sources ─────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Node
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'writable',
        require: 'readonly',
        exports: 'writable',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        crypto: 'readonly',
        // Browser (frontend)
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLImageElement: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        FormData: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        Image: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        MutationObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      // TypeScript's own checker handles undefined identifiers and
      // resolves types/interfaces; the core rules produce false
      // positives on TS syntax.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-dupe-class-members': 'off',

      // Unused variables are worth surfacing but are not defects on
      // their own; an underscore prefix marks a deliberate discard.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // `any` is pervasive in this codebase and removing it is a
      // separate, larger piece of work. Surfaced, not enforced.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Same reasoning: real code-quality signal, but clearing it means
      // retyping shared utilities. Surfaced now, enforceable later.
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',

      // This backend compiles to CommonJS (tsconfig "module": "NodeNext"
      // with no "type": "module"), so require() is a legitimate tool for
      // deliberate lazy/optional loads. The rule targets ESM codebases.
      '@typescript-eslint/no-require-imports': 'warn',

      // `declare global { namespace Express { ... } }` is the supported
      // way to augment Express's Request type — declaration merging, not
      // the legacy module pattern this rule exists to discourage.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],

      // Genuine defect classes — kept as errors.
      'no-cond-assign': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },

  // ── React hooks (frontend) ─────────────────────────────────
  // The frontend already carries `eslint-disable-next-line
  // react-hooks/exhaustive-deps` comments; without the plugin
  // registered ESLint errors on the unknown rule name.
  {
    files: ['src/frontend/**/*.ts', 'src/frontend/**/*.tsx', 'mobile/**/*.ts', 'mobile/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // ── Tests: relax the rules that only matter in production code ──
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', '**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },

  // ── Plain JS config files (next.config.js, postcss.config.js…) ──
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
      },
    },
  },

  // ── k6 performance scripts ─────────────────────────────────
  // Plain .js but authored as ES modules and executed by k6, not Node.
  // Must come after the CommonJS block above so sourceType wins.
  {
    files: ['tests/performance/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        __ENV: 'readonly',
        __VU: 'readonly',
        __ITER: 'readonly',
        console: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
      },
    },
    rules: {
      // Same treatment as the TypeScript sources: worth seeing, not a
      // reason to fail the build.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
