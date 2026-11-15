/// <reference lib="webworker" />
/**
 * Route worker: hosts the scientific engine's own message handler (load, round-trip, plan-mission, ...).
 * The main thread transfers a copy of terrain.bin once; the worker verifies its SHA-256 again and
 * answers every request with its requestId and the dataset version it used.
 */
import { installRouteWorker, type RouteWorkerScope } from '@ausnox/scientific-engine'

installRouteWorker(self as unknown as RouteWorkerScope)
