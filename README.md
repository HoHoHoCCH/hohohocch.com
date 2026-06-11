# hohohocch.com

Personal static site for `hohohocch.com`, deployed on Cloudflare Pages with Pages Functions for backend routes.

## Project layout

- `public/` - Cloudflare Pages static output
- `public/index.html` - main site page
- `public/tpm/` - TPM 3D viewer page
- `public/inprogress/` - placeholder page
- `public/plan/` - TeenTech board layout page
- `public/assets/css/` - stylesheets
- `public/assets/js/` - browser scripts
- `public/assets/images/` - image assets
- `public/assets/models/` - 3D models
- `public/assets/vendor/` - vendored third-party browser modules
- `functions/` - Cloudflare Pages Functions backend routes
- `public/_routes.json` - limits Function invocations to backend routes

## Cloudflare Pages

- Build command: none
- Build output directory: `public`
- Local preview: `npx wrangler pages dev public`

Current function routes:

- `/api/health` - JSON health check
- `/tpm` - serves the TPM viewer page
- `/inprogress` - serves the placeholder page
- `/plan` - serves the TeenTech board layout page
