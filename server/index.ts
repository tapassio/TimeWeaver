import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDatabase } from './db'
import { apiRouter } from './routes/api'
import { timetableRouter } from './routes/timetable'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const app = express()
const PORT = process.env.PORT || 3000

// Middlewares
// CORS: Standard restricted, allowlisting via CORS_ORIGIN
// (Review #5: Previously permissive cross-origin resource sharing for all origins)
const corsOriginList = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim())
type CorsCallback = (err: Error | null, ok?: boolean) => void
const corsOptions = {
  origin: corsOriginList
    ? corsOriginList // explizit konfigurierte Origins (Prod-Konfiguration)
    : (origin: string | undefined, cb: CorsCallback) => {
      // Dev-Komfort: alle localhost/127-Origins erlauben (Vite-Dev-Port variiert);
      // fehlende CORS-Header blockieren Browser-Fetches sonst stillschweigend.
      if (!origin) return cb(null, true)
      try {
        const u = new URL(origin)
        const ok = u.hostname === "localhost" || u.hostname === "127.0.0.1"
        return cb(null, ok)
      } catch {
        return cb(null, false)
      }
    },
}
app.use(cors(corsOptions))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

/**
 * Optionale API-Token-Authentifizierung (Review #5):
 * Wenn API_AUTH_TOKEN gesetzt ist, muessen sämtliche /api-Requests
 * (ausser /api/health) einen `Authorization: Bearer <token>` mitsenden.
 * Bei Fallback hinter ein Auth-Gateway/OIDC Reverse Proxy kann dies nachweislich entfallen.
 */
const apiToken = process.env.API_AUTH_TOKEN
if (apiToken) {
  console.log('[Auth] API_AUTH_TOKEN aktiv — /api erfordert Bearer-Token')
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next()
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (token.length > 0 && token === apiToken) next()
    else res.status(401).json({ error: 'Unautorisiert: Bearer-Token erforderlich' })
  })
} else {
  console.warn('[Auth] API_AUTH_TOKEN nicht gesetzt — /api ist ungeschützt (nur hinter vertrauenswürdigem Netz/Gateway betreiben)')
}

// REST API routes
app.use('/api/timetable', timetableRouter)
import { outlookRouter } from './routes/outlook.js'
app.use('/api/outlook', outlookRouter)
app.use('/api', apiRouter)

// Serve production static assets if available
const distPath = path.resolve(__dirname, '../dist')
app.use(express.static(distPath))

// SPA fallback middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next()
  }
  const indexPath = path.join(distPath, 'index.html')
  res.sendFile(indexPath, err => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>CourseWeaver API Server</title></head>
          <body style="font-family: sans-serif; padding: 2rem;">
            <h1>CourseWeaver Express API Server</h1>
            <p>API is running at <a href="/api/health">/api/health</a>.</p>
            <p>For frontend development, run <code>npm run dev</code> or <code>npm run dev:client</code>.</p>
          </body>
        </html>
      `)
    }
  })
})

export async function startServer(port = PORT) {
  await initDatabase()
  // Kap. 6 — pgvector-Tabellen getrennt vom generischen entity_store initialisieren
  const { initEmbeddingsTable } = await import('./db')
  await initEmbeddingsTable().catch((e) => console.warn('[Database] Embeddings-Tabelle nicht angelegt:', e.message))
  return new Promise(resolve => {
    const server = app.listen(port, () => {
      console.log(`[Server] Express API server listening on http://localhost:${port}`)
      resolve(server)
    })
  })
}

// If executed directly
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)
if (isMainModule) {
  startServer()
}
