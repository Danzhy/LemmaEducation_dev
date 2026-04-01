/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure tldraw and its deps are bundled as single instances (avoids duplicate module warning)
  transpilePackages: ['tldraw', '@tldraw/editor', '@tldraw/store', '@tldraw/tlschema', '@tldraw/state', '@tldraw/state-react', '@tldraw/validate', '@tldraw/utils'],
}

module.exports = nextConfig
