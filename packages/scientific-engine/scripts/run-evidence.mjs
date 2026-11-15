#!/usr/bin/env node
/**
 * Runs typecheck, build and the full test suite, and records the results as evidence:
 *   evidence/vitest-results.json   per-test PASS/FAIL from the Vitest JSON reporter
 *   evidence/mars24_benchmark.json, integration_scenario.json, terrain_crosscheck.json
 *                                  written by the tests themselves (AUSNOX_WRITE_EVIDENCE=1)
 *   evidence/run-summary.json      commands, exit codes, tool versions
 * Exit code is non-zero if any step fails.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const evidence = join(root, 'evidence')
mkdirSync(evidence, { recursive: true })
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function run(name, args, env = {}) {
  const t0 = Date.now()
  const r = spawnSync(npx, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, ...env } })
  const out = { name, command: `npx ${args.join(' ')}`, exit_code: r.status, duration_ms: Date.now() - t0 }
  process.stdout.write(r.stdout ?? '')
  process.stderr.write(r.stderr ?? '')
  return out
}

const steps = [
  run('typecheck', ['tsc', '-p', 'tsconfig.json', '--noEmit']),
  run('build', ['tsc', '-p', 'tsconfig.build.json']),
  run('test', ['vitest', 'run', '--reporter=default', '--reporter=json', '--outputFile.json=evidence/vitest-results.json'], { AUSNOX_WRITE_EVIDENCE: '1' }),
]
let tests = null
try {
  const j = JSON.parse(readFileSync(join(evidence, 'vitest-results.json'), 'utf8'))
  const files = new Set((j.testResults ?? []).map((t) => t.name)).size
  tests = { files, suites: j.numTotalTestSuites, total: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests, pending: j.numPendingTests, success: j.success }
} catch {
  tests = null
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = (name) => {
  try {
    return JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version
  } catch {
    return null
  }
}
const summary = {
  generated_utc: new Date().toISOString(),
  package: `${pkg.name}@${pkg.version}`,
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  typescript: version('typescript'),
  vitest: version('vitest'),
  steps,
  tests,
  overall: steps.every((s) => s.exit_code === 0) && tests?.success === true ? 'PASS' : 'FAIL',
}
writeFileSync(join(evidence, 'run-summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(`\nEVIDENCE ${summary.overall}: ${JSON.stringify(tests)}`)
process.exit(summary.overall === 'PASS' ? 0 : 1)
