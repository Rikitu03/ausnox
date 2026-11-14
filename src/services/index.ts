import { createMockServices } from './adapters/mock'
import { createRealServices } from './adapters/real'
import type { AusnoxServices, DataMode } from './contracts'

export const dataMode: DataMode = import.meta.env.VITE_DATA_MODE === 'real' ? 'real' : 'mock'

/**
 * The single place the app obtains its data and science services.
 * Switch adapters with VITE_DATA_MODE (see .env.example).
 */
export const services: AusnoxServices = dataMode === 'real' ? createRealServices() : createMockServices()

export * from './contracts'
