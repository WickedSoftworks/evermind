import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { contentSecurityPolicy, generateNonce } from "@/lib/security-headers";

/**
 * The policy is rebuilt per request because it carries a nonce, so both halves
 * matter: that the nonce is actually unpredictable and actually different every
 * time, and that the directives say what they are meant to say.
 *
 * `contentSecurityPolicy` reads `process.env` on every call, so each test sets
 * the environment it needs and puts back whatever the developer's own `.env`
 * had — bun loads it automatically.
 */

const TOUCHED = ["NEXT_PUBLIC_SUPABASE_URL", "NODE_ENV"];
let saved: Record<string, string | undefined> = {};

/** Next's types declare `NODE_ENV` read-only; the indexed form is the way past that. */
function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((name) => [name, process.env[name]]));
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) setEnv(name, value);
});

/** The values of one directive, so an assertion does not depend on where it sits in the string. */
function directive(policy: string, name: string): string[] {
  const found = policy.split("; ").find((part) => part === name || part.startsWith(`${name} `));
  if (found === undefined) return [];
  return found.split(" ").slice(1);
}

describe("generateNonce", () => {
  test("is 16 bytes of randomness, base64 encoded", () => {
    const nonce = generateNonce();

    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(atob(nonce).length).toBe(16);
  });

  // A nonce that repeats is worth nothing: it lets an injected script reuse a
  // value the attacker has already seen.
  test("never repeats", () => {
    const nonces = new Set(Array.from({ length: 500 }, generateNonce));

    expect(nonces.size).toBe(500);
  });
});

describe("contentSecurityPolicy", () => {
  test("carries the nonce it was given, and only that one", () => {
    const policy = contentSecurityPolicy("Rk9PQkFSRk9PQkFSRk8=");

    expect(directive(policy, "script-src")).toContain("'nonce-Rk9PQkFSRk9PQkFSRk8='");
    expect(policy.match(/'nonce-/g)?.length).toBe(1);
  });

  // `strict-dynamic` is what lets Next's nonced bootstrap load the chunk graph
  // without allowlisting a host. Browsers that honour it ignore `https:` and
  // `'unsafe-inline'`; browsers that do not, ignore the nonce and use those.
  test("script-src pairs a nonce with strict-dynamic and a CSP2 fallback", () => {
    const scriptSrc = directive(contentSecurityPolicy("abc"), "script-src");

    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).toContain("https:");
    expect(scriptSrc).toContain("'unsafe-inline'");
  });

  test("the directives that close off injection are locked down", () => {
    const policy = contentSecurityPolicy("abc");

    expect(directive(policy, "default-src")).toEqual(["'self'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
    // The app holds a live session, so it must not be framable at all.
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "frame-src")).toEqual(["'none'"]);
  });

  test("is a single well-formed header value", () => {
    const policy = contentSecurityPolicy("abc");

    expect(policy).not.toContain("\n");
    expect(policy.endsWith(";")).toBe(false);
    for (const part of policy.split("; ")) {
      expect(part).toMatch(/^[a-z-]+ .+$/);
    }
  });

  describe("connect-src", () => {
    test("lets the browser reach the deployment's own Supabase project, over both protocols", () => {
      setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefgh.supabase.co");
      const connectSrc = directive(contentSecurityPolicy("abc"), "connect-src");

      expect(connectSrc).toContain("'self'");
      expect(connectSrc).toContain("https://abcdefgh.supabase.co");
      expect(connectSrc).toContain("wss://abcdefgh.supabase.co");
    });

    // Self-hosters point this at their own domain, sometimes on a port.
    test("follows a self-hosted Supabase URL", () => {
      setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.org:8443/");
      const connectSrc = directive(contentSecurityPolicy("abc"), "connect-src");

      expect(connectSrc).toContain("https://supabase.example.org:8443");
      expect(connectSrc).toContain("wss://supabase.example.org:8443");
    });

    // A build without the variable, or with a typo in it, must still produce a
    // usable policy rather than a header containing "undefined".
    test("omits Supabase entirely when the URL is missing or unparseable", () => {
      for (const value of [undefined, "", "not a url"]) {
        setEnv("NEXT_PUBLIC_SUPABASE_URL", value);

        const policy = contentSecurityPolicy("abc");

        expect(directive(policy, "connect-src")).toEqual(["'self'", "https://va.vercel-scripts.com"]);
        expect(policy).not.toContain("undefined");
      }
    });
  });

  describe("unsafe-eval", () => {
    test("is absent in production", () => {
      setEnv("NODE_ENV", "production");

      expect(directive(contentSecurityPolicy("abc"), "script-src")).not.toContain("'unsafe-eval'");
    });

    // The dev server compiles modules with eval, so refusing it there just
    // breaks `bun run dev`.
    test("is allowed anywhere else, because the dev server needs it", () => {
      setEnv("NODE_ENV", "development");

      expect(directive(contentSecurityPolicy("abc"), "script-src")).toContain("'unsafe-eval'");
    });
  });
});
