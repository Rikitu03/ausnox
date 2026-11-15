import { createMockServices } from './adapters/mock'
import { createRealServices } from './adapters/real'
import type { AusnoxServices, DataMode } from './contracts'

/**
 * Real scientific adapters are the default, including production builds. The deterministic mock
 * adapters run only when VITE_DATA_MODE=mock is set explicitly (npm run dev:mock, and the unit/UI tests).
 */
export const dataMode: DataMode = import.meta.env.VITE_DATA_MODE === 'mock' ? 'mock' : 'real'

/**
 * The single place the app obtains its data and science services.
 * Switch adapters with VITE_DATA_MODE (see .env.example).
 */
export const services: AusnoxServices = dataMode === 'real' ? createRealServices() : createMockServices()

export * from './contracts'
