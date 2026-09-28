import { Router, Response } from 'express'
import {
  AuthenticatedRequest,
  authenticateLocalUser,
  requireAdmin,
} from '../auth'
import {
  getAllUsers,
  getUserById,
  searchUsers,
  updateUser,
} from '../db'

export const usersRouter = Router()

/**
 * GET /api/users/search?q=...
 * Search users by name, email, or ID. Admin only.
 */
usersRouter.get('/search', authenticateLocalUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = String(req.query.q || '')
    if (!q || q.length < 1) {
      res.json([])
      return
    }
    const users = await searchUsers(q)
    res.json(users)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to search users' })
  }
})

/**
 * GET /api/users
 * Returns all local users. Admin only.
 */
usersRouter.get('/', authenticateLocalUser, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await getAllUsers()
    res.json(users)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch users' })
  }
})

/**
 * GET /api/users/:id
 * Returns a specific user. Admin only.
 */
usersRouter.get('/:id', authenticateLocalUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const user = await getUserById(id)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json(user)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch user' })
  }
})

/**
 * PATCH /api/users/:id
 * Updates roles, username (name), email, and admin status for a user. Admin only.
 */
usersRouter.patch('/:id', authenticateLocalUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const body = req.body || {}
    const updates: any = {}

    if (body.name !== undefined) {
      const trimmedName = String(body.name).trim()
      if (!trimmedName) {
        res.status(400).json({ error: 'Username cannot be empty' })
        return
      }
      updates.name = trimmedName
    }
    if (body.email !== undefined) {
      updates.email = String(body.email).trim()
    }
    if (body.local_name !== undefined) {
      updates.local_name = String(body.local_name).trim()
    }
    if (body.display_name !== undefined) {
      updates.display_name = String(body.display_name).trim()
    }
    if (body.is_active !== undefined) {
      updates.is_active = !!body.is_active
    }
    if (body.timezone !== undefined) {
      updates.timezone = String(body.timezone).trim()
    }
    if (body.is_admin !== undefined) {
      updates.is_admin = !!body.is_admin
      if (updates.is_admin) {
        updates.roles = Array.from(new Set([...(body.roles || ['admin'])]))
      }
    }
    if (body.roles !== undefined && Array.isArray(body.roles)) {
      updates.roles = body.roles
    }

    const updated = await updateUser(id, updates)
      .catch(err => {
        if (err.message === 'Cannot remove the last remaining administrator') {
          res.status(409).json({ error: err.message })
          return null
        }
        throw err
      })
    if (!updated) {
      if (!res.headersSent) {
        res.status(404).json({ error: 'User not found' })
      }
      return
    }
    res.json(updated)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update user' })
  }
})
