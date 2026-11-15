# AI-assisted development and scientific transparency

Disclosure version 1.0.0. Audit baseline: `7c1d559a8039e50a96b652eab58ecc2c637c71e4` on `origin/main`, fetched on 2026-11-15. This document also records a separately inspected local film candidate; it does not imply that candidate is committed or published.

## A. Overview

Generative AI assisted Ausnox's planning, programming, interface work, documentation and verification workflows. There is no AI model required in the deployed application's scientific calculation path. The project owner's task statement confirms OpenAI GPT models, OpenAI Codex and Anthropic Claude Code. Repository records corroborate Codex and Claude contributions, but do not provide a complete prompt history or trustworthy file-by-file authorship ledger. This disclosure is itself prepared with OpenAI Codex assistance.

Evidence labels below mean **verified record** (a specific repository or inspected artifact records the contribution), **documented assistance** (owner or project documentation supports a category, but exact files/tool attribution is incomplete), and **unknown** (insufficient evidence). A co-author trailer is evidence of recorded involvement, not proof that all lines in a commit were generated.

## B. Tools used

| Provider / tool | Purpose | Evidence and confidence |
| --- | --- | --- |
| OpenAI / GPT models | Planning, technical discussion, development and writing assistance | **Documented assistance:** owner's development history supplied for this audit; exact model names, sessions and per-file contributions unknown |
| OpenAI / Codex | 3D implementation, interface/release verification and documentation; this compliance work | **Verified record:** [3D handoff](3D_TERRAIN_HANDOFF.md), [release report](RELEASE_REPORT.md); current compliance changes |
| Anthropic / Claude Code | Frontend implementation/refinement, integration, diagnostics, development tooling | **Verified record:** frontend commit `c26464a` records Claude Fable; `a1f7315`, `1472100`, `f2bd3c8`, `188e2c3`, `cd35b3e` record Claude Opus; `4c5336e` records Claude Sonnet and Agentation integration. The owner identifies the tool as Claude Code. These trailer names are recorded labels, not independently authenticated model versions |
| ElevenLabs / text-to-speech | Synthetic English narration in the separate 25-second film | **Verified artifact/production record:** local film audio exists; its stream and container metadata identify ElevenLabs. Local production disclosure records the provider, voice and generation method; account rights remain unresolved |
| ElevenLabs / Scribe | Transcript comparison in separate film production | **Documented assistance:** separate local production disclosure records Scribe comparison; not independently repeated in this compliance audit |

No additional AI provider is established by this audit. References to Fable in specifications are not evidence of a separate provider beyond the Anthropic trailer above. Figma, Agentation, Playwright and FFmpeg are design/development/production tools; their use alone does not establish model-generated images or audio.

## C. Component-by-component usage

| Component | Supported contribution | Evidence / limits |
| --- | --- | --- |
| Architecture and planning | AI-assisted technical design and specification writing | **Documented assistance:** owner statement, [agent guidelines](AGENT_GUIDELINES.md), [architecture](ARCHITECTURE.md). No exact prompt or per-section attribution |
| React frontend | AI-assisted implementation, state/contracts, interface behavior | **Verified record:** `c26464a`, `a1f7315`; [frontend handoff](FRONTEND_HANDOFF.md), [integration report](INTEGRATION_REPORT.md) |
| UI/UX | AI-assisted implementation, critique and refinements | **Verified record:** [release report](RELEASE_REPORT.md), [3D handoff](3D_TERRAIN_HANDOFF.md); Figma composition and redrawn logo reference documented in frontend handoff §13. Rights to that reference remain a separate question |
| Scientific engine | AI assistance with implementation/testing is declared at project level | **Documented assistance:** owner statement, engine handoff and implementation history (`79bc4f0`). No reliable assignment of every calculation or test to a named model |
| Terrain processing | AI assistance with scripts and validation, including registration diagnostics | **Verified record:** `f2bd3c8`, `188e2c3`, `cd35b3e`; [pipeline](DATA_PIPELINE.md). Original DTM and waypoints are agency observations |
| 3D visualization | AI-assisted Three.js implementation on existing terrain | **Verified record:** explicit Codex credit in [3D handoff](3D_TERRAIN_HANDOFF.md) |
| Integration/debugging | AI-assisted real adapters, worker connection, errors and scientific mappings | **Verified record:** `a1f7315`, `8101c05`, `1472100`; integration report |
| Documentation/handoffs | AI-assisted technical writing and evidence reporting | **Verified record:** `c26464a`, `1472100`, release report; this audit |
| Tests and automation | AI-assisted test creation, debugging and release automation | **Verified record:** diagnostics commits and release report, including regression-before and verified browser logs |
| Extended walkthrough | Real app recording and captions; SI-assisted recording/encoding automation | **Verified record:** release report and original recording metadata. No audio stream; no evidence of generated terrain, stock music or synthetic narration |
| Separate short film | Claude-assisted capture/compositor/sound scripts, synthetic ElevenLabs voice, programmed motion graphics and score | **Verified local artifact + documented production history:** [film compliance record](../film/production-disclosure.md). No independent text-to-image or text-to-video source is recorded. Full production authorship and music originality are producer statements, not certified findings |

## D. Scientific data integrity

The following categories describe different things:

| Category | Ausnox content |
| --- | --- |
| Observed source | NASA/USGS HiRISE source observations and DTM product; Mars Trek mission imagery; Perseverance localized rover positions |
| Derived | Cropped/block-mean 2 m terrain grid, Horn slope, rendered relief, A* routes, geometric daylight, computed timing/margins |
| Simulated | Hypothetical habitat, EVA speeds/limits/reserves/activity durations and mission playback. Outcomes depend on these assumptions |
| SI-assisted implementation | Code and processing/verification workflows written with AI assistance. This is an authorship attribute, not a scientific observation category |

The shipped grid is itself a **derived** asset from an authentic observed-source USGS DTM, not raw instrument telemetry. No evidence indicates generative terrain replaced the observations. Explicit mock mode and synthetic unit-test fixtures exist and are illustrative/test-only; production real mode does not silently substitute them. Deterministic fixture generation is not proof of generative-AI scientific data creation.

The exact product is Fergason et al. (2020), *High-Resolution Imaging Science Experiment Digital Terrain Model Mosaic for Mars 2020 Terrain Relative Navigation*, DOI [10.5066/P9REJ9JN](https://doi.org/10.5066/P9REJ9JN). It is **not** the 2025 Mars Sample Return release. The [unchanged manifest](../public/data/jezero/manifest.json) records source SHA-256, acquisition/retrieval details, Mars CRS, aggregation, nodata rules, software versions, output hashes, attribution and redistribution notes. [Data sources](DATA_SOURCES.md) §9 distinguishes actual integration from candidate datasets. THEMIS, MEDA, CRISM and RAD are not integrated.

## E. Validation and unresolved findings

Historical evidence is inspectable in the [scientific report](SCIENTIFIC_VALIDATION_REPORT.md), [integration report](INTEGRATION_REPORT.md), [release report](RELEASE_REPORT.md), [pipeline evidence](../scientific-pipeline/evidence/) and [engine evidence](../packages/scientific-engine/evidence/). The release records 99 frontend/integration tests, 88 engine tests, five browser tests and public deployment checks. Integration records 52 Python tests passing with five skipped when the original DTM was absent; earlier source-present checks are separate evidence. This audit's actual reruns are recorded in [the compliance report](NASA_COMPLIANCE_REPORT.md), independently of historical counts.

**X2b remains FAIL and unresolved:** apparent imagery-to-DTM displacement is approximately 3 m (original diagnostics 2.3–3.2 m east). Windowed results were VARIABLE and multi-illumination results INCONCLUSIVE. No correction or relaxed tolerance is claimed. Mars24 gate tolerances pass in the scientific report, while five strict published-value comparisons remain discrepant; the report retains those findings. Rover-clock absolute reference longitude remains unverified. Tests do not establish independent NASA certification.

## F. Media generation

At the audited main commit, `public/demo/ausnox-mvp.mp4` is a 90.360-second captioned recording, with one H.264 video stream and no audio. It is an extended walkthrough, **not** an eligible ≤30-second submission demonstration. Its automation was AI-assisted; the recorded application values are not generated observations. Visible SI-watermark compliance of that unchanged historical recording is not certified here.

A separate original working tree contains `film/ausnox-showcase-25s.mp4`, inspected read-only during this audit. FFprobe finds 25.000 seconds for container, video and audio; 1920×1080, 30 fps, 750 video frames, H.264/AAC. Sampled frames show a visible “SI-GENERATED VIDEO COMPOSITE” / ElevenLabs watermark and English captions. Container and audio metadata acknowledge synthetic narration. The producer records real app captures, Claude-assisted deterministic compositing/score scripts and ElevenLabs narration. No generated Mars imagery, third-party stock music or sampled audio is recorded. This does not certify every frame, spoken word or rights claim. See [media evidence](evidence/compliance/local-film.json) and [production disclosure](../film/production-disclosure.md).

The owner confirms the candidate is **not yet uploaded to YouTube**. Public access, uploaded captions/description and platform transformations cannot be verified before upload. This branch publishes disclosure documents, not the separate 64 MB film or its production tooling. No final public demonstration URL is claimed.

The supplied 2026 form requires visible SI watermarks for generated images/video, descriptive text and metadata acknowledgment for generated audio/code/data, and prohibits SI-generated content using, containing or modifying NASA branding/design elements (including logos, flags and mission identifiers). Factual data/mission credits must not imply endorsement. Sampled film frames show no NASA insignia; a full branding review remains required before submission.

## G. Human involvement

The owner supplied the brief, named the AI tools, authorized MIT for original project code during this audit and confirmed the short film is not uploaded. Frontend records describe a user-supplied Figma reference; production records describe team direction. These facts do not establish human review of every generated line, dataset, frame or narration cue. Historical automated/browser checks are evidence of executed checks, not proof of independent scientific peer review. Rights-holder assent, final listening/viewing, term acceptance and submission remain human actions.

## H. Limitations

AI assistance is not evidence of accuracy, originality, certification or operational safety. The 2.43 km² Jezero footprint and 2 m grid do not resolve all rocks, footing or regolith hazards. Geometric daylight excludes terrain shadows, dust and weather; no radiation, communications or life-support model is provided. Illustrative mission assumptions are not NASA operational limits. No flight qualification or NASA endorsement is claimed. External rights and account terms remain separate from the project's MIT license.

## I. References

- [Machine-readable disclosure](SI_DISCLOSURE.json); [third-party resources/rights](THIRD_PARTY_NOTICES.md); [submission preparation](NASA_SUBMISSION_COPY.md); [audit status](NASA_COMPLIANCE_REPORT.md).
- [Terrain manifest](../public/data/jezero/manifest.json); [data pipeline](DATA_PIPELINE.md); [scientific models](SCIENTIFIC_MODELS.md); [scientific validation](SCIENTIFIC_VALIDATION_REPORT.md).
- [NASA Mars Trek WMTS](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars); [Mars24 algorithm](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html); [Perseverance waypoints](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json).
- Commit evidence is publicly inspectable at `https://github.com/Rikitu03/ausnox/commit/<commit-id>` using the IDs above; model trailers are retained as historical evidence only.
