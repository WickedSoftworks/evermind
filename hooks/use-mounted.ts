import * as React from 'react'

/**
 * False during SSR and the first client render, true afterwards.
 *
 * Gate anything that depends on the visitor's clock or timezone behind this:
 * the server renders in UTC, so rendering it straight away is a hydration
 * mismatch for everyone outside UTC.
 */
export function useMounted() {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  return mounted
}
