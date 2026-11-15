# Ausnox information architecture redesign

Implemented against the supplied Mission Control and Terrain references in `docs/screenshots/`. Captured the current production baseline and redesigned production screens at the same 1568 × 687 desktop viewport. Supplementary checks use 1568 × 900, 768 × 844 and 390 × 844.

| Panel | Before | After |
| --- | --- | --- |
| Mission planner | Projected coordinates, geographic coordinates and terrain metadata compete with location names; destination duration crowds the title | Mission setup holds name and route preference. Habitat and destination are distinct entity summaries with elevation and slope first. Activity duration has its own labeled field. Coordinates and planning identifiers are disclosures. Stops remain ordered and manageable. Advanced assumptions remain collapsed. |
| Mission status | Engine origin narrative precedes the principal number; outbound and return occupy a dense table | Concise verdict and explanation lead. Return margin is the largest result, followed by four metrics. Outbound and return have separate summaries. Comparison and scientific explanation are disclosures; the latter contains full margin arithmetic and source controls. Simulation is the main action for a feasible mission; full summary takes priority for an infeasible mission. |
| Layers and science | Unavailable imagery notes and entire waypoint narratives appear in the default list | Base surface selector, compact overlay switches, and expandable imagery availability/legends. Target list shows names, source category, activity duration, and short purpose. Selecting a target focuses its detail and actions. Extended context, rover observations, coordinates, caveats and citations remain in Scientific details. |
| Terrain inspector | Coordinates lead the selected cell; long dataset and georeference paragraphs follow numerical metrics | Selected cell leads with elevation and slope, including explicit unknown states. Dataset dimensions, resolution, coverage and elevation range form one metric group. Scientific metadata holds the full original provenance, reference system and validation findings. Distributions have their own disclosure. Registration uncertainty also remains visible through the map notice. |

The panel widths and central map allocation are unchanged. Content intentionally scrolls independently; fitting every section into the initial viewport is not a design goal. Desktop panel toggles and Focus map retain mounted panel state. Leaflet does not reset its camera merely because panel visibility changes. Showing a target accounts for the unobstructed portion of the map. Three.js controls remain unobstructed.

## Screenshots

- [Mission Control baseline](ia-before-control.png) / [redesigned](ia-after-control.png)
- [Terrain baseline](ia-before-terrain.png) / [redesigned](ia-after-terrain.png)
- [Selected science target](ia-selected-target.png)
- [Expanded scientific explanation](ia-scientific.png)
- [Mobile planner](ia-planner-390.png) / [mobile terrain](ia-terrain-390.png)
- [Advanced assumptions](ia-advanced.png) / [3D workspace](ia-3d.png)

## Verification

- TypeScript, ESLint, production build, and all 99 unit/integration tests pass.
- Existing app tests now follow the new labels and open source disclosures before interacting with them. Two additional tests exercise disclosure visibility and target selection.
- Playwright against the production build in Edge verifies mission result, placement confirmation, native disclosures, keyboard Enter on metadata, target selection, target source links, Focus map, responsive sheets and no page overflow at 768px and 390px. No page runtime errors were observed in that flow.
- Separate browser smoke check verifies advanced settings remain reachable by panel scrolling and Three.js loads its 80,000-triangle terrain and survives Focus map toggles.
- Screenshots were visually reviewed for hierarchy, text wrapping, panel boundaries, mobile controls and 3D toolbar overlap. The overlap found during review was corrected.
- Scientific adapters, route calculations, source datasets and model constraints were not changed. The unresolved imagery registration uncertainty remains explicit.

UI/UX Pro Max was consulted for the React stack and accessibility/typography guidance. Its progressive-disclosure search returned an unrelated typography entry; disclosure decisions follow this task's explicit information architecture requirements and the skill's built-in forms/feedback defaults, rather than that unrelated result.

Remaining limitation: the existing production build still reports the large Three.js chunk warning. Screenshots use current production terrain and may differ from the demo data in the reference images.

Final unit verification command: `npm.cmd test -- --run --maxWorkers=2 --testTimeout=15000` — 99/99 passed across 7 files. An earlier run during concurrent build/browser work hit two 5-second test timing limits; the isolated final run passed. Final production screenshots and browser flows were recaptured after the last component changes.
