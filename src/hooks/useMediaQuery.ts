import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Side panels sit beside the map from this width up. Below it they open as drawers over the map. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1280px)')
/** Below this width panels open as bottom sheets instead of side drawers. */
export const useIsTabletUp = () => useMediaQuery('(min-width: 768px)')
