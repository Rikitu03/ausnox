# NASA Space Apps 2026 compliance audit

**Overall: PARTIAL — repository disclosures are prepared; the competition submission is not verified complete or submitted.** Audit date: 2026-11-15, Philippine time. Owner-supplied deadline: November 15, 2026, 11:59 PM Philippine time. This is an evidence-based documentation/metadata audit, not legal clearance or NASA certification.

## Repository and authority

`git fetch origin main` returned latest `origin/main` **`7c1d559a8039e50a96b652eab58ecc2c637c71e4`**, matching the previously supplied commit. The original checkout was on `feat/immersive-map-workspace`, with uncommitted source/screenshots, an empty untracked `docs/AI_USAGE.md` and separate untracked `film/` production work. No active merge was found. To preserve those files, the requested branch **`chore/nasa-space-apps-compliance`** was created from fetched `origin/main` in `.compliance-worktree/`. Only this branch is modified by the audit. No history rewrite, forced push or automatic merge is authorized or performed.

The audited main tree had **no root LICENSE, NOTICE, AI_USAGE.md or third-party register**. Existing Credits acknowledged Codex; README/release reports also recorded partial source/tool credits. The owner subsequently **authorized MIT for original project code**, now implemented in LICENSE and root/engine package metadata, with third-party scope exclusions in NOTICE/README. This is an explicit owner decision, not an auditor-selected license. No individual author identity or generation percentage is invented.

Requirements are taken from the owner's authoritative printed **2026 form transcription**: the nine fields in [submission copy](NASA_SUBMISSION_COPY.md), ≤30-second video or ≤7 slides including title, SI watermark/text/metadata/branding rules and the two final confirmations. The [guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [legal page](https://www.spaceappschallenge.org/legal/) and [challenge](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/) were attempted through web and HTTP tools but full current pages were not retrievable (502/timeout/network failure). Indexed official legal text supports openness and third-party-rights obligations; it does not establish full current terms. [Official organizer response](https://github.com/nasa/spaceapps/discussions/1916) records the November 15, 2026 local-time deadline and Team Owner Local Event timezone rule. No older form fields or inferred default license are applied. Final term review and timezone confirmation remain human actions.

## Requirement audit

Status meanings: **PASS** verified complete for the stated scope; **PARTIAL** present but incomplete; **FAIL** verified noncompliance; **UNKNOWN** insufficient evidence; **NOT APPLICABLE** requirement does not apply. A scoped PASS must not be read as overall submission approval.

| Item | Status | Evidence | Required action |
| --- | --- | --- | --- |
| AI tools disclosed | **PASS** (repository) | [AI_USAGE](AI_USAGE.md), README, [SI JSON](SI_DISCLOSURE.json); GPT owner declaration; Codex handoffs; Claude commit trailers; separate film ElevenLabs record | Match actual SI dropdown; integrate/deploy website text |
| AI coding contributions documented | **PASS** (project-level) | Component matrix distinguishes recorded, owner-declared and unknown attribution | Do not invent per-file authorship or manual review |
| AI-generated code/data metadata | **PASS** (repository sidecar) | Validated SI_DISCLOSURE.json describes source/workflow assistance and scientific categories; machine-readable link in Credits | Keep metadata with submitted source; update for later media changes |
| SI-generated visual/video watermark | **PARTIAL** | Separate candidate producer contact sheet shows watermark on 14 samples; compositor records continuous overlay; old walkthrough not certified | View whole final uploaded artifact, legibility/continuity and platform processing |
| AI-generated audio disclosures | **PARTIAL** | Candidate container comment/description and audio name identify ElevenLabs; prepared upload copy | Publish disclosure/title credit and confirm account/voice permissions |
| Scientific source attribution | **PASS** (documented provenance) | Correct 2020 DOI, exact products/credits, manifest, DATA_PIPELINE, source inspection; candidate vs integrated sources distinguished | Retain layer-specific credits; complete unresolved rights checks below |
| Scientific data integrity and scope | **PASS** (unchanged) | Protected hashes and source diff in [documentation checks](evidence/compliance/documentation-checks.json) | No terrain/model changes needed |
| X2b registration | **FAIL** (preserved) | Manifest cross-validation FAIL; 2.3–3.2 m apparent offset, VARIABLE/INCONCLUSIVE follow-ups | Keep approximately 3 m caveat; do not claim resolved alignment or operational safety |
| Third-party resource/license documentation | **PARTIAL** | Full root/engine lock inventories, collected texts, direct dependency/data/tool tables, runtime notice asset | Resolve missing texts, exact Python/tool distribution terms and compatibility; no blanket clearance |
| Restricted dependencies | **PARTIAL** | React Leaflet/@react-leaflet/core Hippocratic-2.1; Agentation PolyForm-Shield-1.0.0, exact texts retained | Review permitted use and competition reuse; do not call these MIT or certify full OSI graph |
| Project-level license decision | **PASS** (original code only) | Owner expressly authorized MIT; LICENSE, NOTICE and package/lock metadata | Retain external rights/terms; confirm necessary contributor rights for final originality affirmation |
| Figma/reference/logo rights | **UNKNOWN** | Frontend handoff §13; mark comment says redrawn from external Figma reference | Establish ownership/permission; public/user-supplied reference alone is insufficient |
| Existing walkthrough video duration | **FAIL** (submission use) | Actual FFprobe: 90.360 s video/container, 1600×900, H.264, 25 fps, no audio | Retain as extended walkthrough; do not use Field 3 |
| Short-film candidate duration | **PASS** (local bytes only) | [Probe](evidence/compliance/short-film-probe.json): video/audio/container 25.000 s; 750 frames, 30 fps | Re-probe if replaced; local duration does not verify upload |
| Final video public accessibility | **UNKNOWN** | Owner confirms no YouTube upload; no public candidate URL | Upload eligible final artifact and verify private-window access; Field 3 remains PENDING |
| Final video English captions | **PARTIAL** | English burned captions in sampled frames; original production has SRT, producer-recorded transcript comparison | Listen/view whole export; upload/check matching caption track and timing |
| Final video scientific values/content | **PARTIAL** | Sampled app panels and producer scenario values; no independent full-film recomputation | Confirm all claims/values against app and final export; preserve simulated labels |
| SI NASA branding/design restriction | **PARTIAL** | No NASA insignia identified in sampled frames; factual mission/source names present | Review full final artifact, generated material and mission identifiers under the exact form rule |
| Narration/music/third-party media rights | **UNKNOWN** | Local producer records ElevenLabs free plan and programmed score; no stock media identified | Confirm generation-time account/library voice rights, competition/publication grants, title credit and score provenance |
| Public project accessibility | **PASS** (HTTP) | Unauthenticated app GET returned 200 and HTML; prior public browser workflows in release report | Check deployed disclosure links after integration; no new full production browser suite claimed |
| Extended walkthrough public access | **PASS** (HTTP) | Unauthenticated MP4 request returned 200 | Access does not cure its duration failure |
| Required NASA Data references | **PASS** (preparation) | Field 7 exact Link Text / Link URL table, NASA resources actually used | Paste/verify in form; current form contents unknown |
| Required Other Data references | **PASS** (preparation) | Field 8 and complete notices register; tools distinguished from observations | Include final media sources actually used; paste in form |
| Submission-field preparation | **PASS** (preparation only) | All nine fields in order; summary validated ≤1,500 characters, 50–200 words; demo placeholder explicit | Review/paste and fill verified public demonstration URL |
| Remaining human confirmations | **UNKNOWN** | Terms/originality instructions prepared, no checkboxes accepted | Owner reviews current terms/rights and truthfully confirms both |
| NASA SI dropdown selection | **UNKNOWN** | Category guide prepared; exact dropdown labels unavailable | Select actual options; do not select “I did not use SI” |
| Form saved / submitted / receipt | **UNKNOWN** | No live form actions or success receipt inspected | Save, verify, Submit for Judging, confirm notification before deadline |
| Runtime backend/infrastructure changes | **NOT APPLICABLE** | No backend/service/deployment introduced | None |

## Scientific source review

The numeric routing input is the USGS Mars 2020 TRN HiRISE product `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif`, DOI **10.5066/P9REJ9JN**, not the later 2025 MSR release. Exact acquisition/process/retrieval notes and source SHA-256 remain in the manifest. The 1 m source window is block-averaged to 800×800 cells at 2 m projected spacing. Mars 2000 sphere equirectangular coordinates (R=3,396,190 m, planetocentric latitude/east longitude) and fail-closed nodata/unknown slope rules are unchanged. Source SHA-256: `44c3819caa33922b06f7a8228534d1e32ab4087aca85144136d825c371c747d8`. Processed terrain SHA-256: `fcb96e32bc854fff23d56ee4301bea7a77a38e892afc24ada6d0ce5aea1b7f49`.

Mars Trek HiRISE/CTX/MOLA are the actual imagery/context layers. Exact capabilities URLs, instrument/provider credits and layer IDs are retained in [notices](THIRD_PARTY_NOTICES.md), DATA_SOURCES §9 and existing layer evidence. Mars24 is the specific timekeeping/geometric-daylight reference. MMGIS positions are cited rover localizations. CTX DTM/orthomosaic/RDR inputs support validation only. THEMIS, MEDA, CRISM and RAD remain unintegrated candidates.

The derived grid is not raw telemetry, calculated paths are not observations, and hypothetical EVA assumptions are not NASA operating standards. No source data, checksum, registration tolerance, A*, Mars24, mission feasibility or simulation behavior is changed. Scientific validation's five strict Mars24 published-value discrepancies and unknown rover-clock reference longitude remain recorded; gate-level tolerances are a different claim. X2b remains failed, with no shift applied. No flight qualification, independent scientific certification or NASA endorsement is asserted.

## Validation performed

See [documentation checks](evidence/compliance/documentation-checks.json) for required artifacts, relative links, summary count, valid JSON and protected hashes. [Check results](evidence/compliance/check-results.json) record each final technical command's exit status; neighboring logs retain its output. Installation used `npm ci --no-audit --no-fund` (383 packages, engine postinstall completed). A preliminary run before the Credits text change passed typecheck, lint, 99 frontend tests, 88 engine tests and build; final post-change results are recorded separately in that JSON and must govern the current-branch check claim.

Final checks after the Credits/metadata changes:

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | **PASS**, exit 0 | [typecheck.log](evidence/compliance/typecheck.log) |
| `npm run lint` | **PASS**, exit 0 | [lint.log](evidence/compliance/lint.log) |
| `npx vitest run --maxWorkers=1` | **PASS**, 99 tests / 7 files | [frontend-tests.log](evidence/compliance/frontend-tests.log) |
| `npm run test:engine` | **PASS**, 88 tests / 6 files | [engine-tests.log](evidence/compliance/engine-tests.log) |
| `npm run build` | **PASS**, exit 0; existing lazy 3D chunk-size advisory | [build.log](evidence/compliance/build.log) |
| Local relative links / JSON / summary / protected scope | **PASS**; summary 927 characters, 127 words | [documentation-checks.json](evidence/compliance/documentation-checks.json) |

Full browser and original-source Python/geospatial suites are intentionally **not rerun** for this documentation/text-only change; earlier evidence is cited without turning it into a new run. No new behavior-mirroring tests were added. A successful build does not establish legal or competition compliance.

The UI change is confined to Credits prose and disclosure/notice links in SourcesView. Public THIRD_PARTY_NOTICES.txt adds license text to the static deployment. Package/lock changes add license metadata only; dependency versions/integrities and scripts remain unchanged. LICENSE, NOTICE, README, dedicated disclosure/submission/media documents and audit evidence comprise the remaining scope. Existing 90-second media, terrain manifest/binary, engine/pipeline algorithms, maps, stores and simulation calculations are protected by comparison against origin/main.

## Blocking actions before submission

1. **Public eligible demo:** local candidate passes duration, but owner confirms it is not uploaded. Resolve final media rights/branding checks, upload with captions and disclosures, verify anonymous access, then replace Field 3's PENDING placeholder.
2. **Rights confirmation:** review ElevenLabs generation-time/free-plan and voice terms against the event's reuse grants; title attribution alone does not license commercial use. Resolve Figma/logo permission and restricted dependency conditions. MIT authorization does not solve those issues.
3. **Current terms and form:** owner reads current terms, confirms truthful originality/authority, matches the SI dropdown, pastes/reviews fields and checks timezone/deadline. The full legal page was not retrievable here.
4. **Integrate approved repository changes:** review PR and deploy to make revised public Credits/runtime notices live. This task does not auto-merge or redeploy production.
5. **Actual submission:** save, verify, click Submit for Judging and retain successful notification. Final form state and submission remain UNKNOWN until evidence exists.

The final [anonymous link checks](evidence/compliance/public-link-checks.json) returned **HTTP 200** for the app, extended walkthrough, exact USGS DOI, Mars Trek API and all three integrated layer capabilities, Mars24 algorithm and MMGIS waypoint URL. The three Space Apps guide/legal/challenge requests failed TLS trust validation (`SEC_E_UNTRUSTED_ROOT`); no TLS verification bypass was used, and these are not counted as successful current rule-page retrievals.

PR/commit identifiers are supplied in the task handoff after publication; they are not guessed here. The original dirty checkout and its separate production work remain untouched.
