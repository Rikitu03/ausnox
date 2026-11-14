# AUSNOX — SCIENTIFIC AND SIMULATION MODELS
Version: 1.0 | Specification and validation targets (NOT yet implemented)

## 1. Categories and safety language

- **Observed:** measured NASA/USGS image or raster values with documented product.
- **Derived:** values computed from observed rasters or reproducible astronomical equations.
- **Simulated:** hypothetical human behavior, schedule, traverse limits and reserve.
- **Unknown:** missing, invalid, outside coverage or unsupported.
- **Historical context:** recorded environmental data from known dates/locations, not a future Mars forecast.

Never label results flight-qualified, guaranteed safe or current astronaut telemetry. The UI should say **Feasible under selected assumptions**, **Infeasible under selected assumptions**, or **Indeterminate**.

## 2. Mars coordinate conventions and unit discipline

Use **Mars**, not Earth's default CRS or WGS84 sphere. Inspect actual source raster CRS and source spheroid. For geolocation, use east-positive longitude with a documented 0–360° convention (or normalize to -180–180 only for display). Latitude definitions (planetocentric/planetographic), datum, center meridian and elevation reference must be recorded. Images and DEM can differ; convert consciously and test landmark alignment.

Route length and slope are computed in a projected local grid measured in **meters**, not degrees. At Jezero latitude, degree-longitude and degree-latitude spacing differ; do not treat a pixel in lat/lon as a fixed 10m square. Prefer a correctly projected metric AOI that can be reliably inverted for map coordinates. GeoJSON uses longitude, latitude order.

Reference Mars sphere radius when appropriate: 3,396,190 m. Treat as projection metadata, not justification to override a product's CRS. Elevation and DEM vertical datum must be preserved and labeled.

## 3. Terrain derivation and validity

Input numeric DEM and optional confidence mask. Determine source pixel spacing, units, nodata, confidence thresholds. Crop to scientifically supported high-res AOI and optionally resample to a **coarser or equal** effective resolution; never invent fine-scale detail from upsampling.

For meter-based projected coordinates, estimate gradients dz/dx, dz/dy from valid neighbors, with finite differences; reject invalid neighbor neighborhoods. Derived slope:

~~~text
slope_radians = atan( sqrt( (dz/dx)^2 + (dz/dy)^2 ) )
slope_deg     = slope_radians * 180 / pi
~~~

Record interpolation/kernel and handling of edges. Unknown slope is blocked; choose configurable max slope (illustrative; NOT a certified astronaut limit). Distinct DEM uncertainty and roughness scores require documented derivation; do not infer granular sand/rocks from imagery by label alone.

## 4. Terrain graph and A* rules

- Each accepted DEM grid cell is a graph node; neighbors default to 8 directions.
- Moves into nodata, outside mask or slope > configured threshold are forbidden.
- Diagonal transitions cannot squeeze through two blocked orthogonal neighbors ("no corner cutting").
- Edge metric distance d = cellSize × 1 or sqrt(2), or geodesic-equivalent projected distance when grid non-square.
- Cost must be nonnegative, >= metric distance. An admissible heuristic is straight-line projected distance to target when all edge costs >= distance.
- **Shortest mode** minimizes legal total distance.
- **Lower-slope mode** uses cost = d * (1 + w_s * S + w_r * R), with S a documented normalized nonnegative slope metric; if roughness not measured set w_r=0 and do not imply roughness sensing.
- Up- vs downhill direction may be asymmetrically penalized if specified. The route from target back to habitat must be computed independently; do not simply reverse and assume cost/time equivalence.
- Support optional intermediate science stop(s) by computing segments in fixed user order; if stop reordering is not implemented, state this.
- A* result includes traversed cell count, max/mean slope, elevation samples, upward/downward elevation change, distance, time estimate, dataset and pathfinding model version.
- A path is not automatically an EVA-feasible mission.

Pseudocode:

~~~text
validate(start, end, grid, mask, assumptions)
open = min-heap with start
g[start] = 0
while open not empty:
    node = pop-min(open)
    if node == goal: reconstruct and validate path
    for each legal neighbor:
        candidate = g[node] + edgeCost(node, neighbor)
        if candidate < g[neighbor]:
            update cost, predecessor and heap priority
if no path: NO_ROUTE
~~~

Include deterministic tie-breaking for reproducibility and finite bounds/cancellation for huge grids.

## 5. Travel time estimates

Hypothetical baseline speed is a clearly labeled adjustable assumption, not a space-suit operational guarantee. If speed is constant:

~~~text
leg_travel_seconds = sum(metric_edge_distance_m) / walking_speed_m_per_s
total_mission_seconds = outbound_seconds + return_seconds
                        + sum(science_stop_seconds) + planned_other_time_seconds
~~~

If using a slope-dependent speed reduction, document exact function, directionality and test it; don't infer from route cost. Do not equate A* penalty units with physical Joules. The P0 product must not claim optimized energy expenditure.

Example default inputs (all **illustrative and to be reviewed**): walking_speed=0.6 m/s; max_slope=15 deg; science_stop=15 min; turnaround_reserve=30 min. No NASA human EVA standard is asserted by these numbers. Settings live under Advanced Mission Assumptions; values validated with finite positive ranges. For demo convenience, use one reproducible scenario in the test fixture.

## 6. Mars solar model and simulated timeline

Implement reproducible astronomical calculations based on NASA GISS Mars24:

https://www.giss.nasa.gov/tools/mars24/help/algorithm.html

**NASA reference parameters** include Mars Sol Date conversion with a Martian sol of approximately 88,775.244 seconds (24h 39m 35.244s Earth time), JD_TT, areocentric solar longitude **Ls**, equation of time, LMST and LTST. NASA's published Mars24 algorithm supplies numbered steps and worked examples. Don't silently use the user's Earth local clock as "Mars now".

Compute/validate:
1. UTC timestamp → JD_UTC and appropriate TT offset with stated leap-second handling; J2000 delta.
2. Mars mean anomaly, equation of center, Ls and equation of time by cited Mars24 equations.
3. LMST and LTST at actual Mars east/west longitude convention.
4. Solar declination, solar hour angle and solar elevation; test against NASA worked examples (e.g. Spirit landing and the other published case).
5. Approximate geometric sunrise/sunset for latitude phi and solar declination delta using cos(H0) = -tan(phi) * tan(delta) when valid. sunrise LTST ~ 12h - H0/15 degrees-per-hour, sunset ~ 12h + H0/15; handle never-rises/never-sets cases. Record approximations: horizon=0 deg, no topographic shading, atmospheric scattering/dust/refraction not modeled. Recalculate with seasonal changes when needed.
6. Convert **Mars local-hour progress to Earth elapsed seconds**: 24 Mars clock hours correspond to one sol (~88,775.244 Earth seconds). Do not subtract Mars clock hours from Earth walk seconds directly.

Model configuration includes fixed simulated start UTC or Ls/sol/date with documented mapping; start paused, steps/speed selectable, no actual telemetry. A simulation advance must update remaining time and feasibility relative to progress through outbound/science/return timeline; implement either deterministic progress along legs or simple remaining work duration, not a random animated counter.

## 7. Feasibility and turnaround rules

For a fully known round trip:
- mission completion estimate = simulated start + outbound time + activity time + return time;
- available window = min(geometric daylight deadline, configured maximum EVA duration if enabled);
- required buffer = selected reserve duration;
- **return margin** = available window - current simulation time - **remaining** mission work - required buffer.
- feasible iff every spatial path valid, the timed tasks fit the enabled window, margin >= 0, and all required model inputs are valid.
- infeasible if a known constraint is violated.
- indeterminate if missing route/solar/data or safety model fails validation.

When sunset falls across sol boundary, explicitly represent boundary and avoid 24-hour wrap arithmetic bugs. A planned mission beginning in darkness may be classified infeasible under a daylight-only policy, even if it fits the next sunrise; do not auto-shift start. If unknown inputs exist, do not replace them with favorable assumptions.

For a route already underway, the **estimated return-to-habitat deadline** must account for current position and remaining activities; don't continue showing the original full-route margin as though nothing has happened.

Turnaround warning is an operationally **simulated** threshold: e.g., current remaining margin <= 0, or margin below configurable warning threshold. It is never an actual suit alarm.

## 8. Scientific waypoints and alternative conditions

Waypoints must have source citations and verified map coordinates. A label such as "hydrated minerals" requires documented geologic/spectral support; otherwise label "illustrative sampling stop" with user-selected duration.

Thermal/MEDA (P1) must carry observation time and geographic scope. Radiation (later) requires appropriate instrument and locale: Curiosity RAD in Gale does **not** supply a measured Jezero dose rate. No statistical dust storm probability without a real method/dataset.

## 9. Validation and model versioning

All derived data must store source product hash, processing script version, AOI bounds, CRS, units and algorithm version. Test known topography grids (flat=0deg; known slope; masked edge), A* graph constraints and route reversibility assumptions, Mars24 worked examples, astronomical edge cases, daylight-margin boundary at exactly zero, seconds vs sol-hours conversion, noon/night sanity, near-dateline normalization and missing-data failures.

Set explicit benchmark tolerances before declaring PASS: Mars24 intermediate values per official worked examples to within rounding/implementation expected numerical precision (target e.g. LTST <= 60 seconds and solar angle <= 0.1 degree when input time matches); if UTC↔TT implementation cannot meet tolerance, show "solar calculation unverified" and block green feasibility.

## 10. Disclosure

Do not conflate mission planning estimates with safety certification. Prominent app footer: **"Educational Marswalk planning simulation. Real NASA/USGS terrain data; mission constraints are illustrative. Not for operational navigation."**
