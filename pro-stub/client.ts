import type { ProClientModule } from "@/lib/pro/contract";

/**
 * The browser half of the optional module, as the open-source repository sees
 * it: nothing at all.
 *
 * `sections` is empty rather than absent, so every lookup through
 * `lib/pro/client.ts` comes back undefined and every consumer takes its
 * render-nothing branch. There is no cta here and there cannot be one — the
 * same reasoning as `pro-stub/index.ts`, and for the same reason: a clone of
 * this repository is not a paid product with the paid parts greyed out.
 *
 * This file is also the reason the client half is safe. It imports a type and
 * nothing else, so a build without the submodule cannot pull a database client
 * into the browser bundle even by accident.
 */
const stub: ProClientModule = {
  present: false,
  sections: {},
};

export default stub;
