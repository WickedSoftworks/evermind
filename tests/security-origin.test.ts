import { describe, expect, test } from "bun:test";
import { isSameOriginRequest } from "@/lib/security/origin";

/**
 * The guard on `POST /api/account/delete`. It is the last thing standing
 * between a cross-site form post and an irreversible account deletion, so the
 * cases below are written as "what would an attacker's page send".
 */

const URL_UNDER_TEST = "https://evermind.example/api/account/delete";

function request(headers: Record<string, string>, url = URL_UNDER_TEST): Request {
  return new Request(url, { method: "POST", headers });
}

describe("Sec-Fetch-Site", () => {
  test("accepts a request from one of our own pages", () => {
    expect(isSameOriginRequest(request({ "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  test("rejects everything else the browser can report", () => {
    for (const value of ["cross-site", "same-site", "none"]) {
      expect(isSameOriginRequest(request({ "sec-fetch-site": value }))).toBe(false);
    }
  });

  // A sibling subdomain is same-site but not same-origin, and a destructive
  // endpoint has no reason to accept one.
  test("a sibling subdomain is not good enough", () => {
    const req = request({ "sec-fetch-site": "same-site", origin: "https://blog.evermind.example" });

    expect(isSameOriginRequest(req)).toBe(false);
  });

  // The header is set by the browser and unreachable from page JavaScript, so
  // when it is present it is the whole answer — a forged Origin cannot rescue it.
  test("takes precedence over a matching Origin", () => {
    const req = request({ "sec-fetch-site": "cross-site", origin: "https://evermind.example" });

    expect(isSameOriginRequest(req)).toBe(false);
  });
});

describe("Origin fallback", () => {
  test("accepts a matching host for browsers too old to send Sec-Fetch-Site", () => {
    expect(isSameOriginRequest(request({ origin: "https://evermind.example" }))).toBe(true);
  });

  test("rejects a different host", () => {
    expect(isSameOriginRequest(request({ origin: "https://attacker.example" }))).toBe(false);
  });

  test("rejects a host that merely looks like ours", () => {
    for (const origin of [
      "https://evermind.example.attacker.example",
      "https://notevermind.example",
      "https://evermind.example:8443",
    ]) {
      expect(isSameOriginRequest(request({ origin }))).toBe(false);
    }
  });

  // Only the host is compared: behind a TLS-terminating proxy Next sees `http:`
  // internally while the browser reports `https:`, and an attacker's page is on
  // a different host either way.
  test("ignores the scheme, which a reverse proxy rewrites", () => {
    const req = request({ origin: "https://evermind.example" }, "http://evermind.example/api/account/delete");

    expect(isSameOriginRequest(req)).toBe(true);
  });

  test("rejects an Origin that is not a URL", () => {
    for (const origin of ["null", "not a url", "://"]) {
      expect(isSameOriginRequest(request({ origin }))).toBe(false);
    }
  });
});

// Nothing in the app makes such a request; only a non-browser client would.
test("a request carrying neither header is rejected", () => {
  expect(isSameOriginRequest(request({}))).toBe(false);
});
