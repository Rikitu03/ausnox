# AUSNOX — DEPLOYMENT GUIDE

Version 1.0 | 2026-11-15 | Branch `integration/ausnox-mvp`

Ausnox is a static single-page app. Everything scientific runs in the browser; the server only serves files. No backend, database, account, API key or paid service is needed.

## 1. Requirements

- Node 20.19 or newer (verified with Node 24.13.0, npm 11.6.2).
- For the optional pipeline only: Python 3.11+ with `scientific-pipeline/requirements.txt`. Not needed to run, build or deploy the app.

## 2. Local installation

```bash
git clone https://github.com/Rikitu03/ausnox.git
cd ausnox
git checkout integration/ausnox-mvp
npm ci            # installs the app and builds packages/scientific-engine (postinstall)
npm run dev       # http://localhost:5173, real NASA/USGS data
```

`npm run dev:mock` runs the deterministic demonstration adapters instead (synthetic terrain, labelled Illustrative).

## 3. Scientific engine package

`@ausnox/scientific-engine` lives in `packages/scientific-engine` and is linked as a local dependency (`file:packages/scientific-engine`). Its compiled output (`dist/`, ES modules and `.d.ts`) is produced by:

```bash
npm run build:engine                 # = npm --prefix packages/scientific-engine run build
```

This runs automatically after `npm ci`/`npm install` and at the start of `npm run build`. After editing engine sources during development, rerun it (Vite serves the linked `dist/`). The engine's own gates:

```bash
cd packages/scientific-engine
npm ci && npm run typecheck && npm run build && npm test     # 88 tests
```

## 4. Environment configuration

| Variable | Values | Default | Notes |
| --- | --- | --- | --- |
| `VITE_DATA_MODE` | `real`, `mock` | `real` | Public, not secret. Leave unset in production. `mock` is for UI work and the unit tests |

No credentials exist in this project and none are required. Do not add secrets to `VITE_*` variables: Vite embeds them in the public bundle.

## 5. Build and verify locally

```bash
npm run typecheck
npm run lint
npx vitest run          # 86 tests, incl. 22 on the real Jezero assets
npm run build           # dist/
npx vite preview        # http://localhost:4173
```

`dist/` contains `index.html`, hashed assets (app, engine, route worker) and `data/jezero/` (manifest, 5.76 MB `terrain.bin`, GeoJSON).

## 6. Static hosting

### Vercel (recommended)

`vercel.json` already sets `installCommand: npm ci`, `buildCommand: npm run build`, `outputDirectory: dist` and cache headers.

1. Import the GitHub repository in Vercel (Framework preset: Vite).
2. Set the production branch (for example `main` after the integration PR is merged, or `integration/ausnox-mvp` for a preview).
3. Add no environment variables.
4. Deploy. With the CLI: `npx vercel` (preview) and `npx vercel --prod`.

### Any other static host

Upload `dist/`. Requirements:

- Serve over HTTPS (Web Crypto is needed to verify the terrain checksum; on plain HTTP outside `localhost` the UI reports "checksum not checked").
- Serve `data/jezero/terrain.bin` unmodified, ideally with gzip or brotli (4.12 MB gzip).
- The app uses hash routing and relative asset paths (`base: './'`), so it works from a sub-path and needs no rewrite rules.

## 7. Production verification checklist

After each deployment, open the public URL and check:

1. The footer reads "Educational Marswalk planning simulation. Real NASA/USGS terrain data; mission constraints are illustrative. Not for operational navigation."
2. HiRISE imagery appears and the sample mission asks to confirm the Skinner Ridge cell ("4 m away (12.8°)").
3. After confirming: "Feasible under selected assumptions", margin +7 h 14 min, round trip 1.79 km.
4. Terrain view → Verification: checksum "Verified at load", X2b "FAIL" with the explanation.
5. Data sources shows "Running on real NASA and USGS data with the Ausnox scientific engine".
6. Browser devtools: no console errors; `terrain.bin` loaded once (200); tiles from `trek.nasa.gov` return 200.

If Mars Trek is unreachable, the app marks its layers unavailable and offers the DTM relief; terrain, routing and timing keep working.

## 8. Known limitations

- Overlay registration against imagery is uncertain by about 3 m (check X2b failed, unresolved); routes are aligned with the DTM.
- Routing covers one 2.43 km² area of the Jezero delta front.
- Daylight is geometric (Mars24); constraints are illustrative and not NASA operational values.
- No 3D view in this release.

See `docs/INTEGRATION_REPORT.md` for the full verification record.

## 9. Lockfile compatibility (2026-11-15)

The first application deployment of `main` at `f5e2749` failed during `npm ci`,
before compilation: the lockfile omitted `@emnapi/core@2.0.0-beta.2` and
`@emnapi/runtime@2.0.0-beta.2`, required by Rolldown's optional WASM binding.
Local npm 11 accepted the incomplete lockfile; Vercel's newer npm rejected it.
The repair adds npm-generated dependency entries without changing existing
package versions or replacing `npm ci` with a non-frozen install.

Validation of the repair: **PASS** for npm 12.2.2 clean-install dry run,
**PASS** for an actual clean `npm ci` including the engine postinstall build,
and **PASS** for `npm run build` in the isolated clean checkout. The npm 12
metadata operation used `--allow-remote=all` to resolve registry tarball URLs;
this flag is not added to the deployment's install command. The local npm 12
check warned that Node 24.13.0 was below its supported version; the Vercel
project uses Node 26, so the remote production build remains the final check.

If this recurs, repair the lockfile with the deployment's npm version in a
clean checkout, review its diff, and verify `npm ci`; do not bypass the check.
