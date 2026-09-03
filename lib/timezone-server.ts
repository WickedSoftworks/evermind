import { cookies } from "next/headers"
import { TIMEZONE_COOKIE, normalizeTimeZone } from "@/lib/dates"

/**
 * The visitor's timezone as their browser last reported it.
 *
 * Reading the cookie opts the route into dynamic rendering, which is why only
 * the routes that actually render dates call this — a page whose HTML embeds
 * one visitor's local dates could not be cached across visitors anyway.
 */
export async function getTimeZone(): Promise<string> {
  return normalizeTimeZone((await cookies()).get(TIMEZONE_COOKIE)?.value)
}
