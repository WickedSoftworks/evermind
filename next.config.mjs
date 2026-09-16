import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Which implementation of the optional-feature module this build gets.
//
// `pro/` is a private git submodule, so on a clone without access to it the
// directory is either missing or present-but-empty — hence testing for the
// entry file rather than the directory. The choice is made here, once, at
// config time: there is no runtime branch and no environment variable, and a
// build without the submodule simply does not contain the code.
//
// The module has two entry points, chosen together and never separately. The
// second carries the components that have to run in a browser, and exists
// because the first cannot: it reaches a database client and a service-role
// key. See `lib/pro/client.ts`.
const proEntry = fileURLToPath(new URL("./pro/index.ts", import.meta.url));
const proPresent = existsSync(proEntry);
const proModulePath = proPresent ? "./pro/index.ts" : "./pro-stub/index.ts";
const proClientPath = proPresent ? "./pro/client.ts" : "./pro-stub/client.ts";

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      "@pro": proModulePath,
      "@pro/client": proClientPath,
    },
  },
  // `.next/standalone` — a self-contained server with only the dependencies it
  // actually traced — is what the Dockerfile copies into the runtime image.
  // Opt-in rather than always on, so the Vercel deployment keeps building the
  // way it already does.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    // Optimize package imports to reduce bundle size
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "recharts",
    ],
  },
  // Compiler optimizations
  compiler: {
    // There was a configuration to remove console logging in prod
    // I personally think it's dumb ngl it makes it difficult to pin
    // down an error, you can uncomment it if you want
    // removeConsole: process.env.NODE_ENV === "production",
  },
  // `/pro` is a shell whose body comes from the optional module (see
  // `app/pro/page.tsx`). Without that module the page calls `notFound()`, which
  // renders the right thing — and answers **200**, which is the wrong status.
  //
  // The cause is `app/loading.tsx`. A root loading file wraps every route in a
  // Suspense boundary, so a dynamic page starts streaming its shell before the
  // component runs; by the time `notFound()` throws, the 200 has been sent.
  // That is true of any `notFound()` in this app, and removing the loading file
  // to fix one route would be a poor trade.
  //
  // So the route is taken away instead of refused. Rewriting to a path that
  // matches no file means Next never routes to the page at all, and answers its
  // own 404 — real status, and `app/not-found.tsx` for the body. Unmatched
  // routes are resolved before rendering, so no shell is streamed first.
  //
  // The destination is deliberately a path nothing will ever serve. If you add
  // a catch-all under `app/pro/`, this stops working and must be revisited.
  rewrites() {
    if (proPresent) return [];

    return {
      beforeFiles: [{ source: "/pro", destination: "/pro/not-in-this-build" }],
      afterFiles: [],
      fallback: [],
    };
  },
  // Content-Security-Policy is not here: it carries a per-request nonce, so it is set
  // by the proxy instead (see lib/security-headers.ts). These are static, and being
  // here means they also cover the static assets the proxy does not run for.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            // Two years, matching the preload list's minimum. Only add `preload` once
            // you are certain every subdomain will stay on HTTPS - it is hard to undo.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            // Belt and braces with the CSP's `frame-ancestors 'none'`, for old browsers.
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // The app asks for none of these, so deny them outright.
            key: "Permissions-Policy",
            value:
              "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
          },
          {
            // Isolates the session from anything this page opens or is opened by.
            // OAuth here is a full redirect, so popups are only used by dev tooling.
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
