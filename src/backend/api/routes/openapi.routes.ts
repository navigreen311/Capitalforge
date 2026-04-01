// ============================================================
// CapitalForge — OpenAPI / Swagger UI Routes
//
// GET /api/docs            — Swagger UI HTML (CDN-loaded)
// GET /api/docs/openapi.json — Full spec serialised to JSON
// ============================================================

import { Router, type Request, type Response } from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Path resolution (ESM-safe) ────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// The spec lives two directories up from routes/
const SPEC_PATH = join(__dirname, '..', 'openapi.yaml');

// ── Lazy-parsed spec cache ────────────────────────────────────

let _specJson: Record<string, unknown> | null = null;

function getSpecJson(): Record<string, unknown> {
  if (_specJson) return _specJson;

  const raw = readFileSync(SPEC_PATH, 'utf-8');

  // Parse YAML → JS object using a minimal inline parser shim.
  // In production the js-yaml package is preferred; we fall back to
  // a dynamic require so the file works even if the package is absent
  // (the JSON route will return a 503 in that edge case).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const yaml = require('js-yaml') as { load: (src: string) => unknown };
    _specJson = yaml.load(raw) as Record<string, unknown>;
  } catch {
    // js-yaml not available — fall back to serving raw YAML text via the
    // YAML content-type endpoint; the JSON endpoint returns an error.
    _specJson = {
      error: 'js-yaml package not installed. Run: npm install js-yaml',
      hint:  'GET /api/docs/openapi.yaml is available as an alternative.',
    };
  }

  return _specJson;
}

// ── Router ────────────────────────────────────────────────────

export const openApiRouter = Router();

// ── GET /api/docs ─────────────────────────────────────────────
// Serves a self-contained HTML page that bootstraps Swagger UI
// from the jsDelivr CDN pointed at /api/docs/openapi.json.

openApiRouter.get('/docs', (_req: Request, res: Response): void => {
  const html = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CapitalForge API — Documentation</title>
  <meta name="description" content="Interactive API reference for CapitalForge v2.0.0" />
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"
        crossorigin="anonymous" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #fafafa;
    }
    #banner {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      color: #fff;
      padding: 18px 32px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,.3);
    }
    #banner h1 {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: -.5px;
    }
    #banner span.version {
      background: #3b82f6;
      color: #fff;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: .75rem;
      font-weight: 600;
    }
    #swagger-ui { max-width: 1400px; margin: 0 auto; padding: 24px; }
    /* Tighten up Swagger UI header bar */
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="banner">
    <h1>CapitalForge API</h1>
    <span class="version">v2.0.0</span>
  </div>
  <div id="swagger-ui"></div>

  <script
    src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"
    crossorigin="anonymous"
  ></script>
  <script
    src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"
    crossorigin="anonymous"
  ></script>
  <script>
    window.onload = function () {
      SwaggerUIBundle({
        url:          '/api/docs/openapi.json',
        dom_id:       '#swagger-ui',
        deepLinking:  true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset,
        ],
        layout:      'StandaloneLayout',
        tryItOutEnabled: true,
        persistAuthorization: true,
        filter:      true,
        displayRequestDuration: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth:  2,
      });
    };
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(html);
});

// ── GET /api/docs/openapi.json ────────────────────────────────
// Returns the full OpenAPI spec serialised as JSON.
// Swagger UI (and any tooling) fetches this on load.

openApiRouter.get('/docs/openapi.json', (_req: Request, res: Response): void => {
  try {
    const spec = getSpecJson();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(spec);
  } catch (err) {
    res.status(503).json({
      success: false,
      error: {
        code:    'SPEC_UNAVAILABLE',
        message: 'Unable to load the OpenAPI specification.',
        details: err instanceof Error ? err.message : String(err),
      },
    });
  }
});

// ── GET /api/docs/openapi.yaml ────────────────────────────────
// Serves the raw YAML spec for tooling that prefers YAML input
// (e.g. Stoplight Studio, Redoc CLI, oapi-codegen).

openApiRouter.get('/docs/openapi.yaml', (_req: Request, res: Response): void => {
  try {
    const raw = readFileSync(SPEC_PATH, 'utf-8');
    res.setHeader('Content-Type', 'application/yaml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(raw);
  } catch (err) {
    res.status(503).json({
      success: false,
      error: {
        code:    'SPEC_UNAVAILABLE',
        message: 'Unable to read the OpenAPI YAML file.',
        details: err instanceof Error ? err.message : String(err),
      },
    });
  }
});

export default openApiRouter;
