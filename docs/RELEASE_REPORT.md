# AUSNOX — Release verification and demonstration

Date: 2026-11-15. Public application: <https://ausnox.vercel.app>.

The requested local and deployed workflows passed. This report preserves the initial failure evidence, fixes and final results; it does not upgrade the unresolved scientific registration finding to a pass.

## Demonstration

[Watch the captioned MP4](https://ausnox.vercel.app/demo/ausnox-mvp.mp4) · [repository copy](../public/demo/ausnox-mvp.mp4) · [SRT captions](../public/demo/ausnox-mvp.srt).

Actual browser recording of **https://ausnox.vercel.app**, application commit `d556d45e2573fd99f21b65c235941cf1e1e0f09e`. Encoded duration **90.36 seconds**, **1600 × 900**, H.264/yuv420p, **3,492,258 bytes**. It is captioned without an audio narration. No UI state was composited or fabricated: the captures show a confirmed real-terrain mission, shorter versus lower-slope routes, the same DEM in 3D, both summary legs, an afternoon start, then destination science time increased from 30 to 240 minutes and a negative return margin. It ends on the sources page with the unresolved registration caveat in the captions.

The [recording metadata](evidence/release-2026-11-15/recording.json) stores action times and the source commit. [FFprobe output](evidence/release-2026-11-15/video-probe.json) verifies the encoded duration, format and dimensions. FFmpeg rendered the captions from the actual action timestamps; it did not alter the application results.

## Scope and review baseline

The user selected **HEAD — current uncommitted changes**. Baseline: `ef1a1c5d4be934e408f5a02e6000ba9958643817`. The review used `git diff HEAD`, since a three-dot HEAD-to-HEAD comparison cannot include working-tree changes. The original patch is retained in local `artifacts/release-2026-11-15/initial-changes.patch`. The originating specification is `PRD.md`, `MASTERPLAN.md`, `UI_UX_SPEC.md` and `TESTING_AND_VALIDATION.md`.

Remote `main` was merged before final verification, preserving its development-only Agentation integration and package lock. The two-axis review was performed by independent reviewers using the explicitly invoked code-review skill. No issue-tracker integration was required to read the supplied specifications; `/setup-matt-pocock-skills` can configure that optional integration later.

## Standards

**1 finding, fixed.** The prominent verdict had shortened the required qualification to “Feasible mission.” `SCIENTIFIC_MODELS.md` §1 requires “Feasible under selected assumptions” / “Infeasible under selected assumptions.” The panel now uses the shared `FEASIBILITY.label`; regression assertions were updated. A targeted test failed before the fix. No other documented-standard violation or material Fowler smell was established in the initial diff.

## Spec

**2 findings, fixed.** The qualified feasibility verdict above restores PRD FR-12 and §5. The lower-slope explanation also promised avoidance of “climbing,” despite default routing having no directional ascent objective. It now describes preference for gentler ground and explicitly does not promise minimum ascent or energy, matching `SCIENTIFIC_MODELS.md` §4.

## Functional fix discovered in production

At 768 × 1024, opening coordinate entry closes the planner sheet. Escape then left keyboard focus behind rather than returning to the surviving planner launcher. The production check reproduced this while the desktop scientific workflow and imagery fallback passed.

Controlled Radix dialogs and sheets now retain their external opener before React autoFocus commits. Coordinate entry supplies the planner launcher as a fallback when its original opener was unmounted. Closing an overlay does not take focus away from a newly opened dialog; a nested provenance sheet returns focus inside its remaining parent. `tests/browser/keyboard.spec.ts` covers desktop opener restoration, nested provenance and the tablet sheet → coordinate dialog → launcher flow.

## Executed checks

| Check | Status | Evidence |
| --- | --- | --- |
| Initial typecheck and lint | PASS | Local command logs |
| Initial engine tests | PASS | 88 tests |
| Frontend tests after verdict correction | PASS | 99 tests, 7 files, one worker |
| Clean install on merged tree | PASS | `npm ci`, 383 packages; engine postinstall completed |
| Final typecheck and lint | PASS | `npm run typecheck`, `npm run lint`, exit 0 |
| Final frontend and engine suites | PASS | 99 frontend tests / 7 files; 88 engine tests / 6 files |
| Final production build | PASS | Vite build 3.82 s; existing lazy 3D chunk-size advisory |
| Final local browser suite | PASS | 5 tests, 49.6 s; 3D, WebGL fallbacks and desktop/tablet focus |
| Local complete release workflow | PASS | Desktop keyboard, 768px tablet, blocked NASA imagery |
| Public desktop keyboard/scientific workflow before release | PASS | Both legs, route mode, coordinate refusal, science-time verdict change, checksum UI |
| Public real terrain bytes before release | PASS | 5,760,000 bytes, SHA-256 below |
| NASA imagery before release | PASS | 28 successful tile responses in desktop scenario |
| Imagery outage before release | PASS | Three blocked probe requests; real DTM relief and routing remain usable |
| Tablet focus before release | FAIL, subsequently fixed and verified | Initial failure retained in verification-before.json |
| Final public deployment verification | PASS | Application commit d556d45, Vercel READY; desktop, tablet and imagery-outage scenarios pass |
| Captioned 60–120 second recording | PASS | Actual public-site recording; 90.36 s encoded MP4; no application exceptions |

Final public evidence: [scenario results and browser/network signals](evidence/release-2026-11-15/verification-production.json), [deployment metadata](evidence/release-2026-11-15/deployment.json), [full browser-suite log](evidence/release-2026-11-15/browser-tests-verified.log), [frontend tests](evidence/release-2026-11-15/frontend-tests-final.log), [engine tests](evidence/release-2026-11-15/engine-tests-final.log), [build](evidence/release-2026-11-15/build-final.log), [initial focus failure](evidence/release-2026-11-15/verification-before.json).

The final deployed desktop scenario received **52 successful NASA tile responses**. The **5,760,000-byte** decoded terrain matches the pinned SHA-256 and is served with **Brotli** encoding. Terrain is fetched once per page across view changes; both route legs and the load-time checksum appear in the UI. Changing science time produces infeasible and restoring it produces feasible. The 768px tablet case confirms no horizontal overflow and successful Escape/focus restoration. Blocking three NASA probe URLs produces the real local DTM relief fallback while routing remains available. Application page exceptions are empty; the outage scenario records its deliberately blocked network requests separately.

Screenshots: [both route legs](evidence/release-2026-11-15/both-routes-summary.png), [infeasible timing](evidence/release-2026-11-15/science-time-infeasible.png), [terrain checksum and X2b](evidence/release-2026-11-15/terrain-checksum.png), [768px tablet](evidence/release-2026-11-15/tablet-768.png), [imagery fallback](evidence/release-2026-11-15/imagery-outage.png).

The initial parallel frontend run hit a worker startup timeout. The constrained one-worker run completed all 99 tests. The first clean install encountered a Windows native-module lock; only the node process holding modules inside this workspace was stopped before retrying. These are recorded runner/environment failures, not silently counted as passes.

Two old browser-test paths initially timed out because route comparison and source details now sit inside native disclosures. The tests were updated to open those controls before operating them; the subsequent complete five-test suite passed. No scientific behavior was changed to satisfy a test.

## Backend and production boundaries

The backend-patterns review preserves the documented static-first design. Source acquisition and terrain validation stay in the reproducible Python pipeline; adapters handle runtime availability and typed errors; A*, daylight and feasibility stay in the browser/worker. No database, credentials, server queue, telemetry service or paid runtime was added. Development Agentation strings are absent from the production JavaScript bundle (zero matches for `agentation` and `localhost:4747`).

## Reproduce

```powershell
npm ci
npm run typecheck
npm run lint
npx vitest run --maxWorkers=1
npm run test:engine
npm run build
npm run test:browser
$env:RELEASE_URL = 'https://ausnox.vercel.app'
node scripts/verify-release.mjs
```

Stop this workspace's Vite process before `npm ci` on Windows. The release script drives Tab/Enter/arrow-key placement, invalid coordinates, route preference, both summary legs, science-time feasibility, terrain verification, tablet dialogs and blocked NASA imagery. It saves JSON signals and screenshots under ignored `artifacts/`; selected final evidence is copied alongside this report.

## Dataset trail and credits

- **Terrain:** Fergason et al. (2020), USGS HiRISE DTM mosaic for Mars 2020 Terrain Relative Navigation, DOI [10.5066/P9REJ9JN](https://doi.org/10.5066/P9REJ9JN). NASA/JPL-Caltech/University of Arizona/USGS. Original 1 m posts are aggregated to the shipped 2 m grid; Horn slope is derived from that grid. Exact products, acquisition dates, CRS, source hashes and redistribution notes: [`public/data/jezero/manifest.json`](../public/data/jezero/manifest.json), [`DATA_SOURCES.md`](DATA_SOURCES.md), [`DATA_PIPELINE.md`](DATA_PIPELINE.md).
- **Imagery:** NASA/JPL Mars Trek WMTS, MRO HiRISE/CTX and MGS MOLA; credit NASA/JPL-Caltech/University of Arizona/MSSS/USGS/GSFC and the MOLA team as appropriate to each layer. Full layer identifiers and capabilities URLs are in `DATA_SOURCES.md` and source cards.
- **Science locations:** NASA/JPL-Caltech Perseverance MMGIS localized rover waypoints and raw-image metadata. These are rover positions, not exact sample-tube or rock coordinates.
- **Solar model:** NASA GISS Mars24, Allison & McEwen (2000); [published algorithm and worked examples](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html).
- **Software:** React, TypeScript, Vite, Three.js, Leaflet/React Leaflet, Recharts, Radix UI, Tailwind CSS, Zustand, Lucide, Playwright/Vitest and the documented Python geospatial dependencies. Instrument Sans and IBM Plex Mono fonts. Exact versions are pinned in package locks; installed packages carry their license texts. Vercel provides static hosting. Agentation is a local development tool and is removed from production code.
- **Preprocessing and release tools:** Python; NumPy 2.5.4; Rasterio 1.5.2 with GDAL/PROJ; pyproj 3.8.0; certifi 2026.10.23; pytest 9.2.0, as pinned in `scientific-pipeline/requirements.txt`. Playwright/Chromium recorded the browser and FFmpeg 9.0 encoded the captioned demonstration.
- **Design and AI assistance:** user-supplied Figma draft was a reference during earlier work, not a parity implementation. Interface, code, review and release automation were produced with AI assistance, including OpenAI Codex. No synthetic terrain or environmental measurements were substituted.

Shipped terrain SHA-256: `fcb96e32bc854fff23d56ee4301bea7a77a38e892afc24ada6d0ce5aea1b7f49`. Source DTM SHA-256: `44c3819caa33922b06f7a8228534d1e32ab4087aca85144136d825c371c747d8`. No scientific grid, engine or pipeline change was made in this release.

Eligibility evidence is already recorded as S5 PASS in `scientific-pipeline/evidence/challenge_resources.json`: Mars Trek and the Perseverance Raw Images Gallery are listed and used. This release does not claim a new portal eligibility check.

## Remaining scientific and validation limits

X2b remains **FAIL**, unresolved. The later scientific report records S2 PASS with X2b as a failed supplementary registration check; neither the tolerance nor image placement was changed. The original masterplan has a stricter alignment kill switch, so do not describe every alignment check as passing or the offset as resolved. Precision terrain demonstrations can use DTM relief.

Coverage is a 2.43 km² AOI; 2 m cells do not establish footing or resolve small hazards; target coordinates are approximate rover positions; walking speed and EVA constraints are illustrative; daylight is geometric; no weather forecast, radiation, communications or life-support model is supplied. Formal screen-reader, full contrast and physical-touch-device audits are NOT RUN in this release. Keyboard and browser tablet evidence is scoped to the workflows actually exercised. This is an educational scientific prototype, not certified navigation or NASA-endorsed software.

Initial review totals: **Standards 1 finding** (worst: missing verdict qualification), **Spec 2 findings** (worst: missing verdict qualification). All initial findings were fixed; follow-up focus edge cases were covered by passing browser regressions.
