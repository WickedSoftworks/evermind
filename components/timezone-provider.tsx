"use client"

import * as React from "react"
import { DEFAULT_TIME_ZONE, TIMEZONE_COOKIE, resolveBrowserTimeZone } from "@/lib/dates"

const TimeZoneContext = React.createContext(DEFAULT_TIME_ZONE)

/** The visitor's IANA timezone. Identical on the server and the client once the cookie exists. */
export function useTimeZone() {
  return React.useContext(TimeZoneContext)
}

interface TimeZoneProviderProps {
  /** Read from the timezone cookie on the server, so the first paint is already correct. */
  initialTimeZone: string
  children: React.ReactNode
}

/**
 * Carries the browser's timezone to the server in a cookie.
 *
 * The server has no way to know where a visitor is, so it used to render every
 * date in UTC and let the client correct it after hydration — which showed the
 * wrong day to anyone outside UTC until then. With the cookie the server formats
 * in the visitor's own zone and the two renders agree, so there is nothing to
 * correct. Only the very first request from a device falls back to UTC.
 */
export function TimeZoneProvider({ initialTimeZone, children }: TimeZoneProviderProps) {
  const [timeZone, setTimeZone] = React.useState(initialTimeZone)

  React.useEffect(() => {
    const resolved = resolveBrowserTimeZone()
    if (resolved === timeZone) return
    // A year, refreshed on every visit; it is re-set automatically if the user travels.
    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(resolved)}; path=/; max-age=31536000; samesite=lax`
    setTimeZone(resolved)
  }, [timeZone])

  return <TimeZoneContext.Provider value={timeZone}>{children}</TimeZoneContext.Provider>
}
