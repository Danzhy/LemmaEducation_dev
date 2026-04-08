const webpack = require('webpack')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @neondatabase/auth ships compiled ESM; including it here makes webpack transpile a very large tree
  // and can look "stuck" for many minutes on modest hardware.
  transpilePackages: [
    'tldraw',
    '@tldraw/editor',
    '@tldraw/store',
    '@tldraw/tlschema',
    '@tldraw/state',
    '@tldraw/state-react',
    '@tldraw/validate',
    '@tldraw/utils',
  ],
  // Very large client graphs (tldraw + Neon Auth UI) can stall during SWC minify on some machines.
  // `NEXT_DISABLE_SWC_MINIFY=1 npm run build` falls back to Terser — slower but often completes.
  swcMinify: process.env.NEXT_DISABLE_SWC_MINIFY !== '1',
  webpack: (config, { isServer }) => {
    // Reduce concurrent module work if builds OOM or “hang” with no CPU (memory thrashing).
    if (process.env.NEXT_WEBPACK_PARALLELISM) {
      const n = parseInt(process.env.NEXT_WEBPACK_PARALLELISM, 10)
      if (Number.isFinite(n) && n > 0) config.parallelism = n
    }

    if (process.env.NEXT_WEBPACK_PROGRESS === '1') {
      config.plugins.push(
        new webpack.ProgressPlugin((pct, message, ...args) => {
          const p = Math.round((pct ?? 0) * 100)
          const rest = args.join(' ')
          const loud =
            p >= 85 ||
            (message && /sealing|emitting|optimiz|minify|hash/i.test(message)) ||
            (p % 5 === 0 && p <= 80)
          if (loud) {
            process.stderr.write(`[webpack${isServer ? ':server' : ':client'}] ${p}% ${message} ${rest}\n`)
          }
        })
      )
    }
    return config
  },
}

module.exports = nextConfig
