# Ausnox UI refinement

Direction: Data terminal, seed 1251518745. Brand palette and Instrument Sans / IBM Plex Mono retained. Existing labeled navigation and map-centered shell retained to preserve familiar workflows; no new imagery or sample data.

Question: Can this Marswalk return within its daylight window?
Idea: Jezero's traverse and return margin become the central map and leading result.
Live interaction: existing placement, route calculation, and simulation.
Inventory: Jezero terrain, habitat, science destination, science stops, slope limit, return reserve, geometric sunset, route comparison, provenance, simulated clock.

Changes: 18px panel titles, 14px section headings, 30px leading margin, 18px supporting figures; 20px panel spacing; lighter secondary text; inset metric well; quieter empty states; consistent selection underline. Mobile navigation gains its own row. Map legend clears panel buttons. Placement warnings fit the available map lane. The phone timeline has its own row.

## Validation
Production build and ESLint pass. Existing suite: 97 tests across 7 files pass. Playwright with installed Edge verified placement confirmation, mobile planner, calculation, all five views, and no page overflow at 768 and 390px, with reduced motion. Screenshots cover 1440, 768, and 390px.
The skill CDP inspector timed out at Page.enable before capturing the baseline. No automated inspector score or before/after measurement is claimed. Playwright provided the visual fallback. Source design lint: 0 failures, 0 warnings for the checked layout/control files.

ROUND 2
Seen in one second: Mars terrain between a mission planner and its return margin.
Idea (one sentence): The traverse and its return window determine visual priority.
Live thing: Place endpoints, calculate routes, simulate the clock.
Layout words by section: workspace=map with side panels / summary=leading result with evidence / sources=reference sections.
Scores: design 7.5 · usability 7.5 · creativity 7 · content 8 ? overall 7.5 (subjective visual review, not inspector certification).
Caps applied: none from the marketing-page rubric; this is an existing scientific application.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. Original mobile placement warning clipped at the right edge (after-390.png). Fixed container maximum widths and wrapping action; confirmed in placement-mobile.png.
2. Mobile transport timeline squeezed beside the clock (after-390.png). Moved timeline onto its own row; confirmed in control-390.png.
3. Long coordinates remain dense in the mobile planner (planner-mobile.png). Values remain available; a future coordinate-row redesign would improve their wrapping.

Limits: desktop side panels intentionally scroll; phone navigation scrolls horizontally to the fifth destination. External NASA imagery tiles were unavailable during verification, so existing local shaded relief rendered. No scientific logic or dependency changes.
