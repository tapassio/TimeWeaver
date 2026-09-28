/**
 * Generische Entity-CRUD für den JSONB/entity_store (alle Programm-Objekte).
 * Mit Tabellen-Allowlist (Review) für bekannte Entitäten.
 */
import { Router, Request, Response } from 'express'
import {
  getAllEntities,
  getEntityById,
  saveEntity,
  deleteEntity,
  isDbConnected,
  getEntityAdmins,
  addEntityAdmin,
  removeEntityAdmin,
  isEntityAdmin,
  getEntitiesWhereUserIsAdmin,
  getUserByOidc,
  getAllUsers,
} from '../db'
import { authRouter } from './auth'
import { usersRouter } from './users'
import { extractOidcClaims } from '../auth'

const SUPERUSER_TABLES = new Set(['curriculum_versions', 'semesters', 'lessons', 'lecturers', 'weeks', 'schedule_entries'])

/**
 * Allowlist gültiger Entity-Tabellen (Review #5): beliebige Tabellennamen
 * konnten ohne Prüfung generiert werden. Ergänzungen bewusst hier und im
 * Client zentral erweitern.
 */
export const ALLOWED_ENTITY_TABLES = new Set([
  'curriculum_versions',
  'study_programs',
  'programs',
  'modules',
  'learning_cycles',
  'curriculum_modules',
  'semesters',
  'terms',
  'themes',
  'lessons',
  'rooms',
  'locations',
  'lecturers',
  'instructors',
  'instructor_availability',
  'contact_blocks',
  'communications',
  'rubrics',
  'taxonomy_items',
  'objectives',
  'objective_relationships',
  'objective_mappings',
  'competencies',
  'competency_frameworks',
  'proof_of_knowledge',
  'proofs_of_knowledge',
  'assessment_results',
  'assessments',
  'improvement_actions',
  'administrators',
  'todos',
  'mapping_reviews',
])

function requireEntity(entity: string, res: Response): string | null {
  if (ALLOWED_ENTITY_TABLES.has(entity)) return entity
  res.status(404).json({ error: `Unbekannte Entity-Tabelle: ${entity}` })
  return null
}

export const apiRouter = Router()

// Health check endpoint
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    databaseConnected: isDbConnected(),
    timestamp: new Date().toISOString(),
  })
})

// Authentication & bootstrap routes
apiRouter.use('/auth', authRouter)

// User & role management routes
apiRouter.use('/users', usersRouter)

// ─── ACL Admin Routes ──────────────────────────────────────────────────────────

// GET admins for an entity
apiRouter.get('/:entity/:id/admins', async (req: Request, res: Response) => {
  try {
    const entity = String(req.params.entity)
    const id = String(req.params.id)
    const admins = await getEntityAdmins(entity, id)
    const users = await getAllUsers()
    const enriched = admins.map(acl => {
      const user = users.find(u => u.id === acl.user_id)
      return {
        ...acl,
        name: user?.name || acl.user_id,
        email: user?.email || '',
      }
    })
    res.json(enriched)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch admins' })
  }
})

// POST add an admin to an entity
apiRouter.post('/:entity/:id/admins', async (req: Request, res: Response) => {
  try {
    const entity = String(req.params.entity)
    const entityId = String(req.params.id)
    const userId = req.body?.userId
    if (!userId) {
      res.status(400).json({ error: 'userId is required' })
      return
    }

    const claims = extractOidcClaims(req)
    const callerId = claims ? (await getUserByOidc(claims.iss, claims.sub))?.id : null
    const isGlobalAdmin = claims
  ? (await getUserByOidc(claims.iss, claims.sub))?.is_admin ?? false
  : !process.env.API_AUTH_TOKEN

    if (!isGlobalAdmin) {
      if (!callerId || !(await isEntityAdmin(entity, entityId, callerId))) {
        res.status(403).json({ error: 'Only object admins can add administrators' })
        return
      }
    }

    const existing = await getEntityAdmins(entity, entityId)
    if (existing.length === 0) {
      res.status(404).json({ error: 'Entity not found' })
      return
    }

    const result = await addEntityAdmin(entity, entityId, userId)
    if (!result) {
      res.status(409).json({ error: 'User is already an admin of this entity' })
      return
    }
    res.status(201).json(result)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to add admin' })
  }
})

// DELETE remove an admin from an entity
apiRouter.delete('/:entity/:id/admins/:userId', async (req: Request, res: Response) => {
  try {
    const entity = String(req.params.entity)
    const entityId = String(req.params.id)
    const targetUserId = String(req.params.userId)

    const claims = extractOidcClaims(req)
    const callerId = claims ? (await getUserByOidc(claims.iss, claims.sub))?.id : null
    const isGlobalAdmin = claims
  ? (await getUserByOidc(claims.iss, claims.sub))?.is_admin ?? false
  : !process.env.API_AUTH_TOKEN

    if (!isGlobalAdmin) {
      if (!callerId || !(await isEntityAdmin(entity, entityId, callerId))) {
        res.status(403).json({ error: 'Only object admins can remove administrators' })
        return
      }
    }

    const admins = await getEntityAdmins(entity, entityId)
    if (admins.length <= 1) {
      res.status(400).json({ error: 'Cannot remove the last administrator of an object' })
      return
    }

    const removed = await removeEntityAdmin(entity, entityId, targetUserId)
    if (!removed) {
      res.status(404).json({ error: 'Admin entry not found' })
      return
    }
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to remove admin' })
  }
})

// ─── Entity CRUD Routes (with ACL) ────────────────────────────────────────────

// GET all items for an entity table
apiRouter.get('/:entity', async (req: Request, res: Response) => {
  try {
    const entity = requireEntity(String(req.params.entity), res)
    if (!entity) return
    const items = await getAllEntities(entity)

    const claims = extractOidcClaims(req)
    const localUser = claims ? await getUserByOidc(claims.iss, claims.sub) : null
    const isGlobalAdmin = claims
  ? (await getUserByOidc(claims.iss, claims.sub))?.is_admin ?? false
  : !process.env.API_AUTH_TOKEN

    const adminEntities = isGlobalAdmin ? [] : localUser ? await getEntitiesWhereUserIsAdmin(localUser.id) : []
    const adminSet = new Set(adminEntities.map(e => `${e.table_name}::${e.entity_id}`))

    // Determine which entity types are "parent" to entities where user is admin
    let parentIds: Set<string> | null = null
    if (!isGlobalAdmin) {
      parentIds = new Set<string>()
      for (const ae of adminEntities ?? []) {
        // Walk up: modules -> degrees, degrees -> programs, programs -> departments
        if (ae.table_name === 'modules') {
          const mod = items.find((i: any) => i.id === ae.entity_id)
          if (mod) {
            const degreeIds = mod.DegreeIDs ?? mod.degreeIDs ?? mod.degreeIds ?? []
            for (const did of degreeIds) {
              if (did) parentIds!.add(`degrees::${did}`)
            }
          }
        }
        if (ae.table_name === 'degrees') {
          const deg = items.find((i: any) => i.id === ae.entity_id)
          if (deg) {
            const progIds = deg.ProgramIDs ?? deg.programIDs ?? deg.programIds ?? []
            for (const pid of progIds) {
              if (pid) parentIds!.add(`programs::${pid}`)
            }
          }
        }
        if (ae.table_name === 'programs') {
          const prog = items.find((i: any) => i.id === ae.entity_id)
          if (prog) {
            const deptIds = prog.departmentIDs ?? prog.departmentIds ?? []
            for (const did of deptIds) {
              if (did) parentIds!.add(`departments::${did}`)
            }
          }
        }
      }
    }

    const enriched = items.map((item: any) => {
      const key = `${entity}::${item.id}`
      const canEdit = isGlobalAdmin || adminSet.has(key)
      const isAdmin = canEdit || (parentIds ? parentIds.has(key) : false)
      return {
        ...item,
        _canEdit: canEdit,
        _isAdmin: isAdmin,
      }
    })
    res.json(enriched)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch entities' })
  }
})

// GET single item by ID
apiRouter.get('/:entity/:id', async (req: Request, res: Response) => {
  try {
    const entity = requireEntity(String(req.params.entity), res)
    if (!entity) return
    const id = String(req.params.id)
    const item = await getEntityById(entity, id)
    if (!item) {
      res.status(404).json({ error: `Entity not found in ${entity}` })
      return
    }

    const claims = extractOidcClaims(req)
    const localUser = claims ? await getUserByOidc(claims.iss, claims.sub) : null
    const isGlobalAdmin = claims
  ? (await getUserByOidc(claims.iss, claims.sub))?.is_admin ?? false
  : !process.env.API_AUTH_TOKEN
    const canEdit = isGlobalAdmin || (localUser ? await isEntityAdmin(entity, id, localUser.id) : false)

    res.json({ ...item, _canEdit: canEdit, _isAdmin: canEdit })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch entity' })
  }
})

// POST create a new item
apiRouter.post('/:entity', async (req: Request, res: Response) => {
  try {
    const entity = requireEntity(String(req.params.entity), res)
    if (!entity) return
    const body = req.body || {}
    const id = body.id || body._id || `cw_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // Creator becomes admin unless it's a superuser-only table
    const claims = extractOidcClaims(req)
    const localUser = claims ? await getUserByOidc(claims.iss, claims.sub) : null
    const isGlobalAdmin = claims
  ? (await getUserByOidc(claims.iss, claims.sub))?.is_admin ?? false
  : !process.env.API_AUTH_TOKEN

    if (SUPERUSER_TABLES.has(entity) && !isGlobalAdmin) {
      res.status(403).json({ error: 'Only global administrators can create this entity type' })
      return
    }

    const saved = await saveEntity(entity, id, { ...body, id, _id: id, created_by: localUser?.id || undefined })

    if (localUser && !SUPERUSER_TABLES.has(entity)) {
      await addEntityAdmin(entity, id, localUser.id)
    }

    res.status(201).json({ ...saved, _canEdit: true, _isAdmin: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create entity' })
  }
})

// PUT replace / update an item
apiRouter.put('/:entity/:id', async (req: Request, res: Response) => {
  try {
    const entity = requireEntity(String(req.params.entity), res)
    if (!entity) return
    const id = String(req.params.id)
    const body = req.body || {}

    const claims = extractOidcClaims(req)
    const localUser = claims ? await getUserByOidc(claims.iss, claims.sub) : null
    const isGlobalAdmin = claims
  ? (await getUserByOidc(claims.iss, claims.sub))?.is_admin ?? false
  : !process.env.API_AUTH_TOKEN

    if (SUPERUSER_TABLES.has(entity) && !isGlobalAdmin) {
      res.status(403).json({ error: 'Only global administrators can edit this entity type' })
      return
    }

    if (!isGlobalAdmin && localUser && !(await isEntityAdmin(entity, id, localUser.id))) {
      res.status(403).json({ error: 'You are not an administrator of this object' })
      return
    }

    const existing = (await getEntityById(entity, id)) || {}
    const updated = await saveEntity(entity, id, { ...existing, ...body, id, _id: id })
    res.json({ ...updated, _canEdit: true, _isAdmin: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update entity' })
  }
})

// PATCH partial update
apiRouter.patch('/:entity/:id', async (req: Request, res: Response) => {
  try {
    const entity = requireEntity(String(req.params.entity), res)
    if (!entity) return
    const id = String(req.params.id)
    const body = req.body || {}

    const claims = extractOidcClaims(req)
    const localUser = claims ? await getUserByOidc(claims.iss, claims.sub) : null
    const isGlobalAdmin = claims
  ? (await getUserByOidc(claims.iss, claims.sub))?.is_admin ?? false
  : !process.env.API_AUTH_TOKEN

    if (SUPERUSER_TABLES.has(entity) && !isGlobalAdmin) {
      res.status(403).json({ error: 'Only global administrators can edit this entity type' })
      return
    }

    if (!isGlobalAdmin && localUser && !(await isEntityAdmin(entity, id, localUser.id))) {
      res.status(403).json({ error: 'You are not an administrator of this object' })
      return
    }

    const existing = (await getEntityById(entity, id)) || {}
    const updated = await saveEntity(entity, id, { ...existing, ...body, id, _id: id })
    res.json({ ...updated, _canEdit: true, _isAdmin: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to patch entity' })
  }
})

// DELETE an item
apiRouter.delete('/:entity/:id', async (req: Request, res: Response) => {
  try {
    const entity = requireEntity(String(req.params.entity), res)
    if (!entity) return
    const id = String(req.params.id)
    const claims = extractOidcClaims(req)
    const localUser = claims ? await getUserByOidc(claims.iss, claims.sub) : null
    const isGlobalAdmin = claims
  ? (await getUserByOidc(claims.iss, claims.sub))?.is_admin ?? false
  : !process.env.API_AUTH_TOKEN

    if (SUPERUSER_TABLES.has(entity) && !isGlobalAdmin) {
      res.status(403).json({ error: 'Only global administrators can delete this entity type' })
      return
    }

    if (!isGlobalAdmin && localUser && !(await isEntityAdmin(entity, id, localUser.id))) {
      res.status(403).json({ error: 'You are not an administrator of this object' })
      return
    }

    const deleted = await deleteEntity(entity, id)
    if (!deleted) {
      res.status(404).json({ error: `Entity not found in ${entity}` })
      return
    }
    res.json({ deleted: true, id })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete entity' })
  }
})

// Database status endpoint
apiRouter.get('/db/status', (_req: Request, res: Response) => {
  res.json({ connected: isDbConnected() })
})
