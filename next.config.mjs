// Plain JS (not .ts) so `next start` doesn't need TypeScript, which the
// Docker image leaves out.
/** @type {import("next").NextConfig} */
const nextConfig = {
  // WebTorrent uses native modules that aren't compatible with Turbopack
  serverExternalPackages: [
    "webtorrent",
    "node-datachannel",
    "webrtc-polyfill",
    "@thaunknown/simple-peer",
  ],
  // TV browsers cache pages hard; after a rebuild they'd keep the old HTML
  // pointing at old CSS. Pages are never cached; hashed assets still are.
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|api/).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
