import type { CapabilityCta, ProCapabilities } from "./contract";

/**
 * Turning the capability map into something a component can draw.
 *
 * `lib/pro/contract.ts` describes three states and says what each one means.
 * The third — `available: false` **with** a cta — is the one that has to be
 * rendered, and until now nothing in the application rendered it. This is that
 * consumer, kept as a pure function so the rules can be tested without a
 * database, a module or a browser.
 *
 * The rules, in order of how badly getting them wrong would go:
 *
 *   - A capability with **no cta is never drawn**. That is the self-hosted
 *     case, and drawing a disabled control or a placeholder there would put an
 *     advertisement for an edition into an install whose operator cannot buy
 *     one.
 *   - An **available** capability is never drawn either. The feature itself is
 *     what the user should be looking at, not a note about it.
 *   - The wording is never ours. Title aside, every string rendered comes from
 *     the cta the module supplied, and this file does not care whether it says
 *     "buy this" or "this is coming" — see `capabilityPrompts`.
 */

/**
 * Display names, in this repository because the capability names already are.
 *
 * `ProCapabilities` names each one for what it does rather than what it costs,
 * so a human-readable version of the same thing carries no more information
 * than the interface does. Typed as a total record on purpose: add a capability
 * to the contract and this stops compiling until it has a name, which is a
 * better reminder than a blank row in the UI.
 */
export const CAPABILITY_TITLES: Record<keyof ProCapabilities, string> = {
  calendarFeed: "Calendar feed",
  canvasSync: "Canvas sync",
  attachments: "Attachments",
  reminderRules: "Reminders you choose",
  programmaticApi: "API access",
  retentionRules: "Keeping finished work",
};

export interface CapabilityPrompt {
  readonly name: keyof ProCapabilities;
  readonly title: string;
  /** The module's words, not ours. */
  readonly blurb: string;
}

/** Prompts that share an action, so the action is offered once rather than per row. */
export interface PromptGroup {
  readonly label: string;
  readonly href: string;
  readonly prompts: readonly CapabilityPrompt[];
}

/**
 * Every capability this account cannot use but was given something to show for,
 * grouped by the action attached to it.
 *
 * Grouping rather than one card per capability: the module currently points all
 * of them at the same place with the same label, so six separate cards would be
 * six copies of one button. Grouping collapses that without assuming it — a
 * module that gave two capabilities different destinations gets two groups, and
 * nothing is silently dropped.
 *
 * `exclude` is for capabilities that draw their own card elsewhere. Listing one
 * in both places would ask the same user for the same thing twice on the same
 * page.
 */
export function capabilityPrompts(
  capabilities: ProCapabilities,
  exclude: readonly (keyof ProCapabilities)[] = [],
): PromptGroup[] {
  type Group = { cta: CapabilityCta; prompts: CapabilityPrompt[] };

  const skip = new Set<string>(exclude);
  const groups = new Map<string, Group>();

  for (const [name, capability] of Object.entries(capabilities)) {
    if (skip.has(name)) continue;

    // Available, or absent from this build. Neither is a prompt.
    if (capability.available || !capability.cta) continue;

    const { cta } = capability;

    // Keyed on the pair rather than on the two joined by some character,
    // because every separator worth typing can also appear inside a label or an
    // href — and a collision there would hide one module's wording behind
    // another's, silently and only for some inputs.
    const key = JSON.stringify([cta.label, cta.href]);
    const group: Group = groups.get(key) ?? { cta, prompts: [] };

    group.prompts.push({
      name: name as keyof ProCapabilities,
      title: CAPABILITY_TITLES[name as keyof ProCapabilities] ?? name,
      blurb: cta.blurb,
    });

    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    label: group.cta.label,
    href: group.cta.href,
    prompts: group.prompts,
  }));
}
