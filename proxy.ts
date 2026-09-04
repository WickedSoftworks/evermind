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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
