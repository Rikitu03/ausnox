# AUSNOX — UI/UX SPECIFICATION AND FIGMA HANDOFF
Version: 1.0 | 2026-11-14 | Source design **not yet inspected**

## 1. Design authority

User-provided Figma reference: https://www.figma.com/design/EejtJslZYEA3RTeYntsURR/MARS?node-id=0-1

Fable is authorized to redesign freely for clarity, usability and responsive behavior. Preserve the **Ausnox dawn-to-night identity** and every critical flow. The connected Figma read reported insufficient edit access while creating these docs; **do not claim the reference has been audited**. If Fable can access it, inspect pages, components, tokens and imagery, cite reused assets, then adapt as necessary. No Figma modifications were made.

## 2. Experience principles

Primary persona is a **mission-control planner**, not a literal astronaut HUD. The interface should communicate real science, planning decisions and uncertainty with minimum distraction. Desktop-first at ~1280–1440px with a tablet layout at ~768–1024px. At narrower widths offer map/panels as tabs/sheets, not unreadable miniature dashboards.

Visual direction: graphite/dark neutral background, copper/amber Mars accents, a consistent contrast-safe route color distinct from danger status, modest movement, responsive typography, readable graphs. Avoid all-orange surfaces, decorative fake telemetry, and dense sci-fi ornamentation. Reduced-motion users must see no critical information only through animations.

## 3. Required screens / states

**Main workspace** (single route suffices):
- Top bar: Ausnox, Jezero/region context, "Simulated mission" disclosure, visible help/credits.
- Main map: georeferenced imagery, terrain/coverage mask, legend, current selected endpoint mode, start/end markers, science pins, outbound and return routes visually distinct, zoom and map-scale semantics correct for Mars.
- Planner drawer (left on desktop): fictional habitat/start selector, science destination, optional stop duration, route mode, generate/recalculate action and clear/reset.
- Mission summary/right panel: total/leg distance, time, ascent/descent, max slope, return margin, feasibility/unknown status, explanations.
- Layer selector: source, observation/derived label, source footprint/resolution, errors and coverage.
- Timeline control: simulated LTST/sol or season indicator, start/pause/step, speed, clear "not real-time" tag.
- Advanced assumptions (collapsed by default): walking speed, max slope, science time, reserve, model date/season and warnings.
- Source/provenance drawer: clickable evidence for every layer/derived metric and simulation assumption.

**Required screen states:** loading/processing; first-run sample; valid route; no valid route; selected coordinate invalid/outside area; nodata/unknown; model error; stale route recalculating; online tiles unavailable but local DEM available; online/offline imagery fallback; empty science target list. No endless spinner.

## 4. Interaction contract

1. First load opens Jezero with an illustrative sample habitat/target **only if** both lie in the verified AOI; else guide to valid placement.
2. "Set Habitat" and "Set Science Destination" update the cursor and accessible instructions. Clicking any verified valid cell works; predefined locations are not mandatory.
3. If user clicks unsupported data, show issue and optional "snap to nearest valid cell" preview; never reposition invisibly.
4. Route is recalculated only for correct dataset/assumptions; disable obsolete result while worker computes, cancel stale result on edits.
5. Mode switch toggles shortest/lower-slope, update map and cost explanation; show when routes are identical.
6. Map hover/click reveals measured elevation, derived slope and source; no-data label remains visible.
7. Time controls always show "SIMULATED". When assumptions change during animation, pause or recompute clearly.
8. Warnings explain what constraint failed. Use text/icons in addition to red/green.
9. Historical environmental context (if P1) states instrument + date + location and cannot be mistaken for live local values.
10. 3D mode (P1) opens same scene coordinates; if unavailable gracefully return to the same 2D viewport and mission state.

## 5. Accessibility and behavior

- Focus visibility and keyboard support for every map-mode, panel, reset, step, compare and layer control; map click placement needs coordinate-entry alternate.
- Dialogs and advanced panel have semantic labels, escape-close and focus restoration.
- Labels show units and scientific provenance; colorblind-safe palette, patterns/line styles differentiate routes.
- Contrast target WCAG 2.2 AA; ensure warnings have text and icon; no color-only hazard interpretation.
- Prefer >=44px touch targets on tablet; respect reduced-motion preference.
- Provide screen-reader text summary of calculated route, length, elevation and constraints; map cannot be only way to access data.
- Avoid infinite auto-animations, full-screen blocking intro, and 3D-only navigation.

## 6. Components / design tokens

Suggested primitives: AppShell, MarsMap, LayerSwitcher, MapLegend, CoverageBoundary, WaypointMarker, RouteLine, RouteComparison, MissionSummary, ReturnMargin, SimClockControls, ScienceTargetList, AssumptionsDrawer, DataProvenancePopover, StatusAlert, FallbackNotice.

Tokens: typography scale, spacing, surfaces, primary/secondary text, focus, measured/derived/simulated/unknown badges, route outbound/return, slope low/mid/high/no-data, feasible/infeasible/indeterminate. Define neutral semantic tokens **before** applying Mars-themed colors.

## 7. Scientific UI labels

Preferred:
- "DEM-derived slope • MRO HiRISE/USGS • X m cell spacing"
- "Estimated time to return • simulated walking speed 0.6 m/s"
- "Geometric sunset estimate • no terrain shadows"
- "Feasible under selected assumptions"
- "Historical measurement from Perseverance MEDA at [time/location]"
- "Unknown: outside high-resolution DEM coverage"

Prohibited:
- "NASA-certified safe path", "live radiation at Jezero" without current local data, "real-time thermal forecast" from THEMIS mosaics, "verified boulder-free", fake "signal acquired" status.

## 8. Fable agent handoff

Fable should:
1. Read README.md, MASTERPLAN.md, PRD.md, UI_UX_SPEC.md, AGENT_GUIDELINES.md.
2. Inspect linked Figma if access allows; if not, design from these flows and note inability to compare.
3. Produce desktop and tablet screen designs, component variants and explicit loading/error/no-data states; create responsive map-first hierarchy.
4. Keep map as the visual focal point; ensure toolbars do not cover map features or legends.
5. Never modify route/solar scientific behaviors solely to fit a cosmetic layout.
6. Deliver screenshots and interaction/keyboard walkthrough to the coding agent; document what changed from Figma.
7. Verify map legend and provenance are always discoverable; put advanced assumptions behind deliberate reveal.

The UI spec is behavior-first and intentionally **does not** assert any unseen Figma-specific colors, artboards or interactions.
