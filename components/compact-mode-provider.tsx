"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useSyncExternalStore } from "react";

const COMPACT_MODE_STORAGE_KEY = "evermind-compact-mode";

interface CompactModeContextType {
  isCompact: boolean;
  setIsCompact: (value: boolean) => void;
}

const CompactModeContext = createContext<CompactModeContextType | undefined>(undefined);

/**
 * The stored preference lives in localStorage, which React cannot observe on its own,
 * so the provider reads it through `useSyncExternalStore`. That gives the correct value
 * on the first client render without a lazy `useState` initialiser, which would read
 * localStorage during hydration and disagree with the server-rendered markup.
 */
const listeners = new Set<() => void>();

/**
 * Cached so `getSnapshot` is stable between renders, and so the preference still
 * applies for the session when localStorage is unavailable and cannot be written.
 */
let cachedValue: boolean | null = null;

function readStoredValue(): boolean {
  try {
    return localStorage.getItem(COMPACT_MODE_STORAGE_KEY) === "true";
  } catch {
    // Storage can be unavailable entirely (private mode, blocked site data).
    return false;
  }
}

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    // `key` is null when storage is cleared wholesale.
    if (event.key !== null && event.key !== COMPACT_MODE_STORAGE_KEY) return;
    cachedValue = readStoredValue();
    onStoreChange();
  };

  listeners.add(onStoreChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function getSnapshot(): boolean {
  if (cachedValue === null) {
    cachedValue = readStoredValue();
  }
  return cachedValue;
}

function getServerSnapshot(): boolean {
  return false;
}

export function CompactModeProvider({ children }: { children: ReactNode }) {
  const isCompact = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // The inline head script sets this class before paint; this keeps it correct
  // afterwards, including when another tab changes the preference.
  useEffect(() => {
    document.documentElement.classList.toggle("compact", isCompact);
  }, [isCompact]);

  const setIsCompact = useCallback((value: boolean) => {
    cachedValue = value;
    try {
      localStorage.setItem(COMPACT_MODE_STORAGE_KEY, String(value));
    } catch {
      // Persisting is best-effort; the change still applies for this session.
    }
    notifyListeners();
  }, []);

  return <CompactModeContext.Provider value={{ isCompact, setIsCompact }}>{children}</CompactModeContext.Provider>;
}

export function useCompactMode() {
  const context = useContext(CompactModeContext);
  if (context === undefined) {
    throw new Error("useCompactMode must be used within a CompactModeProvider");
  }
  return context;
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
`;
