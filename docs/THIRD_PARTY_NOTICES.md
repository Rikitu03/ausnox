# Third-party resources, notices and rights register

Audit baseline: `7c1d559a8039e50a96b652eab58ecc2c637c71e4`. Versions below come from the committed locks and pipeline requirements, not inferred latest releases. **Verified** means the stated metadata or text was inspected; it does not certify the whole submission's legal compatibility. **Unresolved** means a right, exact distribution term or compatibility question remains open. Services are not described as open source merely because they are publicly accessible.

## Original project license

The owner explicitly authorized **MIT for original project code** during this audit. [LICENSE](../LICENSE) and package license metadata implement that decision. MIT permits reuse subject to retaining its notice and disclaimer. Apache-2.0 was an alternative with express patent provisions; no Apache project relicensing was authorized. No unrestricted/public-domain dedication is asserted.

This grant covers the contributors' original software and associated software documentation to the extent they hold rights. External datasets, imagery, third-party code/fonts, the Figma-derived mark/reference and separately generated narration retain their original terms. The MIT file cannot grant rights the contributors do not hold, clear generated outputs, or resolve component restrictions. Final rights-holder and originality confirmations remain human responsibilities.

## JavaScript, typefaces and development dependencies

License identifiers were checked against matching installed `package.json` and license files after `npm ci`. The complete [npm inventory](evidence/compliance/npm-license-inventory.json) covers all root-lock external entries, including transitive and optional platform dependencies. [Collected license/NOTICE texts](evidence/compliance/NPM_LICENSE_TEXTS.txt) preserve installed copyright statements, BSD disclaimers, Apache notices and font licenses; line endings and trailing whitespace are normalized without changing license wording. Platform-only packages absent on Windows and installed packages lacking a top-level license text are explicitly flagged; metadata alone is not full notice verification. The [engine-lock inventory](evidence/compliance/engine-license-inventory.json) separately records its development graph.

For MIT/ISC components, retain the copyright, permission and disclaimer text. BSD components additionally retain their specified conditions; Apache-2.0 components retain the license and applicable NOTICE/attribution text and identify modifications where required. Font redistribution retains OFL and copyright notices, and any reserved-name conditions. These are summaries: the collected exact texts govern. A runtime notice bundle is also shipped as [public/THIRD_PARTY_NOTICES.txt](../public/THIRD_PARTY_NOTICES.txt) for the static build.

| Name / provider | Exact version | Official source | License verified from package | Usage | Attribution / status |
| --- | --- | --- | --- | --- | --- |
| React / Meta and contributors | 19.3.1 | https://react.dev/ | MIT | UI runtime | Preserve license/copyright; **Verified** |
| React DOM / React contributors | 19.3.1 | https://react.dev/ | MIT | DOM renderer | Preserve notices; **Verified** |
| TypeScript / Microsoft | 6.0.3 | https://www.typescriptlang.org/ | Apache-2.0 | Build/type checking, not a browser service | Preserve license/notice; **Verified** |
| Vite / Vite contributors | 8.3.8 | https://vite.dev/ | MIT (bundled notices also present) | Development and static build | Preserve included licenses; **Verified** |
| @vitejs/plugin-react / Vite contributors | 6.3.0 | https://github.com/vitejs/vite-plugin-react | MIT | React build transform | Preserve notices; **Verified** |
| Three.js / three.js authors | 0.187.0 | https://threejs.org/ | MIT | Optional real-DEM 3D viewer | Preserve notices; **Verified** |
| Leaflet / Vladimir Agafonkin and contributors | 1.9.4 | https://leafletjs.com/ | BSD-2-Clause | 2D Mars map | Preserve copyright, conditions, disclaimer; **Verified** |
| React Leaflet / Paul Le Cam and contributors | 5.0.0 | https://react-leaflet.js.org/ | **Hippocratic-2.1**, not MIT | React/Leaflet integration | Full notice and human-rights/use conditions apply; text **Verified**, competition/relicensing compatibility **Unresolved** |
| @react-leaflet/core / Paul Le Cam and contributors | 3.0.0 | https://github.com/PaulLeCam/react-leaflet | Hippocratic-2.1 in installed license | Map integration internals | Same restriction/notice review as React Leaflet; **Unresolved compatibility** |
| Tailwind CSS / Tailwind Labs | 4.3.5 | https://tailwindcss.com/ | MIT | Styling compiler | Preserve notices; **Verified** |
| @tailwindcss/vite / Tailwind Labs | 4.3.5 | https://github.com/tailwindlabs/tailwindcss | MIT | Build integration | Preserve notices; **Verified** |
| Zustand / pmndrs contributors | 5.1.0 | https://zustand.docs.pmnd.rs/ | MIT | Browser state | Preserve notices; **Verified** |
| Radix UI / WorkOS and contributors | 1.8.1 | https://www.radix-ui.com/ | MIT | Accessible UI primitives | Individual @radix-ui packages also inventoried; **Verified** |
| Recharts / Recharts contributors | 3.10.1 | https://recharts.org/ | MIT | Elevation and timeline charts | Preserve notices incl. transitive chart packages; **Verified** |
| Lucide React / Lucide contributors; Feather legacy icons by Cole Bemis | 1.73.0 | https://lucide.dev/ | ISC plus MIT for the legacy Feather icons listed in LICENSE | Interface icons | Preserve **both** notices; **Verified** |
| Instrument Sans / Instrument Sans Project Authors | @fontsource-variable/instrument-sans 5.3.0 | https://github.com/Instrument/instrument-sans | OFL-1.1 | Variable UI font | Copyright 2022 project authors; retain OFL; **Verified** |
| IBM Plex Mono / IBM | @fontsource/ibm-plex-mono 5.3.0 | https://github.com/IBM/plex | OFL-1.1 | Monospaced UI font | Copyright 2017 IBM Corp.; retain OFL; **Verified** |
| Fontsource / Fontsource contributors | Packages above | https://fontsource.org/ | Font OFL texts shipped in packages | Self-hosted font distribution | Preserve upstream font rights; no Google Fonts runtime service inferred; **Verified** |
| class-variance-authority / package contributors | 0.7.1 | https://cva.style/ | Apache-2.0 | Component class variants | Preserve license; **Verified** |
| clsx / Luke Edwards | 2.1.1 | https://github.com/lukeed/clsx | MIT | Class composition | Preserve notices; **Verified** |
| tailwind-merge / project contributors | 3.7.0 | https://github.com/dcastil/tailwind-merge | MIT | Class conflict resolution | Preserve notices; **Verified** |
| Vitest / Vitest contributors | 5.1.0 | https://vitest.dev/ | MIT (bundled notices) | App and engine tests | Development only; preserve included notices; **Verified** |
| Playwright / Microsoft | @playwright/test 1.65.1 | https://playwright.dev/ | Apache-2.0, NOTICE present | Browser regression/capture | Development/production tooling, not deployed runtime; **Verified** |
| Testing Library / contributors | jest-dom 7.0.1; react 16.3.3; user-event 14.6.10 | https://testing-library.com/ | MIT | UI tests | Preserve notices; **Verified** |
| ESLint / contributors | eslint 10.15.0; @eslint/js 10.0.1 | https://eslint.org/ | MIT | Source checking | Development only; **Verified** |
| ESLint React plugins / contributors | hooks 7.1.1; refresh 0.5.7 | https://github.com/facebook/react ; https://github.com/ArnaudBarre/eslint-plugin-react-refresh | MIT | Hook/refresh lint rules | Preserve notices; **Verified** |
| typescript-eslint / contributors | 8.72.2 | https://typescript-eslint.io/ | MIT | TypeScript linting | Preserve notices; **Verified** |
| globals / Sindre Sorhus and contributors | 17.14.0 | https://github.com/sindresorhus/globals | MIT | Lint environments | Preserve notices; **Verified** |
| jsdom / jsdom contributors | 29.1.1 | https://github.com/jsdom/jsdom | MIT | Test DOM | Preserve notices; **Verified** |
| DefinitelyTyped type packages / contributors | @types/leaflet 1.9.22; node 26.6.6; react 19.3.0; react-dom 19.3.0; three 0.187.0 | https://github.com/DefinitelyTyped/DefinitelyTyped | MIT | Build-time types | Individual copyright texts collected; **Verified** |
| Agentation / Agentation contributors | 3.1.2 | https://www.agentation.com/ | **PolyForm-Shield-1.0.0**, not MIT | Development-only visual feedback | Preserve license, review its restrictions; production excluded per release evidence. License **Verified**, all permitted-use conditions **Unresolved** |
| agentation-mcp / Agentation | Unpinned README `npx` command | https://www.agentation.com/ | Exact invoked distribution not verified | Optional local Claude annotation bridge | Do not infer its license from agentation; **Unresolved** exact version/terms |
| @ausnox/scientific-engine / Ausnox contributors | 0.1.0 | https://github.com/Rikitu03/ausnox/tree/main/packages/scientific-engine | MIT after owner authorization | Local first-party dependency | Project license; **Not applicable** as an external resource |

The root inventory records **432** external lock entries, **378** with collected top-level license/notice texts, **44** not installed on this platform and **zero** missing license declarations. Ten matching installed entries lack a collected top-level text; the runtime entry among them is `react-remove-scroll-bar` **2.3.8**, with an MIT declaration but no collected notice text. Inspect those inventory entries before certifying full redistribution. The existence of a declared license does not establish OSI approval. In particular, React Leaflet and Agentation must not be described as permissively open source. This audit makes no blanket OSI-compliance or license-compatibility claim.

## Python/geospatial pipeline and production tools

The original source-present Python environment was not reinstalled for a documentation audit. Pinning proves the recorded version, not the contents/licenses of every wheel. Upstream license policies and the unresolved exact wheel/bundled notices are distinguished below; no Python executable or wheel is shipped in the web app.

| Name | Provider / version | Official source | License / applicable terms | Usage / attribution | Status |
| --- | --- | --- | --- | --- | --- |
| Python | Python Software Foundation; 3.12.10 recorded | https://docs.python.org/3.12/license.html | PSF license and included historical notices | Offline pipeline; retain distribution notices if redistributing interpreter | Upstream terms; exact environment **Unresolved** |
| NumPy | NumPy contributors; 2.5.4 | https://numpy.org/doc/stable/license.html | BSD-3-Clause upstream; binary builds can include other licenses | Array aggregation/slope; retain relevant license texts | Upstream policy verified; exact wheel/bundled libraries **Unresolved** |
| Rasterio | Rasterio contributors; 1.5.2 | https://github.com/rasterio/rasterio/blob/main/pyproject.toml | BSD-3-Clause upstream | GeoTIFF windows/coverage | Upstream metadata verified; exact wheel notices **Unresolved** |
| pyproj | pyproj contributors; 3.8.0 | https://pyproj4.github.io/pyproj/stable/ | Exact pinned distribution license not inspected | Independent coordinate validation | **Unresolved**; preserve pyproj and PROJ notices before redistribution |
| GDAL | OSGeo and contributors; 3.12.2 recorded | https://gdal.org/en/stable/license.html | GDAL license and embedded component notices; exact bundled set not inspected | Rasterio wheel dependency, not separate browser runtime | **Unresolved** exact wheel/component terms |
| PROJ | OSGeo and contributors; 9.8.1 recorded | https://proj.org/en/stable/about.html | Exact bundled version's license/database notices not inspected | Planetary transforms via pyproj/Rasterio | **Unresolved** bundled notices |
| certifi | certifi contributors; 2026.10.23 | https://github.com/certifi/python-certifi | Exact pinned license/bundle notices not inspected | HTTPS trust store for downloads | **Unresolved** exact distribution; not a NASA dataset |
| pytest | pytest contributors; 9.2.0 | https://docs.pytest.org/ | Exact pinned distribution not inspected | Pipeline tests | **Unresolved** exact license record |
| Node.js / npm | OpenJS contributors / npm contributors; release records Node 24.13.0, npm 11.6.2 | https://nodejs.org/en/about/previous-releases ; https://github.com/npm/cli | Runtime/tool distribution licenses include bundled dependencies; exact distribution not inventoried | Install/build/test tools | **Unresolved** distribution notices; not deployed as a service |
| Chromium | Chromium contributors; Playwright browser build not pinned in package.json | https://www.chromium.org/chromium-projects/ | Chromium and embedded third-party terms; exact binary not inventoried | Browser verification and film capture | **Unresolved** exact browser notices |
| FFmpeg | FFmpeg contributors; 9.0 release tool | https://ffmpeg.org/legal.html | Build/configuration dependent; do not assume LGPL for the libx264-enabled executable | Encodes real recording and separate film; executable not redistributed here | **Unresolved** exact build license/patent terms; outputs are not automatically GPL software |

## Scientific data and algorithms

| Resource / provider | Version / exact source | Rights and acknowledgment | Ausnox use / status |
| --- | --- | --- | --- |
| USGS Astrogeology HiRISE DTM, NASA/JPL-Caltech/University of Arizona (MRO HiRISE source) | Fergason, R. L., Galuszka, D. M., Hare, T. M., Mayer, D. P., Redding, B. L., Smith, E. D. (2020), *High-Resolution Imaging Science Experiment Digital Terrain Model Mosaic for Mars 2020 Terrain Relative Navigation*, https://doi.org/10.5066/P9REJ9JN | FGDC access/use constraints “None” recorded in source inspection and manifest; cite all listed authors and USGS. Do not substitute 2025 MSR release DOI | Observed-source DTM → cropped/aggregated 2 m grid and Horn slope; **Verified** recorded provenance/constraints |
| NASA/JPL Mars Trek HiRISE | `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd`; https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/WMTSCapabilities.xml | Credit NASA/JPL-Caltech/University of Arizona/USGS; retain applicable per-product notices; API access alone is not a blanket license | Actual 25 cm Jezero imagery; IDs/credits **Verified**, complete product redistribution terms **Unresolved** |
| NASA/JPL Mars Trek CTX | `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0`; https://trek.nasa.gov/tiles/Mars/EQ/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0/1.0.0/WMTSCapabilities.xml | Credit NASA/JPL-Caltech/MSSS/USGS; MRO Context Camera, not HiRISE | Actual 6 m context imagery; IDs/credits **Verified**, full terms **Unresolved** |
| NASA/JPL Mars Trek MOLA | `Mars_MGS_MOLA_ClrShade_merge_global_463m`; https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/WMTSCapabilities.xml | Credit NASA/GSFC/MOLA Science Team/USGS; Mars Global Surveyor laser altimeter | Actual regional context, not the routing DEM; IDs/credits **Verified**, full terms **Unresolved** |
| NASA/JPL-Caltech MMGIS Perseverance localized waypoints | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json ; pinned RMC 32_1184 and 26_1004 | Credit NASA/JPL-Caltech, Mars 2020; preserve source/version caveats | Two rover-position science targets, not exact tube/rock coordinates; **Verified** provenance; complete reuse conditions **Unresolved** |
| NASA Perseverance raw-image metadata | https://mars.nasa.gov/mars2020/multimedia/raw-images/ ; sols 490 and 690 | Credit NASA/JPL-Caltech and specific instrument credits if redistributing an image | Target sol identification and rover-clock validation; no raw-image file shipped; **Verified** recorded use |
| NASA GISS Mars24 / Allison & McEwen (2000), Allison (1997) | https://www.giss.nasa.gov/tools/mars24/help/algorithm.html | Cite equations/algorithm and authors; no claim of redistributing the Mars24 Java application | Mars time and geometric daylight implementation; **Verified** published reference and tests |
| Horn (1981) | https://doi.org/10.1109/PROC.1981.11918 | Cite *Hill shading and the reflectance map*, B. K. P. Horn | Implemented slope method; no paper redistribution; **Verified** method citation |
| USGS CTX DTM and HiRISE orthomosaic validation inputs | Exact URLs/hashes in [pipeline record](DATA_PIPELINE.md) | Preserve USGS/source-mission credit and product-specific conditions | Validation only, not shipped DTM inputs; **Verified** role; do not list as extra deployed terrain |

Source/processed checksums, acquisition details, CRS, source 1 m resolution, processed 2 m spacing, fail-closed nodata rules and transformation history remain in the [unchanged manifest](../public/data/jezero/manifest.json), [pipeline record](DATA_PIPELINE.md) and [source inspection](../scientific-pipeline/evidence/source_inspection.json). NASA's [media usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) and [JPL image policy](https://www.jpl.nasa.gov/jpl-image-use-policy/) are relevant general policies; they do not erase third-party credits or prove every Mars Trek layer's rights. No blanket claim that all NASA-hosted content is public domain is made.

## Services, design, AI and media

| Name | Provider / version | Official source / terms | Usage / required acknowledgment | Status |
| --- | --- | --- | --- | --- |
| Vercel | Vercel, managed service (no project version) | https://vercel.com/legal/terms | Static hosting at https://ausnox.vercel.app/ ; service terms apply | Hosting **Verified**; account eligibility/contract not audited |
| GitHub | GitHub, managed service | https://docs.github.com/en/site-policy/github-terms/github-terms-of-service | Source, history and PR hosting | **Verified** use; no open-source license inferred from public hosting |
| Figma MARS reference and approximate redrawn Ausnox mark | External author/owner not established | https://www.figma.com/design/EejtJslZYEA3RTeYntsURR/MARS?node-id=0-1 | Composition and mark reference documented in frontend handoff §13 and `src/components/layout/primitives.tsx`; no exported assets recorded | **Unresolved** ownership/permission; user-supplied does not prove sublicensing rights |
| OpenAI GPT models / Codex | OpenAI; exact GPT versions unknown | https://openai.com/policies/ ; https://openai.com/codex/ | Development/writing/testing as in [AI_USAGE](AI_USAGE.md); publicly disclose assistance | Use **Verified/owner-declared**; exact account terms/output originality not certified |
| Claude Code | Anthropic; commit trailers record model labels | https://code.claude.com/docs/en/overview ; https://www.anthropic.com/legal | Programming, UI, integration, diagnostics, docs, film automation | Recorded use **Verified**; exact account terms/output rights not certified |
| ElevenLabs narration and Scribe | ElevenLabs; local producer records `eleven_v4` voice Robert Cummer – Studio Narrator and `eleven_scribe_v1` transcript | https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform ; https://elevenlabs.io/terms-of-use | Separate local 25 s film has synthetic narration; disclose in text, metadata and upload. Free-plan publishing guidance requires `elevenlabs.io` or `11.ai` in title and prohibits commercial use | Provider **Verified** in MP4 metadata; exact voice/account permissions and competition/publication grants **Unresolved** |
| Programmed film score/SFX | Producer's local `film/scripts/sound.mjs`; no third-party samples recorded | [Production disclosure](../film/production-disclosure.md) | Claude-assisted deterministic synthesis, not a generative music service. Credit method and preserve any third-party algorithm obligations if applicable | Method **Documented**; producer originality/complete provenance **Unresolved** |
| Real application footage / motion composite | Separate local production scripts; Playwright/Chromium/FFmpeg | [Production disclosure](../film/production-disclosure.md) | SI-assisted compositing, visible SI watermark; NASA/USGS source credits, simulated assumptions | Local candidate **Verified** by probe/sample; upload and full rights **Unresolved** |
| Third-party stock images/music/video/audio | None identified in audited main; no stock asset recorded by short-film producer | Not applicable | Do not invent stock-provider or music credits | **Not applicable** to identified assets; not a certification of unseen production material |

## Required rights follow-up

1. Review React Leaflet's Hippocratic-2.1 and Agentation's PolyForm Shield conditions against actual usage and competition reuse grants. Do not label the full dependency graph OSI-approved or relicense these components as MIT.
2. Resolve ownership/permission for the Figma composition and redrawn logo; record permission if the final submission relies on them.
3. Confirm exact ElevenLabs account/voice rights at generation time and whether they permit the event's required publication/reuse. A later paid subscription must not be assumed to retroactively license free-plan audio. Include title attribution under the recorded free plan.
4. Complete missing distribution/embedded-license records if redistributing Python, browser or production-tool binaries; none is added to this web deployment. Review absent npm texts/platform distributions before declaring all redistribution obligations complete.
5. Retain layer-specific NASA/JPL/USGS and font/software credits in the site and uploaded video. The project license is **not** a blanket third-party clearance.
