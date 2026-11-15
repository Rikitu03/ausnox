# NASA Space Apps 2026 submission preparation

For the team owner to copy, verify and submit. **This document is not evidence that the form has been filled or submitted.** Official team project: https://www.spaceappschallenge.org/2026/find-a-team/ausnox/?tab=project . Deadline supplied by the owner: **November 15, 2026, 11:59 PM Philippine time (UTC+08:00)**. Confirm that the Team Owner's Local Event timezone in the portal matches Philippine time.

The nine fields below follow the owner's authoritative printed **2026** form transcription. The full current [submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [participant terms](https://www.spaceappschallenge.org/legal/) and [challenge](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/) pages could not be fully retrieved during this audit. Indexed official materials and repository-captured resource evidence support context; they do not replace the printed form or a final owner review of current terms. No older fields or deadlines are substituted. Additional links/disclosure detail below are preparation recommendations, not invented mandatory form fields.

## Field 1 — Project Name

Ausnox — Navigating the Red Planet from Dawn to Dusk

## Field 2 — Summary

<!-- summary:start -->
Ausnox is an educational Marswalk planning prototype for Jezero crater. It combines real NASA/USGS terrain and orbital imagery with interactive 2D and 3D views to help users explore how terrain and daylight constrain a round-trip expedition. Users place a hypothetical habitat and science destinations, compare shortest-distance and lower-slope A* routes, and adjust walking speed, science time and reserves. Mars24-based geometric daylight and a simulated mission clock show the return margin and whether a plan is feasible under the selected assumptions. Source labels distinguish observations, derived calculations and simulated inputs. By making planetary data and planning tradeoffs visible, Ausnox addresses the Martian Map challenge as a learning tool. Its small terrain footprint, unresolved approximately 3 m imagery-registration discrepancy and simplified EVA assumptions prevent operational navigation or safety use.
<!-- summary:end -->

Validated count: **927 characters, 127 words** ([evidence](evidence/compliance/documentation-checks.json)). The copy between markers is the field text; the markers and count note are not part of the answer.

## Field 3 — Project Demonstration

**PENDING — eligible public demonstration URL required**

The 2026 form permits a video **30 seconds or less**, or a presentation **7 slides or fewer including the title**. Do not paste the 90.360-second `ausnox-mvp.mp4` walkthrough here. A separate local `ausnox-showcase-25s.mp4` candidate has verified 25.000-second video/audio/container durations; the owner confirms it has not been uploaded to YouTube. No eligible public slide presentation was found on audited main.

Before replacing the placeholder: resolve the media rights/branding review; upload the film with [prepared disclosure text](../film/youtube-description.txt), English captions and required synthetic-content declarations; check the final URL in a private window without login. Check the hosted duration, sound, captions, visible watermark and accurate scientific representation after platform processing. A local file passing duration does not establish public accessibility.

## Field 4 — Project

https://ausnox.vercel.app/

Audit request without credentials returned HTTP 200 and app HTML. Prior complete browser workflow evidence is in [RELEASE_REPORT.md](RELEASE_REPORT.md); this does not imply this compliance branch is already deployed.

## Field 5 — Project Details

### Problem

A Mars surface expedition must return to its starting point within terrain, daylight and mission constraints. An attractive map alone cannot explain which measurements support a route, which quantities are calculated and which assumptions drive its feasibility. The Interplanetary Survival Guide: Martian Map challenge invites an accessible way to explore those relationships.

### Solution and workflow

Ausnox is a browser-based educational planning prototype focused on a 2.43 km² Jezero delta-front area. Users inspect NASA mission imagery, elevation and slope; place a hypothetical habitat and destination inside valid coverage; add science stops; and compare shortest-distance and lower-slope A* routes. The engine computes an outbound path and an independent return path. Users adjust speed, slope limits, science time and reserves, then inspect the round trip, timing and return margin. A pausable simulated mission clock illustrates progress. Missing terrain or model inputs remain unknown/indeterminate; no successful route is invented to conceal failure. When a cited target lies on a cell too steep for the chosen limit, an alternative usable cell requires confirmation.

The optional Three.js viewer renders the same DEM and shares route/mission state with the 2D map. Relief, elevation and slope views support exploration; 1× is the default vertical scale. A 2D fallback supports browsers without usable WebGL. Imagery draping is not implemented. If external imagery fails, locally derived terrain relief and route calculations remain available.

### NASA and USGS data

The terrain source is the USGS Mars 2020 Terrain Relative Navigation HiRISE DTM mosaic (Fergason et al., 2020; DOI 10.5066/P9REJ9JN), derived from NASA MRO HiRISE observations. It is not the later 2025 Mars Sample Return mosaic. A reproducible Python pipeline crops source 1 m posts and block-averages them to a 2 m grid, preserving unknown cells and recording source/output SHA-256, Mars CRS, processing and citations in the manifest. Horn slope is calculated from this grid.

NASA/JPL Mars Trek provides MRO HiRISE Jezero imagery, MRO CTX context imagery and MGS MOLA regional context. MOLA is not the high-resolution routing DEM. NASA/JPL-Caltech Perseverance MMGIS localizations identify two science locations; these are cited rover positions, not exact sample-tube or rock coordinates. Perseverance raw-image metadata support activity-sol and clock validation. NASA GISS Mars24 equations and worked examples support timekeeping and geometric daylight.

### Architecture, tools and creativity

The static-first application uses React, TypeScript and Vite; Leaflet/React Leaflet for the 2D planetary map; Three.js for 3D; Zustand for state; and Tailwind CSS, Radix UI, Recharts and Lucide for interface presentation. A framework-independent TypeScript scientific engine handles Mars coordinates, terrain validity, A*, solar calculations, mission feasibility and simulation. Routing runs in a Web Worker. Python/NumPy/Rasterio/pyproj support offline geospatial preprocessing and validation. Vitest, Testing Library and Playwright support testing; Vercel hosts the app. There is no required login, paid runtime API or database.

The project's creative contribution is the connection between transparent planetary provenance, paired outbound/return routing and adjustable daylight/EVA constraints in one explorable 2D/3D workflow. It helps learners and hypothetical mission planners see how changes to science time, terrain tolerance and reserves affect a plan, rather than presenting a route as an unconditional safety recommendation. No claim of scientific novelty or proven real-mission benefit is made.

### Evidence, limitations and AI assistance

The scientific, integration and release reports retain executed tests, reference comparisons and browser evidence. The original release records 99 frontend/integration tests, 88 engine tests and five browser tests. The compliance report separately records current checks. This is not independent NASA certification.

Observed-source data, derived results and simulated assumptions are distinct. The shipped grid and slopes are derivatives of authentic observations; A* routes and daylight are calculated. The habitat, walking/EVA settings and timeline are hypothetical. **X2b imagery-to-DTM registration remains FAIL and unresolved, with approximately 3 m potential discrepancy.** The 2 m grid does not resolve all footing hazards. Daylight is geometric and omits terrain shadows/weather; no radiation, life-support or communications model exists. Full screen-reader, contrast and physical-touch audits are not established by the release evidence. Ausnox is educational, not flight-qualified navigation or astronaut safety guidance, and is not endorsed by NASA.

OpenAI GPT models, OpenAI Codex and Anthropic Claude Code assisted planning, code, UI/design implementation, integration, tests, automation and documentation, with exact attribution limits documented publicly. AI-assisted implementation did not replace NASA/USGS observations with generated terrain. The separate short-film candidate uses real app captures, SI-assisted programmed motion graphics/score and ElevenLabs synthetic narration; its visible SI watermark, captions, metadata and rights checks are documented separately. A final uploaded demonstration link remains pending. Full disclosure: https://github.com/Rikitu03/ausnox/blob/chore/nasa-space-apps-compliance/docs/AI_USAGE.md .

Live application: https://ausnox.vercel.app/

Source repository: https://github.com/Rikitu03/ausnox

Resource/license register: https://github.com/Rikitu03/ausnox/blob/chore/nasa-space-apps-compliance/docs/THIRD_PARTY_NOTICES.md . Original project code is MIT by owner authorization; external components and assets retain their own terms. Media permissions, external design rights and restricted dependency compatibility still require review.

## Field 6 — Use of Super Intelligence (SI)

Match these **categories** to the actual dropdown wording. The exact option labels and whether multiple selections are possible were not supplied; none are invented here. **Do not select “I did not use SI.”** A README disclosure does not replace this form selection.

| Category to match | Supported answer |
| --- | --- |
| Programming / coding | Yes: OpenAI GPT models/Codex and Anthropic Claude Code; frontend, 3D, integration, scientific/pipeline implementation assistance, debugging and test automation |
| Writing / documentation | Yes: planning, specifications, handoffs, reports and this submission preparation |
| Design assistance | Yes: interface implementation, critique/refinement and programmed film motion graphics; no claim that Figma itself generated the design |
| Generated images / video | Disclose the candidate as an **SI-generated video composite made with AI-assisted code and real application captures** if that film is submitted. No separate text-to-image/video Mars asset is established. Preserve its visible watermark |
| Generated audio | Yes for the candidate: ElevenLabs synthetic English narration. Also disclose the programmed score/SFX made with AI-assisted code, without claiming a generative music service |
| Generated scientific data | No generative replacement of observations identified. Deterministic terrain derivatives/results and illustrative mock/test fixtures must not be described as NASA observations or as generative terrain |

Suggested descriptive text: “OpenAI GPT models, OpenAI Codex and Anthropic Claude Code assisted software planning, programming, interface design/refinement, testing, automation and documentation. The short-film candidate combines real app recordings with SI-assisted programmed compositing and sound design, plus ElevenLabs synthetic narration. Authentic NASA/USGS observations were not replaced with generated terrain. Derived calculations and hypothetical mission assumptions are labeled separately. Detailed disclosure and machine-readable code/workflow metadata are in docs/AI_USAGE.md and docs/SI_DISCLOSURE.json.” Update the film sentence if the final submitted artifact changes.

The supplied form requires visible SI watermarks on generated images/videos; descriptive text **and metadata** acknowledgment for generated audio/code/data; and prohibits generated material using, containing or modifying NASA branding/design elements, including logos, flags and mission identifiers. Verify the entire final media artifact. Attribution to actual missions is factual source credit, not permission to generate mission insignia.

## Field 7 — NASA Data

The exact form columns are **Link Text | Link URL**. These are actually used sources; full identifiers and per-layer credits are in the notices register.

| Link Text | Link URL |
| --- | --- |
| NASA/JPL Mars Trek — WMTS API | https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars |
| Mars Trek — MRO HiRISE Jezero 25 cm controlled orthomosaic | https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/WMTSCapabilities.xml |
| Mars Trek — MRO CTX Jezero 6 m mosaic | https://trek.nasa.gov/tiles/Mars/EQ/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0/1.0.0/WMTSCapabilities.xml |
| Mars Trek — MGS MOLA global 463 m color hillshade | https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/WMTSCapabilities.xml |
| NASA GISS Mars24 — algorithm and worked examples | https://www.giss.nasa.gov/tools/mars24/help/algorithm.html |
| NASA/JPL-Caltech Perseverance localized rover waypoints | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json |
| NASA Perseverance Raw Images Gallery — sol/clock metadata | https://mars.nasa.gov/mars2020/multimedia/raw-images/ |
| NASA — Three Forks sample depot map, target context | https://science.nasa.gov/photojournal/perseverances-three-forks-sample-depot-map |
| NASA — Perseverance Takes First Core From the Delta, target context | https://science.nasa.gov/blog/perseverance-takes-first-core-from-the-delta |

Mars Trek and the raw-images gallery are recorded as challenge Resources in [S5 evidence](../scientific-pipeline/evidence/challenge_resources.json). Current challenge-page retrieval failed during this audit; do not claim a new portal check.

## Field 8 — Space Agency Partner & Other Data

These fields can also carry tool/source credits, per the owner's form instructions. Development tools are identified as such; they are not planetary observations. No other space-agency dataset is claimed. Conditional film rows apply if the inspected candidate is the submitted demonstration.

| Link Text | Link URL |
| --- | --- |
| USGS — Fergason et al. (2020) HiRISE DTM mosaic for Mars 2020 TRN | https://doi.org/10.5066/P9REJ9JN |
| USGS — exact source HiRISE DTM GeoTIFF | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif |
| Horn (1981) — slope method reference | https://doi.org/10.1109/PROC.1981.11918 |
| React / React DOM | https://react.dev/ |
| TypeScript — development/build | https://www.typescriptlang.org/ |
| Vite — development/build | https://vite.dev/ |
| Three.js | https://threejs.org/ |
| Leaflet | https://leafletjs.com/ |
| React Leaflet — Hippocratic-2.1 terms apply | https://react-leaflet.js.org/ |
| Tailwind CSS | https://tailwindcss.com/ |
| Zustand | https://zustand.docs.pmnd.rs/ |
| Radix UI | https://www.radix-ui.com/ |
| Recharts | https://recharts.org/ |
| Lucide icons | https://lucide.dev/ |
| Instrument Sans / Fontsource | https://github.com/Instrument/instrument-sans |
| IBM Plex Mono / Fontsource | https://github.com/IBM/plex |
| Fontsource — self-hosted font packages | https://fontsource.org/ |
| class-variance-authority | https://cva.style/ |
| clsx | https://github.com/lukeed/clsx |
| tailwind-merge | https://github.com/dcastil/tailwind-merge |
| Python — offline pipeline | https://www.python.org/ |
| NumPy — offline pipeline | https://numpy.org/ |
| Rasterio — offline pipeline | https://rasterio.readthedocs.io/ |
| pyproj / PROJ — coordinate verification | https://pyproj4.github.io/pyproj/stable/ |
| PROJ — bundled geospatial dependency | https://proj.org/ |
| GDAL — Rasterio dependency | https://gdal.org/ |
| certifi — download trust store | https://github.com/certifi/python-certifi |
| pytest — pipeline tests | https://docs.pytest.org/ |
| Node.js / npm — development | https://nodejs.org/ |
| npm CLI — dependency tooling | https://github.com/npm/cli |
| Vitest — tests | https://vitest.dev/ |
| Testing Library — UI tests | https://testing-library.com/ |
| Playwright — browser testing/capture | https://playwright.dev/ |
| Chromium — browser verification/capture | https://www.chromium.org/chromium-projects/ |
| FFmpeg — recording/film encoding | https://ffmpeg.org/ |
| ESLint — source checks | https://eslint.org/ |
| typescript-eslint — development | https://typescript-eslint.io/ |
| jsdom — test DOM | https://github.com/jsdom/jsdom |
| globals — lint environments | https://github.com/sindresorhus/globals |
| React hooks / ESLint plugin — development | https://github.com/facebook/react |
| React refresh ESLint plugin — development | https://github.com/ArnaudBarre/eslint-plugin-react-refresh |
| DefinitelyTyped — development types | https://github.com/DefinitelyTyped/DefinitelyTyped |
| Vite React plugin — build tooling | https://github.com/vitejs/vite-plugin-react |
| Agentation / optional MCP bridge — development only | https://www.agentation.com/ |
| Vercel — static hosting | https://vercel.com/ |
| GitHub — source hosting | https://github.com/ |
| Figma MARS — external design reference; rights review pending | https://www.figma.com/design/EejtJslZYEA3RTeYntsURR/MARS?node-id=0-1 |
| OpenAI GPT models — development assistance | https://openai.com/ |
| OpenAI Codex — development/documentation assistance | https://openai.com/codex/ |
| Anthropic Claude Code — development assistance | https://code.claude.com/docs/en/overview |
| ElevenLabs — candidate narration/transcription; rights check pending | https://elevenlabs.io/ |
| Candidate film — production/disclosure and programmed score method | https://github.com/Rikitu03/ausnox/blob/chore/nasa-space-apps-compliance/film/production-disclosure.md |
| Complete dependency versions, transitive credits and rights register | https://github.com/Rikitu03/ausnox/blob/chore/nasa-space-apps-compliance/docs/THIRD_PARTY_NOTICES.md |

Do not cite THEMIS/MEDA/CRISM/RAD as integrated data. Validation-only CTX DTM/orthomosaic/RDRs are recorded in the pipeline report rather than presented as additional deployed datasets. If the form limits link rows, retain direct scientific references and use the complete register link for the detailed tool inventory; this is a recommendation, not a verified form limit.

## Field 9 — Project Submission Verification

**Agree to Terms and Conditions:** the team owner must open and read the current participant terms, confirm authority and resolve rights issues before checking the box. This audit does not accept terms. The indexed official legal page describes openness and third-party rights obligations, but complete current wording was not retrievable here; no automatic Apache/default-license conclusion is made.

**Confirm All Work is Original:** the team must truthfully confirm its original contribution while disclosing third-party data, code, design references and SI assistance. Do not interpret the checkbox as claiming ownership of NASA/USGS observations or dependencies. MIT authorization covers original code; it does not clear the external Figma/logo, restricted dependency conditions, narration rights or generated-output originality. Those unresolved items are listed in [the compliance report](NASA_COMPLIANCE_REPORT.md).

## Final owner actions

1. Review the PR, integrate and deploy approved disclosures; verify the live Credits links and public license notices.
2. Resolve the outstanding rights checks, upload the eligible demonstration with SI text/metadata/watermark and captions, and verify its public URL without login.
3. Copy and verify the nine fields in order, select the actual SI dropdown option(s), and review the current terms/originality confirmations personally.
4. **Save progress. Verify the information. Click Submit for Judging. Confirm the successful submission notification** before the owner-confirmed deadline/timezone. Retain the receipt/screenshot.

No NASA form editing, checkbox acceptance or submission was performed by this repository task.
