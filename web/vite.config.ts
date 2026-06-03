import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 開発時は /api へのリクエストを Cloudflare Workers (wrangler dev) へ転送する。
    // これがないとフロント(5173)から Worker(8787) のプロキシに届かない。
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
