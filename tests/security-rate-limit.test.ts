import { describe, expect, test } from "bun:test";
import { clientAddress, rateLimit, tooManyRequests } from "@/lib/security/rate-limit";

/**
 * The limiter's state is a module-level map shared by the whole process, and
 * these tests run in one. Every test therefore uses a key of its own rather
 * than resetting anything — which also matches how the routes use it, since a
 * key always carries the subject it is limiting.
 */

let keySeq = 0;
const uniqueKey = (name: string) => `${name}:${keySeq++}`;

describe("rateLimit", () => {
  test("allows exactly `limit` hits, then blocks", () => {
    const key = uniqueKey("burst");

    for (let hit = 1; hit <= 3; hit++) {
      expect(rateLimit(key, 3, 60_000).allowed).toBe(true);
    }

    expect(rateLimit(key, 3, 60_000).allowed).toBe(false);
  });

  test("stays blocked once over the limit", () => {
    const key = uniqueKey("sustained");
    rateLimit(key, 1, 60_000);

    expect(rateLimit(key, 1, 60_000).allowed).toBe(false);
    expect(rateLimit(key, 1, 60_000).allowed).toBe(false);
  });

  // The key carries the subject, so one user hitting their limit must not lock
  // anybody else out.
  test("keys are counted independently", () => {
    const mine = uniqueKey("export");
    const theirs = uniqueKey("export");

    rateLimit(mine, 1, 60_000);
    expect(rateLimit(mine, 1, 60_000).allowed).toBe(false);
    expect(rateLimit(theirs, 1, 60_000).allowed).toBe(true);
  });

  test("the window reopens once it has elapsed", async () => {
    const key = uniqueKey("window");

    expect(rateLimit(key, 1, 10).allowed).toBe(true);
    expect(rateLimit(key, 1, 10).allowed).toBe(false);

    await Bun.sleep(25);

    expect(rateLimit(key, 1, 10).allowed).toBe(true);
  });

  test("retryAfter is whole seconds, and never zero while blocked", () => {
    const key = uniqueKey("retry");
    rateLimit(key, 1, 5_000);
    const blocked = rateLimit(key, 1, 5_000);

    expect(blocked.allowed).toBe(false);
    expect(Number.isInteger(blocked.retryAfter)).toBe(true);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfter).toBeLessThanOrEqual(5);
  });

  // A sub-second remainder rounds up rather than down to a `Retry-After: 0`
  // that would invite an immediate retry.
  test("a window with under a second left still asks for one", () => {
    const key = uniqueKey("rounding");
    rateLimit(key, 1, 200);

    expect(rateLimit(key, 1, 200).retryAfter).toBe(1);
  });

  test("an allowed hit has nothing to wait for", () => {
    expect(rateLimit(uniqueKey("allowed"), 5, 60_000)).toEqual({ allowed: true, retryAfter: 0 });
  });
});

describe("tooManyRequests", () => {
  test("is a 429 carrying Retry-After and the message the user will read", async () => {
    const response = tooManyRequests({ allowed: false, retryAfter: 42 }, "Too many exports. Try again shortly.");

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(await response.json()).toEqual({ error: "Too many exports. Try again shortly." });
  });
});

describe("clientAddress", () => {
  const requestWith = (headers: Record<string, string>) => new Request("https://evermind.example/api", { headers });

  test("takes the client from the front of x-forwarded-for", () => {
    expect(clientAddress(requestWith({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" }))).toBe(
      "203.0.113.7",
    );
  });

  test("trims the entry", () => {
    expect(clientAddress(requestWith({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7");
  });

  test("falls back to x-real-ip", () => {
    expect(clientAddress(requestWith({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  test("prefers x-forwarded-for when both are present", () => {
    expect(clientAddress(requestWith({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.4" }))).toBe(
      "203.0.113.7",
    );
  });

  // Everything unattributable shares one bucket, which is the conservative
  // choice: it limits, rather than exempts, requests we cannot identify.
  test("unidentifiable callers share a single key", () => {
    expect(clientAddress(requestWith({}))).toBe("unknown");
  });
});
