import { describe, expect, test } from "bun:test";
import { NO_CAPABILITIES } from "@/lib/pro";
import type { Capability, ProCapabilities } from "@/lib/pro/contract";
import { CAPABILITY_TITLES, capabilityPrompts } from "@/lib/pro/prompts";

/**
 * What gets drawn in place of a feature this account cannot use.
 *
 * The contract's three states are only worth having if the consumer honours all
 * three, and two of them are easy to get wrong in ways nothing else would
 * catch: drawing something for a capability the build does not have puts an
 * advertisement into a self-hosted install, and drawing something for an
 * available capability puts a nag in front of somebody who already paid.
 * Neither breaks a page, so neither would fail any other test here.
 */

function locked(blurb: string, label = "Unlock Pro", href = "/pro"): Capability {
  return { available: false, cta: { label, href, blurb } };
}

/** Every capability off with nothing to show, which is the self-hosted answer. */
const SELF_HOSTED: ProCapabilities = NO_CAPABILITIES;

const ALL_LOCKED: ProCapabilities = {
  calendarFeed: locked("a calendar feed"),
  canvasSync: locked("canvas sync"),
  attachments: locked("attachments"),
  reminderRules: locked("reminders"),
  programmaticApi: locked("an api"),
  retentionRules: locked("retention"),
};

describe("a build with no optional module", () => {
  test("draws nothing at all", () => {
    // The load-bearing assertion in this file. `available: false` with no cta
    // means the capability does not exist here, not that it is for sale.
    expect(capabilityPrompts(SELF_HOSTED)).toEqual([]);
  });

  test("still draws nothing when every capability is asked about by name", () => {
    for (const name of Object.keys(NO_CAPABILITIES) as (keyof ProCapabilities)[]) {
      expect(`${name}: ${capabilityPrompts(SELF_HOSTED, []).length}`).toBe(`${name}: 0`);
    }
  });
});

describe("an available capability", () => {
  test("is never drawn", () => {
    const owned: ProCapabilities = { ...ALL_LOCKED, programmaticApi: { available: true } };
    const names = capabilityPrompts(owned).flatMap((group) => group.prompts.map((prompt) => prompt.name));

    expect(names).not.toContain("programmaticApi");
    expect(names).toHaveLength(5);
  });

  test("and when everything is available, there is no card", () => {
    // Written out rather than mapped, so adding a capability to the contract
    // makes this fail to compile instead of quietly testing five of six.
    const everything: ProCapabilities = {
      calendarFeed: { available: true },
      canvasSync: { available: true },
      attachments: { available: true },
      reminderRules: { available: true },
      programmaticApi: { available: true },
      retentionRules: { available: true },
    };

    expect(capabilityPrompts(everything)).toEqual([]);
  });
});

describe("grouping", () => {
  test("capabilities sharing one action are offered it once", () => {
    const groups = capabilityPrompts(ALL_LOCKED);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Unlock Pro");
    expect(groups[0].href).toBe("/pro");
    expect(groups[0].prompts).toHaveLength(6);
  });

  test("a different action is a different group, not a dropped one", () => {
    // The case that would be a silent data loss if the key were wrong: two ctas
    // that differ must not collapse into one.
    const mixed: ProCapabilities = {
      ...ALL_LOCKED,
      attachments: locked("attachments", "See what is planned", "/pro"),
    };

    const groups = capabilityPrompts(mixed);
    const total = groups.reduce((count, group) => count + group.prompts.length, 0);

    expect(groups).toHaveLength(2);
    expect(total).toBe(6);
  });

  test("a label and href that could be confused by a naive join stay apart", () => {
    // "a b" + "/c" and "a" + "b /c" join to the same string under a space.
    const collidable: ProCapabilities = {
      ...SELF_HOSTED,
      calendarFeed: locked("one", "a b", "/c"),
      canvasSync: locked("two", "a", "b /c"),
    };

    expect(capabilityPrompts(collidable)).toHaveLength(2);
  });
});

describe("the wording", () => {
  test("the blurb comes from the module, verbatim", () => {
    // Including the case the module uses for somebody who has already paid:
    // this function must not be able to tell "buy this" from "this is coming".
    const planned: ProCapabilities = {
      ...SELF_HOSTED,
      attachments: locked("Included in your purchase — it will appear here when it ships.", "See what is planned"),
    };

    const [group] = capabilityPrompts(planned);

    expect(group.label).toBe("See what is planned");
    expect(group.prompts[0].blurb).toBe("Included in your purchase — it will appear here when it ships.");
  });

  test("every capability in the contract has a title", () => {
    // A missing entry would render a blank row rather than fail anything.
    expect(Object.keys(CAPABILITY_TITLES).sort()).toEqual(Object.keys(NO_CAPABILITIES).sort());
    for (const [name, title] of Object.entries(CAPABILITY_TITLES)) {
      expect(`${name}: ${title.trim().length > 0}`).toBe(`${name}: true`);
    }
  });

  test("no title reads like a price or a plan", () => {
    // These are public strings describing what a capability does. The moment
    // one of them names a tier, the public tree is carrying the vocabulary
    // `tests/pro-boundary.test.ts` keeps out of the contract.
    for (const title of Object.values(CAPABILITY_TITLES)) {
      for (const word of ["pro", "plan", "tier", "premium", "upgrade", "£", "$"]) {
        expect(`${title}: ${title.toLowerCase().includes(word)}`).toBe(`${title}: false`);
      }
    }
  });
});

describe("exclusions", () => {
  test("a capability drawing its own card elsewhere is left out", () => {
    const groups = capabilityPrompts(ALL_LOCKED, ["programmaticApi", "retentionRules"]);
    const names = groups.flatMap((group) => group.prompts.map((prompt) => prompt.name));

    expect(names.sort()).toEqual(["attachments", "calendarFeed", "canvasSync", "reminderRules"]);
  });

  test("excluding everything leaves no card", () => {
    const all = Object.keys(NO_CAPABILITIES) as (keyof ProCapabilities)[];

    expect(capabilityPrompts(ALL_LOCKED, all)).toEqual([]);
  });
});
