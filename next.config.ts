import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Fully static build in ./out, served by Cloudflare Workers static assets
  output: "export",
  // Emit /en/index.html instead of /en.html
  trailingSlash: true,
  // The default image loader needs a server; pre-optimise images instead
  images: { unoptimized: true },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
