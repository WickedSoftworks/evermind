/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

export default nextConfig;
