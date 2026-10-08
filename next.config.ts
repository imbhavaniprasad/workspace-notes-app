import type { NextConfig } from 'next';

// Cache Components is off on purpose: every page here is per-user, tenant-scoped
// data, so there is no static shell worth prerendering, and not caching tenant
// data removes a whole class of cross-tenant cache bugs. See README trade-offs.
const nextConfig: NextConfig = {
  // Pin the workspace root (a stray lockfile in a parent folder confuses detection).
  turbopack: { root: __dirname },
};

export default nextConfig;
