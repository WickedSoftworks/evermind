"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

interface CompactModeContextType {
  isCompact: boolean
  setIsCompact: (value: boolean) => void
}

const CompactModeContext = createContext<CompactModeContextType | undefined>(undefined)

export function CompactModeProvider({ children }: { children: ReactNode }) {
  const [isCompact, setIsCompactState] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Load from localStorage on mount
    const stored = localStorage.getItem("evermind-compact-mode")
    if (stored === "true") {
      setIsCompactState(true)
      document.documentElement.classList.add("compact")
    }
    setMounted(true)
  }, [])

  const setIsCompact = (value: boolean) => {
    setIsCompactState(value)
    localStorage.setItem("evermind-compact-mode", String(value))
    if (value) {
      document.documentElement.classList.add("compact")
    } else {
      document.documentElement.classList.remove("compact")
    }
  }

  // Prevent hydration mismatch
  if (!mounted) {
    return <>{children}</>
  }

  return (
    <CompactModeContext.Provider value={{ isCompact, setIsCompact }}>
      {children}
    </CompactModeContext.Provider>
  )
}

export function useCompactMode() {
  const context = useContext(CompactModeContext)
  if (context === undefined) {
    // Return default values when used outside provider (e.g., during SSR)
    return { isCompact: false, setIsCompact: () => {} }
  }
  return context
}

/**
 * Script to inject into the page head to prevent FOUC for compact mode.
 * This runs before React hydrates.
 */
export const compactModeScript = `
  (function() {
    try {
      var compact = localStorage.getItem('evermind-compact-mode');
      if (compact === 'true') {
        document.documentElement.classList.add('compact');
      }
    } catch (e) {}
  })();
`
