import { Router, Request, Response } from 'express'
import {
  extractOidcClaims,
  timingSafeEqualString,
  checkBootstrapRateLimit,
  recordFailedBootstrapAttempt,
  resetBootstrapRateLimit,
  AuthenticatedRequest,
  authenticateLocalUser,
} from '../auth'
import {
  getAdminCount,
  getUserByOidc,
  createOrUpdateUser,
  bootstrapAdminUser,
} from '../db'

export const authRouter = Router()

/**
 * GET /api/auth/bootstrap-status
 * Checks if the system requires first-administrator bootstrap.
 * Note: Never exposes the secret or sensitive credentials.
 */
authRouter.get('/bootstrap-status', async (_req: Request, res: Response) => {
  try {
    const adminCount = await getAdminCount()
    const bootstrapRequired = adminCount === 0
    res.json({
      bootstrapRequired,
      adminCount,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to check bootstrap status' })
  }
})

/**
 * POST /api/auth/login
 * Validates OIDC session/token and resolves or provisions a local user.
 * If no admin exists, bootstrap mode is required and local user is NOT created yet.
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const claims = extractOidcClaims(req)
    if (!claims || !claims.iss || !claims.sub) {
      res.status(401).json({ error: 'Missing or invalid OIDC credentials' })
      return
    }

    const adminCount = await getAdminCount()

    // If no admin exists, bootstrap is required; do NOT create a standard local user
    if (adminCount === 0) {
      const existingUser = await getUserByOidc(claims.iss, claims.sub)
      res.json({
        authenticated: true,
        bootstrapRequired: true,
        user: existingUser && existingUser.is_admin ? existingUser : null,
        message: 'Administrator bootstrap is required before accessing the system',
      })
      return
    }

    // Normal startup state with existing admin: resolve or provision local user
    const name = claims.name || claims.preferred_username || (claims as any).userName || (claims as any).username || claims.sub || 'User'
    const email = claims.email || ''
    const user = await createOrUpdateUser({
      oidc_issuer: claims.iss,
      oidc_subject: claims.sub,
      name,
      email,
      roles: ['user'],
      is_admin: false,
    })

    res.json({
      authenticated: true,
      bootstrapRequired: false,
      user,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Authentication error' })
  }
})

/**
 * POST /api/auth/bootstrap-admin
 * Securely creates the first local administrator using the deployment bootstrap secret.
 */
authRouter.post('/bootstrap-admin', async (req: Request, res: Response) => {
  try {
    const claims = extractOidcClaims(req)
    if (!claims || !claims.iss || !claims.sub) {
      res.status(401).json({ error: 'Missing or invalid OIDC authentication credentials' })
      return
    }

    // Rate limiting check
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown_ip'
    const rateLimitIdentifier = `${clientIp}_${claims.iss}_${claims.sub}`
    const rateCheck = checkBootstrapRateLimit(rateLimitIdentifier)

    if (!rateCheck.allowed) {
      res.status(429).json({
        error: 'Too many failed bootstrap attempts. Please try again later.',
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      })
      return
    }

    // Verify configured secret exists
    const configuredSecret = process.env.BOOTSTRAP_ADMIN_SECRET
    if (!configuredSecret) {
      res.status(500).json({
        error: 'Server configuration error: BOOTSTRAP_ADMIN_SECRET is not configured on the deployment',
      })
      return
    }

    // Verify user supplied secret in constant time
    const suppliedSecret = req.body?.bootstrapSecret
    if (
      !suppliedSecret ||
      typeof suppliedSecret !== 'string' ||
      !timingSafeEqualString(suppliedSecret, configuredSecret)
    ) {
      recordFailedBootstrapAttempt(rateLimitIdentifier)
      res.status(401).json({ error: 'Invalid bootstrap secret' })
      return
    }

    // Atomically check bootstrap state and create initial administrator
    const name = claims.name || claims.preferred_username || (claims as any).userName || (claims as any).username || claims.sub || 'Administrator'
    const email = claims.email || ''
    const result = await bootstrapAdminUser({
      oidc_issuer: claims.iss,
      oidc_subject: claims.sub,
      name,
      email,
    })

    if (!result.success) {
      res.status(409).json({ error: result.error || 'Administrator already exists. Bootstrap is disabled.' })
      return
    }

    // Reset rate limit on success
    resetBootstrapRateLimit(rateLimitIdentifier)

    res.status(201).json({
      success: true,
      bootstrapRequired: false,
      user: result.user,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Bootstrap failed' })
  }
})

/**
 * GET /api/auth/me
 * Retrieves current authenticated user profile from the database
 */
authRouter.get('/me', authenticateLocalUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.localUser) {
      res.status(404).json({ error: 'Local user record not found' })
      return
    }

    res.json({
      authenticated: true,
      user: req.localUser,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to retrieve user profile' })
  }
})
