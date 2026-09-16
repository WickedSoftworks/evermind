import clientModule from "@pro/client";
import type { ProClientSections } from "./contract";

/**
 * The browser's view of the optional module.
 *
 * `lib/pro/index.ts` is the server's, and the two must stay apart. That file
 * reaches `pro/index.ts`, which imports `pro/db.ts`, which reads
 * `SUPABASE_SERVICE_ROLE_KEY` — a chain that is correct on a server and
 * catastrophic in a browser bundle. Importing it from a client component is the
 * kind of mistake that compiles, runs, and ships a key to every visitor.
 *
 * So the module has a second entry point carrying components and nothing else,
 * `next.config.mjs` aliases `@pro/client` at it the same way it aliases `@pro`,
 * and this file is the only door to it. A build without the submodule resolves
 * `pro-stub/client.ts`, every lookup comes back undefined, and the components
 * that ask draw nothing — which is what a self-hosted install should look like.
 *
 * Safe to import from a client component. That is the whole point of it, and
 * `pro/tests/client-boundary.test.ts` is what keeps it true.
 */

export type { ProClientSections } from "./contract";

/**
 * One of the module's components, or nothing.
 *
 * Generic over the key so the caller gets the component's real props rather
 * than something it has to cast — a section rendered with the wrong props would
 * otherwise fail at runtime, in a dialog, in front of a paying customer.
 */
export function proClientSection<K extends keyof ProClientSections>(name: K): ProClientSections[K] {
  return clientModule.sections[name];
}

/**
 * Whether the browser half of the module is in this build at all.
 *
 * Prefer asking for the section you want and rendering nothing when it is
 * absent. This is here for the rare consumer that has to decide something
 * before it knows which section it needs.
 */
export const proClientPresent = clientModule.present;
