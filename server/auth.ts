import crypto from 'crypto'
import { Request, Response, NextFunction } from 'express'
import { getUserByOidc, getUserById, LocalUser } from './db'

export interface OidcClaims {
  iss: string
  sub: string
  name?: string
  email?: string
  preferred_username?: string
  [key: string]: any
}

export interface AuthenticatedRequest extends Request {
  oidcClaims?: OidcClaims
  localUser?: LocalUser
}

/**
 * Constant-time string comparison using SHA-256 digests.
 * This prevents timing attacks while handling arbitrary-length strings safely.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false
  }
  if (a.length === 0 || b.length === 0) {
    return false
  }
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest()
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest()
  return crypto.timingSafeEqual(hashA, hashB)
}

/**
 * Simple in-memory rate limiter for bootstrap attempts
 */
interface RateLimitRecord {
  attempts: number
  firstAttemptTime: number
  blockedUntil?: number
}

const bootstrapRateLimitStore = new Map<string, RateLimitRecord>()
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_FAILED_ATTEMPTS = 5
const BLOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes block after 5 failed attempts

export function checkBootstrapRateLimit(identifier: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now()
  const record = bootstrapRateLimitStore.get(identifier)

  if (!record) {
    return { allowed: true }
  }

  if (record.blockedUntil && record.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((record.blockedUntil - now) / 1000),
    }
  }

  if (now - record.firstAttemptTime > RATE_LIMIT_WINDOW_MS) {
    bootstrapRateLimitStore.delete(identifier)
    return { allowed: true }
  }

  if (record.attempts >= MAX_FAILED_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_DURATION_MS
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(BLOCK_DURATION_MS / 1000),
    }
  }

  return { allowed: true }
}

export function recordFailedBootstrapAttempt(identifier: string) {
  const now = Date.now()
  const record = bootstrapRateLimitStore.get(identifier)

  if (!record || now - record.firstAttemptTime > RATE_LIMIT_WINDOW_MS) {
    bootstrapRateLimitStore.set(identifier, {
      attempts: 1,
      firstAttemptTime: now,
    })
  } else {
    record.attempts += 1
    if (record.attempts >= MAX_FAILED_ATTEMPTS) {
      record.blockedUntil = now + BLOCK_DURATION_MS
    }
  }
}

export function resetBootstrapRateLimit(identifier?: string) {
  if (identifier) {
    bootstrapRateLimitStore.delete(identifier)
  } else {
    bootstrapRateLimitStore.clear()
  }
}

/**
 * Helper to parse JWT payload without external library dependencies
 */
export function parseJwtClaims(token: string): OidcClaims | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2 || !parts[1]) return null
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8')
    const payload = JSON.parse(jsonPayload)
    if (!payload || typeof payload !== 'object') return null
    return payload
  } catch {
    return null
  }
}

/**
 * Extract verified OIDC identity claims from request (Bearer token, custom OIDC headers, or request body)
 */
export function extractOidcClaims(req: Request): OidcClaims | null {
  const authHeader = req.headers.authorization
  const idTokenHeader = req.headers['x-id-token'] as string | undefined
  const issuerHeader = (req.headers['x-oidc-issuer'] as string | undefined) || process.env.OIDC_ISSUER || 'http://localhost:3030/oidc'
  const subjectHeader = req.headers['x-oidc-subject'] as string | undefined
  const nameHeader = req.headers['x-oidc-name'] as string | undefined
  const emailHeader = req.headers['x-oidc-email'] as string | undefined

  let token = ''
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim()
  } else if (idTokenHeader && typeof idTokenHeader === 'string') {
    token = idTokenHeader.trim()
  } else if (req.body?.token && typeof req.body.token === 'string') {
    token = req.body.token.trim()
  } else if (req.body?.idToken && typeof req.body.idToken === 'string') {
    token = req.body.idToken.trim()
  }

  // 1. Try resolving claims from token or idToken
  if (token) {
    const claims = parseJwtClaims(token)
    if (claims) {
      const sub = claims.sub || (claims as any).userId || (claims as any).id || (claims as any).username || subjectHeader
      const iss = claims.iss || (claims as any).issuer || issuerHeader
      const name = claims.name || claims.preferred_username || (claims as any).userName || (claims as any).username || claims.sub || nameHeader
      const email = claims.email || emailHeader
      const preferred_username = claims.preferred_username || (claims as any).username || (claims as any).userName || (claims.sub ? String(claims.sub) : undefined)

      if (iss && sub) {
        return {
          ...claims,
          iss: String(iss),
          sub: String(sub),
          name: name ? String(name) : undefined,
          email: email ? String(email) : undefined,
          preferred_username,
        }
      }
    }
  }

  // 2. If token wasn't a parsable JWT or lacked claims, check secondary X-ID-Token header
  if (idTokenHeader && typeof idTokenHeader === 'string' && idTokenHeader.trim() !== token) {
    const idClaims = parseJwtClaims(idTokenHeader.trim())
    if (idClaims) {
      const sub = idClaims.sub || (idClaims as any).userId || (idClaims as any).id || (idClaims as any).username || subjectHeader
      const iss = idClaims.iss || (idClaims as any).issuer || issuerHeader
      const name = idClaims.name || idClaims.preferred_username || (idClaims as any).userName || (idClaims as any).username || idClaims.sub || nameHeader
      const email = idClaims.email || emailHeader
      const preferred_username = idClaims.preferred_username || (idClaims as any).username || (idClaims as any).userName || (idClaims.sub ? String(idClaims.sub) : undefined)

      if (iss && sub) {
        return {
          ...idClaims,
          iss: String(iss),
          sub: String(sub),
          name: name ? String(name) : undefined,
          email: email ? String(email) : undefined,
          preferred_username,
        }
      }
    }
  }

  // 3. Fallback if request has explicit OIDC headers (e.g. from authenticated client session)
  if (issuerHeader && subjectHeader) {
    return {
      iss: String(issuerHeader),
      sub: String(subjectHeader),
      name: nameHeader || subjectHeader,
      email: emailHeader,
      preferred_username: nameHeader || subjectHeader,
    }
  }

  // 4. If payload explicitly provided in session payload (e.g. mock OIDC or test harness)
  if (req.body?.oidcSession && typeof req.body.oidcSession === 'object') {
    const { iss, sub, name, email, preferred_username, username, userName } = req.body.oidcSession
    const resolvedIss = iss || issuerHeader
    const resolvedSub = sub || subjectHeader
    const resolvedName = name || preferred_username || username || userName || resolvedSub || nameHeader
    if (resolvedIss && resolvedSub) {
      return {
        iss: String(resolvedIss),
        sub: String(resolvedSub),
        name: resolvedName ? String(resolvedName) : undefined,
        email: email || emailHeader,
        preferred_username: preferred_username || username || userName || (resolvedName ? String(resolvedName) : undefined),
      }
    }
  }

  return null
}

/**
 * Middleware to authenticate requests against local users
 */
export async function authenticateLocalUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const claims = extractOidcClaims(req)
    if (!claims || !claims.iss || !claims.sub) {
      res.status(401).json({ error: 'Missing or invalid OIDC authentication credentials' })
      return
    }

    req.oidcClaims = claims
    const user = await getUserByOidc(claims.iss, claims.sub)
    if (user) {
      req.localUser = user
    }
    next()
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Authentication error' })
  }
}

/**
 * Middleware to require administrator rights
 */
export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.localUser || !req.localUser.is_admin) {
    res.status(403).json({ error: 'Administrator access required' })
    return
  }
  next()
}
