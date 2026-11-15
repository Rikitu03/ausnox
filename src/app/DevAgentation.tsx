import { lazy, Suspense } from 'react'

/**
 * Agentation visual-feedback toolbar. Local development only, never a product feature.
 *
 * `import.meta.env.DEV` is a compile-time constant: in a production build the branch below is
 * dead code, so the dynamic import is dropped and `agentation` is never bundled or shipped.
 * The toolbar syncs annotations to the local MCP server (`npx agentation-mcp server`, port 4747).
 */
const Agentation = import.meta.env.DEV
  ? lazy(() => import('agentation').then((m) => ({ default: m.Agentation })))
  : null

export function DevAgentation() {
  if (!Agentation) return null
  return (
    <Suspense fallback={null}>
      <Agentation endpoint="http://localhost:4747" appName="Ausnox" />
    </Suspense>
  )
}
