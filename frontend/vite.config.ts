import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import dotenv from 'dotenv'

// Root-.env laden (OIDC_ISSUER & Co. siehe useOidc.ts Fallback import.meta.env.OIDC_*)
// — bewusst für define statt envDir, damit POSTGRES_PASSWORD etc. NICHT in den
// Browser-Build gelangen (envDir würde alle Prefix-Env-Vars exponieren).
const __dirnameVite = () => path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirnameVite(), '../.env') })

/** Root-.env-Variable als statischer import.meta.env-Eintrag (nur die nötigen OIDC-Werte). */
function defineOidcEnv(): Record<string, string> {
  const defines: Record<string, string> = {}
  for (const key of ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_PROVIDER_NAME', 'OIDC_REGISTRATION_TOKEN']) {
    defines[`import.meta.env.${key}`] = JSON.stringify(process.env[key] ?? '')
  }
  return defines
}

export default defineConfig({
  envPrefix: ['VITE_', 'APP_', 'DATABASE_', 'POSTGRES_', 'OIDC_'],
  define: defineOidcEnv(),
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
  ],
  build: {
    // Auslieferung durch server/index.ts bleibt dist/ im Projekt-Root
    outDir: path.resolve(__dirnameVite(), '../dist'),
    emptyOutDir: true,
  },  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        // Backend-Port per SERVER_PORT überschreibbar (Default 3000; Port ist ggf. durch Flowise belegt)
        target: process.env.SERVER_PORT ? `http://localhost:${process.env.SERVER_PORT}` : 'http://localhost:3000',
        changeOrigin: true,
      },
      '/oidc': {
        target: 'http://localhost:3030',
        changeOrigin: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const host = req.headers.host || 'localhost:5173'
            proxyReq.setHeader('x-forwarded-host', host)
            proxyReq.setHeader('x-forwarded-proto', req.headers['x-forwarded-proto'] || 'http')
          })
        },
      },
      '/socket.io': {
        target: 'http://localhost:3030',
        ws: true,
      },
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
