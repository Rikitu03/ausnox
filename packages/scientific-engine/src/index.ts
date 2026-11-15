/**
 * @ausnox/scientific-engine public API.
 *
 * Framework independent: no React, no map library, no global state, no network access
 * except the explicit loaders. Every expected failure is returned as an `EngineError`
 * value instead of being thrown. See docs/SCIENTIFIC_ENGINE_HANDOFF.md.
 */
export * from './version.js'

// contracts
export * from './contracts/errors.js'
export * from './contracts/geo.js'
export * from './contracts/provenance.js'

// Mars coordinates
export * from './coordinates/mars.js'
export * from './coordinates/grid.js'

// terrain
export * from './terrain/manifest.js'
export * from './terrain/dataset.js'
export * from './terrain/loader.js'
export * from './terrain/sampling.js'
export * from './terrain/scienceTargets.js'

// routing
export * from './routing/types.js'
export * from './routing/route.js'
export * from './routing/worker.js'
export { AStarSearch, SearchWorkspace, buildPassableMask, moveCost, moveLengthM, type EdgeCostConfig, type SearchProblem, type SearchStatus } from './routing/astar.js'

// Mars time and daylight
export * from './solar/timeScales.js'
export * from './solar/conversions.js'
export * from './solar/mars24.js'
export * from './solar/daylight.js'

// mission feasibility and simulation
export * from './mission/assumptions.js'
export * from './mission/timeline.js'
export * from './mission/feasibility.js'
export * from './mission/simulation.js'
export * from './mission/plan.js'
