/**
 * Evidence files are written only when AUSNOX_WRITE_EVIDENCE=1 (set by `npm run evidence`),
 * so ordinary test runs never modify committed files.
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const DIR = new URL('../../evidence/', import.meta.url)

export function writeEvidence(name: string, data: unknown): void {
  if (process.env.AUSNOX_WRITE_EVIDENCE !== '1') return
  mkdirSync(DIR, { recursive: true })
  const body = JSON.stringify({ generated_utc: new Date().toISOString(), generated_by: `tests (${name})`, ...(data as object) }, null, 2)
  writeFileSync(new URL(name, DIR), body + '\n', 'utf8')
}
