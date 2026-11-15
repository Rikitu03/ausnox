/** Scientific category of a value (docs/SCIENTIFIC_MODELS.md §1). */
export type ProvenanceCategory = 'observed' | 'derived' | 'simulated' | 'historical' | 'unknown'

export interface SourceReference {
  readonly label: string
  readonly url: string
}

export interface ProvenanceRecord {
  readonly id: string
  readonly title: string
  readonly category: ProvenanceCategory
  readonly mission: string | null
  readonly instrument: string | null
  readonly provider: string | null
  /** What the value measures or represents. */
  readonly measures: string
  readonly method: string | null
  readonly coverage: string | null
  readonly resolution: string | null
  readonly sources: readonly SourceReference[]
  readonly limitations: readonly string[]
  readonly attribution: string
}

/** Attached to every computed result so the UI can trace it. */
export interface ResultProvenance {
  readonly engine: '@ausnox/scientific-engine'
  readonly engineVersion: string
  readonly model: string
  readonly modelVersion: string
  readonly category: ProvenanceCategory
  readonly inputs: readonly string[]
}
