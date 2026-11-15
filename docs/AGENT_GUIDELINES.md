# AUSNOX — INSTRUCTIONS FOR AI CODING/DESIGN AGENTS
Version: 1.0 | Guidance for Claude, Codex, Fable or other agents (specifications live in `docs/`; README.md stays in the repository root)

## 1. Read order and authority

Read ../README.md (repository root) → MASTERPLAN.md → PRD.md → DATA_SOURCES.md → SCIENTIFIC_MODELS.md → ARCHITECTURE.md → UI_UX_SPEC.md → IMPLEMENTATION_PLAN.md → TESTING_AND_VALIDATION.md before coding. Follow the user's approved constraints. If files conflict: correctness, provenance, safety/unknown handling, actual source evidence and P0 gates outweigh cosmetic convenience. Ask for a product-policy decision only when absolutely unavoidable; otherwise choose the documented defaults and record why.

This repo contains **documentation only at time of creation**. Do not claim code, data, tests, deployment or Figma inspection already exist.

## 2. Non-negotiable scientific constraints

- **DO NOT fabricate measurements**: no generated Jezero elevations, fake hazards, invented NASA coordinates, random weather, fake mineral markers, unverified telemetry or hardcoded precomputed demo routes posing as scientific results.
- **DO NOT silently replace real data** with synthetic runtime terrain on API failure. Synthetic grids are permitted ONLY for isolated, labeled unit tests, never marketed as Mars observations.
- **DO NOT project Earth assumptions onto Mars**: verify planetary CRS, map tile matrices, geodetic/planetocentric coordinates, longitude convention, vertical reference, units and source resolution.
- Source images do not themselves yield numeric slopes. A DEM must exist and pass validation.
- Never infer walkable boulder-free ground, loose regolith, radiation exposure or dust-storm probabilities without supporting instruments/methods.
- Do not use MEDA as a particle-radiation instrument or pretend Curiosity RAD at Gale measures Jezero.
- Astronomy produces **modeled geometric daylight**, not real terrain shadow or environmental forecast.
- Simulated EVA speed, thresholds and reserves must be clearly adjustable, documented and visibly **not NASA-approved operational limits**.
- If critical information is missing, produce **indeterminate** or a specific blocking error, never a favorable guess.

## 3. Engineering and scope

1. Prove source data before building dependent routing UI (G1 is hard gate).
2. Build only smallest coherent P0; 3D and historical layers after verified MVP.
3. No auth, paid API, cloud account, production FastAPI, database or AI model required for P0.
4. Keep deterministic logic pure and type-safe; separate visualization, science data and simulated assumptions.
5. Test positive, negative, unknown, no-path, stale request and data-coverage cases.
6. Never delete or overwrite the root README.md or the Markdown plan in `docs/` during Vite scaffolding.
7. No destructive data fetch or bulk binary commit; use reproducible pipeline, small output, versioned manifest and source hash.
8. No secret keys in client JS; no inflated claims or hidden retries masking errors.
9. Before any code push, inspect branch rules/user instruction; documentation push to main has explicit approval, not blanket authorization to bypass testing for future code.
10. When external provider fails, capture exact blocker, choose an approved fallback and label it; never announce success without live evidence.

## 4. Figma/Fable relationship

Figma draft URL: https://www.figma.com/design/EejtJslZYEA3RTeYntsURR/MARS?node-id=0-1 . User explicitly allows Fable to redesign based on functional and accessibility requirements. The design could not be read by the connected Figma integration during documentation authoring; don't invent its layouts or tokens. If access becomes available, inspect and cite actual components; otherwise work from UI_UX_SPEC.md.

Prioritize understandable warnings, sources, measured/simulated distinction, responsive desktop/tablet behavior and the full mission workflow over faithful pixel matching.

## 5. Definition of a "done" task

A task is done only when:
- production code/artifact exists and is referenced by path;
- relevant commands were executed with recorded observable output;
- scientific origin and accuracy were validated when applicable;
- abnormal and missing-data paths were tested;
- end-user labels disclose limitations and provenance;
- documentation and test/evidence ledger updated.

Use **PASS / FAIL / BLOCKED / NOT RUN**. Don't upgrade "not run" to "pass" based on static inspection or a generated screenshot.

## 6. Output/handoff format

~~~text
Phase and purpose:
Files added/modified:
Data source URLs, product IDs, checksum and licenses:
Observed commands, output and tests:
What works end-to-end:
Unknowns / failures / what is simulated:
Next exact action:
~~~

Do not spend remaining hackathon time implementing optional 3D if any real-data/route/solar/eligibility/deployment gate is open. Do not refactor unrelated code or introduce tools without justifying a required capability.

## 7. Policy and public descriptions

Use "NASA Space Apps 2026 project" and acknowledge source missions; never imply NASA endorsement or flight readiness. Cite all third-party media/tools, including AI-assisted coding or design as required by event guidance. Use honest final README statuses.
