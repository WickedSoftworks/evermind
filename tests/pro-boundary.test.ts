import { describe, expect, spyOn, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { capabilitiesFrom, NO_CAPABILITIES } from "@/lib/pro";
import type { ProCapabilities, ProModule } from "@/lib/pro/contract";
import { proRoute } from "@/lib/pro/shell";
import proStub from "@/pro-stub";
import proClientStub from "@/pro-stub/client";

/**
 * The open-core boundary, guarded by a test rather than by discipline.
 *
 * The design only works if the public repository stays ignorant of the
 * commercial edition: not "has a paid tier it does not enable", but has no
 * concept of payment in it at all. That property is invisible — nothing breaks
 * when it is violated, the build stays green, and the leak is a single import
 * somebody added in a hurry. So it is asserted here, where breaking it is loud.
 */

const ROOT = join(import.meta.dir, "..");

/**
 * The directories that ship in the public repository.
 *
 * `pro/` is deliberately not here: it is the private module, it is *supposed*
 * to import a payment processor, and on most checkouts it does not exist at all.
 */
const PUBLIC_TREES = ["app", "components", "hooks", "lib", "pro-stub", "scripts", "tests"];

/** Packages whose presence in the public tree would mean the boundary has leaked. */
const FORBIDDEN_PACKAGES = ["stripe", "@stripe/stripe-js", "@stripe/react-stripe-js"];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

function publicSourceFiles(): string[] {
  const files = PUBLIC_TREES.flatMap((tree) => sourceFiles(join(ROOT, tree)));
  // This file names the forbidden packages in order to look for them, so it
  // would otherwise be its own only failure.
  return files.filter((path) => path !== import.meta.path);
}

describe("the public tree knows nothing about billing", () => {
  test("no file imports a payment processor", () => {
    const offenders: string[] = [];

    for (const path of publicSourceFiles()) {
      const source = readFileSync(path, "utf8");
      for (const pkg of FORBIDDEN_PACKAGES) {
        // Matches `from "stripe"`, `require("stripe")` and `import("stripe")`,
        // and the subpaths of each, without matching a mention in prose.
        const imported = new RegExp(`(from|require\\(|import\\()\\s*["']${pkg}(/[^"']*)?["']`);
        if (imported.test(source)) {
          offenders.push(`${relative(ROOT, path).split(sep).join("/")} imports ${pkg}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("no payment processor is a dependency of the public package", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });

    expect(declared.filter((name) => FORBIDDEN_PACKAGES.includes(name))).toEqual([]);
  });

  test("the contract itself carries no billing vocabulary", () => {
    // The words a tier-aware design would reach for. Their absence is what
    // keeps consuming components asking "can I show this" rather than "has this
    // person paid" — the two questions have different answers in a self-hosted
    // install, and only the first one is answerable there.
    const contract = readFileSync(join(ROOT, "lib/pro/contract.ts"), "utf8");
    const code = contract.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

    for (const word of ["price", "plan", "tier", "subscription", "isPro", "purchase", "checkout"]) {
      expect(code.toLowerCase()).not.toInclude(word.toLowerCase());
    }
  });
});

describe("the stub", () => {
  test("reports itself absent", () => {
    expect(proStub.present).toBe(false);
  });

  test("offers no capability, and nothing to render in place of one", async () => {
    const capabilities = await proStub.capabilitiesFor("any-user");

    // The `cta` half is the load-bearing assertion. `available: false` with a
    // cta means "you have not bought this"; without one it means "this edition
    // does not have this", and a consumer must draw nothing at all. A stub that
    // grew a cta would put an upgrade prompt into every self-hosted install.
    for (const [name, capability] of Object.entries(capabilities)) {
      expect(`${name}: ${capability.available}`).toBe(`${name}: false`);
      expect(`${name}: ${"cta" in capability}`).toBe(`${name}: false`);
    }
  });

  test("returns every capability the contract declares", () => {
    // Guards against a capability being added to `ProCapabilities` and the stub
    // silently returning `undefined` for it, which is falsy in the right way
    // for the wrong reason and would crash `capability.available` reads.
    expect(Object.keys(NO_CAPABILITIES).sort()).toEqual(
      ["attachments", "calendarFeed", "canvasSync", "programmaticApi", "reminderRules", "retentionRules"].sort(),
    );
  });
});

describe("the stub's browser half", () => {
  test("reports itself absent and supplies no component", () => {
    // The same rule as the capabilities above, one layer out: a build without
    // the module has no optional components, so every consumer takes its
    // render-nothing branch. An entry appearing here would draw *something* in
    // a self-hosted install, and there is nothing it could honestly draw.
    expect(proClientStub.present).toBe(false);
    expect(Object.keys(proClientStub.sections)).toEqual([]);
  });

  test("imports nothing but the contract", () => {
    // This file is bundled for the browser in every public build. Keeping it to
    // a single type-only import is what makes that unremarkable — and the
    // private half is held to the same rule, from the other side, by
    // `pro/tests/client-boundary.test.ts`.
    const source = readFileSync(join(ROOT, "pro-stub", "client.ts"), "utf8");
    const specifiers = [...source.matchAll(/from\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(specifiers).toEqual(["@/lib/pro/contract"]);
  });
});

describe("a route shell with no handler behind it", () => {
  test("is a 404, not a 403 and not a 501", async () => {
    // The status is the assertion. A build without the module does not have a
    // disabled `/api/v1`; it does not have one. Anything other than 404 would
    // describe a feature the caller cannot reach — and would tell a scanner
    // which paths are worth a second look.
    const response = await proRoute("a-handler-this-build-does-not-have")(
      new Request("https://evermind.test/api/v1/assignments"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });
});

describe("a misbehaving module", () => {
  const throwing: Pick<ProModule, "capabilitiesFor"> = {
    capabilitiesFor() {
      return Promise.reject(new Error("the entitlement database is unreachable"));
    },
  };

  test("degrades closed rather than propagating", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(await capabilitiesFrom(throwing, "user-1")).toEqual(NO_CAPABILITIES);
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  test("a module that resolves is passed straight through", async () => {
    const everything: ProCapabilities = {
      calendarFeed: { available: true },
      canvasSync: { available: true },
      attachments: { available: true },
      reminderRules: { available: true },
      programmaticApi: { available: true },
      retentionRules: { available: true },
    };
    const working: Pick<ProModule, "capabilitiesFor"> = {
      capabilitiesFor: () => Promise.resolve(everything),
    };

    expect(await capabilitiesFrom(working, "user-1")).toEqual(everything);
  });
});
