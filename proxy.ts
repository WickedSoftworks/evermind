import type { NextRequest } from "next/server";
import { contentSecurityPolicy, generateNonce } from "@/lib/security-headers";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = contentSecurityPolicy(nonce);

  // Both go on the *request*: Next.js reads the policy to nonce the scripts it emits,
  // and the root layout reads `x-nonce` to nonce the two theme scripts it emits.
  const response = await updateSession(request, {
    "x-nonce": nonce,
    "content-security-policy": csp,
  });

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Three routes are excluded deliberately, for the same reason.
  //
  // `updateSession` calls `auth.getUser()` unconditionally, before any path
  // branching — a Supabase round trip on every request that reaches here. None
  // of these routes has a session cookie to refresh, so that round trip is pure
  // latency on a path where latency is the whole complaint:
  //
  //   api/pro/webhook     a machine-to-machine callback whose caller abandons
  //                       the request after about ten seconds
  //   api/v1              authenticated by a bearer token, called by scripts in
  //                       a loop rather than by a browser once a page
  //   api/pro/calendar/…  a calendar document, fetched on a timer by Google,
  //                       Apple and Outlook, whose credential is the path
  //
  // Note the trailing slash on the third, and that it is load-bearing. The feed
  // is `api/pro/calendar/<token>.ics`; the *settings* endpoint is
  // `api/pro/calendar` with nothing after it, and that one is an ordinary
  // cookie-authenticated route which does need its session refreshed. Dropping
  // the slash would exclude both, and the symptom would be a settings card that
  // works until an access token expires and then quietly stops.
  //
  // In a build without the optional module all three are 404s either way, so
  // these exclusions are harmless there rather than conditional.
  //
  // It costs the CSP header, which none of a callback, a JSON API or a calendar
  // file has any use for — nothing renders their responses.
  matcher: [
    "/((?!api/pro/webhook|api/pro/calendar/|api/v1|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
