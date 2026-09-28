import { Pool } from 'pg'

export interface EntityRecord {
  id: string
  [key: string]: any
}

export interface LocalUser {
  id: string
  oidc_issuer: string
  oidc_subject: string
  name: string
  email: string
  local_name: string
  display_name: string
  supplier_id: string
  is_active: boolean
  timezone: string
  roles: string[]
  is_admin: boolean
  created_at: string
  updated_at: string
}

export interface EntityAclEntry {
  table_name: string
  entity_id: string
  user_id: string
  role: 'admin'
  created_at: string
}

class AsyncMutex {
  private mutex = Promise.resolve()

  lock(): Promise<() => void> {
    let begin: (unlock: () => void) => void = () => {}
    this.mutex = this.mutex.then(() => {
      return new Promise(begin)
    })
    return new Promise(res => {
      begin = res
    })
  }

  async runExclusive<T>(callback: () => Promise<T>): Promise<T> {
    const unlock = await this.lock()
    try {
      return await callback()
    } finally {
      unlock()
    }
  }
}

const bootstrapMutex = new AsyncMutex()

// In-memory fallback storage in case PostgreSQL server is not currently reachable
const memoryStore: Map<string, Map<string, any>> = new Map()
const memoryUsers: Map<string, LocalUser> = new Map()
const memoryAcl: Map<string, EntityAclEntry> = new Map()

function getMemoryTable(table: string): Map<string, any> {
  if (!memoryStore.has(table)) {
    memoryStore.set(table, new Map())
  }
  return memoryStore.get(table)!
}

let pool: Pool | null = null
let isConnected = false

export function getDbConfig() {
  const host = process.env.POSTGRES_HOST || 'localhost'
  const port = parseInt(process.env.POSTGRES_PORT || '5432', 10)
  const database = process.env.POSTGRES_DB || 'timeweaver'
  const user = process.env.POSTGRES_USER || 'timeweaver'
  // Review #9: kein hartkodiertes Default-Passwort mehr. Ohne gesetzte
  // Umgebungsvariable wird PostgreSQL bewusst NICHT benutzt (In-Memory mit
  // explizitem Warnhinweis) — still weitermachen mit 'courseweaver' wäre
  // ein erratbares Passwort im Quellcode.
  const password = process.env.POSTGRES_PASSWORD || ''

  return {
    host,
    port,
    database,
    user,
    password,
    connectionTimeoutMillis: 3000,
  }
}

export async function initDatabase(): Promise<boolean> {
  if (!process.env.POSTGRES_PASSWORD) {
    console.warn(
      '[Database] POSTGRES_PASSWORD nicht gesetzt — PostgreSQL wird NICHT benutzt. ' +
        'In-Memory-Fallback aktiv (kein Persistieren über Server-Neustart!).',
    )
    return false
  }
  try {
    const config = getDbConfig()
    pool = new Pool(config)

    // Verify connection
    const client = await pool.connect()
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS entity_store (
          table_name VARCHAR(100) NOT NULL,
          id VARCHAR(255) NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (table_name, id)
        );
        CREATE INDEX IF NOT EXISTS idx_entity_store_table ON entity_store(table_name);

        CREATE TABLE IF NOT EXISTS local_users (
          id VARCHAR(255) PRIMARY KEY,
          oidc_issuer VARCHAR(512) NOT NULL,
          oidc_subject VARCHAR(512) NOT NULL,
          name VARCHAR(255) DEFAULT '',
          email VARCHAR(255) DEFAULT '',
          local_name VARCHAR(255) DEFAULT '',
          display_name VARCHAR(255) DEFAULT '',
          supplier_id VARCHAR(512) DEFAULT '',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          timezone VARCHAR(64) DEFAULT '',
          roles JSONB NOT NULL DEFAULT '[]'::jsonb,
          is_admin BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT uq_local_users_oidc UNIQUE (oidc_issuer, oidc_subject)
        );
        CREATE INDEX IF NOT EXISTS idx_local_users_admin ON local_users(is_admin);

        ALTER TABLE local_users ADD COLUMN IF NOT EXISTS local_name VARCHAR(255) DEFAULT '';
        ALTER TABLE local_users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT '';
        ALTER TABLE local_users ADD COLUMN IF NOT EXISTS supplier_id VARCHAR(512) DEFAULT '';
        ALTER TABLE local_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE local_users ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT '';

        CREATE TABLE IF NOT EXISTS entity_acl (
          table_name VARCHAR(100) NOT NULL,
          entity_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'admin',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (table_name, entity_id, user_id),
          FOREIGN KEY (user_id) REFERENCES local_users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_entity_acl_entity ON entity_acl(table_name, entity_id);
        CREATE INDEX IF NOT EXISTS idx_entity_acl_user ON entity_acl(user_id);
      `)
      isConnected = true
      console.log(`[Database] Successfully connected to PostgreSQL at ${config.host}:${config.port}/${config.database}`)
      return true
    } finally {
      client.release()
    }
  } catch (err: any) {
    isConnected = false
    // Datenverlust-Schutz: Wenn PostgreSQL konfiguriert (POSTGRES_PASSWORD gesetzt)
    // aber nicht erreichbar ist, darf der Server nicht still im RAM weiterarbeiten —
    // importierte Daten waren sonst nach einem Neustart verloren (passiert so).
    // Nur mit ALLOW_INMEMORY_FALLBACK=true gilt die alte RAM-only-Strategie weiter.
    if (process.env.ALLOW_INMEMORY_FALLBACK === 'true') {
      console.warn(
        `[Database] PostgreSQL connection failed (${err.message}). ` +
          'In-Memory-Fallback erzwungen (ALLOW_INMEMORY_FALLBACK=true) — Daten gehen bei Neustart verloren!',
      )
      return false
    }
    throw new Error(
      `[Database] PostgreSQL nicht erreichbar: ${err.message}. ` +
        'Datenbank starten (docker compose up -d postgres) oder bewusst ' +
        'ALLOW_INMEMORY_FALLBACK=true setzen (RAM-only, Datenverlust bei Neustart!).',
      { cause: err },
    )
  }
}

export function isDbConnected(): boolean {
  return isConnected
}

function mapRowToUser(row: any): LocalUser {
  return {
    id: row.id,
    oidc_issuer: row.oidc_issuer,
    oidc_subject: row.oidc_subject,
    name: row.name || '',
    email: row.email || '',
    local_name: row.local_name || '',
    display_name: row.display_name || '',
    supplier_id: row.supplier_id || '',
    is_active: row.is_active !== false,
    timezone: row.timezone || '',
    roles: Array.isArray(row.roles) ? row.roles : typeof row.roles === 'string' ? JSON.parse(row.roles) : [],
    is_admin: !!row.is_admin,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || ''),
  }
}

export async function getAdminCount(): Promise<number> {
  if (isConnected && pool) {
    try {
      const res = await pool.query('SELECT COUNT(*) FROM local_users WHERE is_admin = true')
      return parseInt(res.rows[0].count, 10)
    } catch (err) {
      console.error('[Database] Error counting admins:', err)
    }
  }

  return Array.from(memoryUsers.values()).filter(u => u.is_admin).length
}

export async function getUserByOidc(issuer: string, subject: string): Promise<LocalUser | null> {
  if (isConnected && pool) {
    try {
      const res = await pool.query(
        'SELECT * FROM local_users WHERE oidc_issuer = $1 AND oidc_subject = $2',
        [issuer, subject]
      )
      if (res.rows.length > 0) {
        return mapRowToUser(res.rows[0])
      }
      return null
    } catch (err) {
      console.error('[Database] Error finding user by OIDC (iss, sub):', err)
    }
  }

  const found = Array.from(memoryUsers.values()).find(
    u => u.oidc_issuer === issuer && u.oidc_subject === subject
  )
  return found ? { ...found } : null
}

export async function getUserById(id: string): Promise<LocalUser | null> {
  if (isConnected && pool) {
    try {
      const res = await pool.query('SELECT * FROM local_users WHERE id = $1', [id])
      if (res.rows.length > 0) {
        return mapRowToUser(res.rows[0])
      }
      return null
    } catch (err) {
      console.error('[Database] Error finding user by ID:', err)
    }
  }

  const found = memoryUsers.get(id)
  return found ? { ...found } : null
}

export async function getAllUsers(): Promise<LocalUser[]> {
  if (isConnected && pool) {
    try {
      const res = await pool.query('SELECT * FROM local_users ORDER BY created_at ASC')
      return res.rows.map(mapRowToUser)
    } catch (err) {
      console.error('[Database] Error fetching all users:', err)
    }
  }

  return Array.from(memoryUsers.values()).map(u => ({ ...u }))
}

export async function searchUsers(query: string): Promise<LocalUser[]> {
  const pattern = `%${query}%`
  if (isConnected && pool) {
    try {
      const res = await pool.query(
        'SELECT * FROM local_users WHERE name ILIKE $1 OR email ILIKE $1 OR id ILIKE $1 ORDER BY name ASC LIMIT 20',
        [pattern]
      )
      return res.rows.map(mapRowToUser)
    } catch (err) {
      console.error('[Database] Error searching users:', err)
    }
  }

  const q = query.toLowerCase()
  return Array.from(memoryUsers.values())
    .filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.id.toLowerCase().includes(q))
    .slice(0, 20)
    .map(u => ({ ...u }))
}

export async function createOrUpdateUser(data: {
  oidc_issuer: string
  oidc_subject: string
  name?: string
  email?: string
  local_name?: string
  display_name?: string
  supplier_id?: string
  is_active?: boolean
  timezone?: string
  roles?: string[]
  is_admin?: boolean
}): Promise<LocalUser> {
  const now = new Date().toISOString()
  const roles = data.roles || ['user']
  const isAdmin = data.is_admin ?? false
  const name = data.name || ''
  const email = data.email || ''
  const localName = data.local_name || data.name || ''
  const displayName = data.display_name || data.name || ''
  const supplierId = data.supplier_id || data.oidc_issuer || ''
  const isActive = data.is_active ?? true
  const timezone = data.timezone || ''

  if (isConnected && pool) {
    const id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const res = await pool.query(
      `INSERT INTO local_users (id, oidc_issuer, oidc_subject, name, email, local_name, display_name, supplier_id, is_active, timezone, roles, is_admin, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
       ON CONFLICT (oidc_issuer, oidc_subject)
       DO UPDATE SET
         name = CASE WHEN local_users.name IS NOT NULL AND local_users.name <> '' THEN local_users.name ELSE $4 END,
         email = CASE WHEN local_users.email IS NOT NULL AND local_users.email <> '' THEN local_users.email ELSE $5 END,
         local_name = CASE WHEN local_users.local_name IS NOT NULL AND local_users.local_name <> '' THEN local_users.local_name ELSE $6 END,
         display_name = CASE WHEN local_users.display_name IS NOT NULL AND local_users.display_name <> '' THEN local_users.display_name ELSE $7 END,
         updated_at = $13
       RETURNING *`,
      [id, data.oidc_issuer, data.oidc_subject, name, email, localName, displayName, supplierId, isActive, timezone, JSON.stringify(roles), isAdmin, now]
    )
    return mapRowToUser(res.rows[0])
  }

  // Memory fallback
  return await bootstrapMutex.runExclusive(async () => {
    const existing = Array.from(memoryUsers.values()).find(
      u => u.oidc_issuer === data.oidc_issuer && u.oidc_subject === data.oidc_subject
    )
    if (existing) {
      if (!existing.name && name) existing.name = name
      if (!existing.email && email) existing.email = email
      if (!existing.local_name && localName) existing.local_name = localName
      if (!existing.display_name && displayName) existing.display_name = displayName
      existing.updated_at = now
      memoryUsers.set(existing.id, existing)
      return { ...existing }
    } else {
      const id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const newUser: LocalUser = {
        id,
        oidc_issuer: data.oidc_issuer,
        oidc_subject: data.oidc_subject,
        name,
        email,
        local_name: localName,
        display_name: displayName,
        supplier_id: supplierId,
        is_active: isActive,
        timezone,
        roles,
        is_admin: isAdmin,
        created_at: now,
        updated_at: now,
      }
      memoryUsers.set(id, newUser)
      return { ...newUser }
    }
  })
}

export async function updateUser(id: string, updates: Partial<LocalUser>): Promise<LocalUser | null> {
  const now = new Date().toISOString()
  const current = await getUserById(id)
  if (!current) return null

  // Guard: never allow demoting the last remaining administrator
  if (current.is_admin) {
    const newIsAdmin = updates.is_admin !== undefined ? !!updates.is_admin : current.is_admin
    const newRoles = updates.roles !== undefined ? updates.roles : current.roles
    if (!newIsAdmin || !newRoles.includes('admin')) {
      const adminCount = await getAdminCount()
      if (adminCount <= 1) {
        throw new Error('Cannot remove the last remaining administrator')
      }
    }
  }

  if (isConnected && pool) {
    try {
      const name = updates.name !== undefined ? updates.name : current.name
      const email = updates.email !== undefined ? updates.email : current.email
      const localName = updates.local_name !== undefined ? updates.local_name : current.local_name
      const displayName = updates.display_name !== undefined ? updates.display_name : current.display_name
      const supplierId = updates.supplier_id !== undefined ? updates.supplier_id : current.supplier_id
      const isActive = updates.is_active !== undefined ? updates.is_active : current.is_active
      const timezone = updates.timezone !== undefined ? updates.timezone : current.timezone
      const roles = updates.roles !== undefined ? updates.roles : current.roles
      const isAdmin = updates.is_admin !== undefined ? updates.is_admin : current.is_admin

      const res = await pool.query(
        `UPDATE local_users
         SET name = $1, email = $2, local_name = $3, display_name = $4, supplier_id = $5, is_active = $6, timezone = $7, roles = $8, is_admin = $9, updated_at = $10
         WHERE id = $11
         RETURNING *`,
        [name, email, localName, displayName, supplierId, isActive, timezone, JSON.stringify(roles), isAdmin, now, id]
      )
      if (res.rows.length > 0) {
        return mapRowToUser(res.rows[0])
      }
      return null
    } catch (err) {
      console.error('[Database] Error updating user:', err)
      return null
    }
  }

  return await bootstrapMutex.runExclusive(async () => {
    const existing = memoryUsers.get(id)
    if (!existing) return null

    if (updates.name !== undefined) existing.name = updates.name
    if (updates.email !== undefined) existing.email = updates.email
    if (updates.local_name !== undefined) existing.local_name = updates.local_name
    if (updates.display_name !== undefined) existing.display_name = updates.display_name
    if (updates.supplier_id !== undefined) existing.supplier_id = updates.supplier_id
    if (updates.is_active !== undefined) existing.is_active = updates.is_active
    if (updates.timezone !== undefined) existing.timezone = updates.timezone
    if (updates.roles !== undefined) existing.roles = updates.roles
    if (updates.is_admin !== undefined) existing.is_admin = updates.is_admin
    existing.updated_at = now
    memoryUsers.set(id, existing)
    return { ...existing }
  })
}

export async function bootstrapAdminUser(data: {
  oidc_issuer: string
  oidc_subject: string
  name?: string
  email?: string
}): Promise<{ success: boolean; user?: LocalUser; error?: string }> {
  const name = data.name || ''
  const email = data.email || ''
  const now = new Date().toISOString()

  if (isConnected && pool) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Lock table in exclusive mode to prevent concurrent bootstrap race conditions
      await client.query('LOCK TABLE local_users IN EXCLUSIVE MODE')

      const countRes = await client.query('SELECT COUNT(*) FROM local_users WHERE is_admin = true')
      const adminCount = parseInt(countRes.rows[0].count, 10)

      if (adminCount > 0) {
        await client.query('ROLLBACK')
        return { success: false, error: 'Administrator already exists. Bootstrap is disabled.' }
      }

      const id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const insertRes = await client.query(
        `INSERT INTO local_users (id, oidc_issuer, oidc_subject, name, email, local_name, display_name, supplier_id, is_active, roles, is_admin, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $4, $4, $2, true, $6, true, $7, $7)
         ON CONFLICT (oidc_issuer, oidc_subject)
         DO UPDATE SET
           roles = '["admin"]'::jsonb,
           is_admin = true,
           name = CASE WHEN local_users.name IS NOT NULL AND local_users.name <> '' THEN local_users.name ELSE $4 END,
           email = CASE WHEN local_users.email IS NOT NULL AND local_users.email <> '' THEN local_users.email ELSE $5 END,
           updated_at = $7
         RETURNING *`,
        [id, data.oidc_issuer, data.oidc_subject, name, email, JSON.stringify(['admin']), now]
      )

      await client.query('COMMIT')
      return { success: true, user: mapRowToUser(insertRes.rows[0]) }
    } catch (err: any) {
      await client.query('ROLLBACK')
      console.error('[Database] Error in bootstrapAdminUser transaction:', err)
      return { success: false, error: err.message || 'Database error during bootstrap' }
    } finally {
      client.release()
    }
  }

  // Fallback mutex locking for atomic concurrency protection
  return await bootstrapMutex.runExclusive(async () => {
    const adminCount = Array.from(memoryUsers.values()).filter(u => u.is_admin).length
    if (adminCount > 0) {
      return { success: false, error: 'Administrator already exists. Bootstrap is disabled.' }
    }

    const existing = Array.from(memoryUsers.values()).find(
      u => u.oidc_issuer === data.oidc_issuer && u.oidc_subject === data.oidc_subject
    )

    if (existing) {
      existing.is_admin = true
      if (!existing.roles.includes('admin')) {
        existing.roles = Array.from(new Set([...existing.roles, 'admin']))
      }
      if (!existing.name && name) existing.name = name
      if (!existing.email && email) existing.email = email
      existing.updated_at = now
      memoryUsers.set(existing.id, existing)
      return { success: true, user: { ...existing } }
    } else {
      const id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const newUser: LocalUser = {
        id,
        oidc_issuer: data.oidc_issuer,
        oidc_subject: data.oidc_subject,
        name,
        email,
        local_name: name,
        display_name: name,
        supplier_id: data.oidc_issuer,
        is_active: true,
        timezone: '',
        roles: ['admin'],
        is_admin: true,
        created_at: now,
        updated_at: now,
      }
      memoryUsers.set(id, newUser)
      return { success: true, user: { ...newUser } }
    }
  })
}

export async function resetDbForTests(): Promise<void> {
  memoryStore.clear()
  memoryUsers.clear()
  memoryAcl.clear()
  if (isConnected && pool) {
    try {
      await pool.query('TRUNCATE TABLE entity_acl, entity_store, local_users')
    } catch {
      // ignore
    }
  }
}

// ─── Object-Level ACL Functions ────────────────────────────────────────────────

function aclKey(tableName: string, entityId: string, userId: string): string {
  return `${tableName}::${entityId}::${userId}`
}

export async function getEntityAdmins(tableName: string, entityId: string): Promise<EntityAclEntry[]> {
  if (isConnected && pool) {
    try {
      const res = await pool.query(
        'SELECT * FROM entity_acl WHERE table_name = $1 AND entity_id = $2 ORDER BY created_at ASC',
        [tableName, entityId]
      )
      return res.rows.map(row => ({
        table_name: row.table_name,
        entity_id: row.entity_id,
        user_id: row.user_id,
        role: row.role,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
      }))
    } catch (err) {
      console.error(`[Database] Error fetching ACL for ${tableName}/${entityId}:`, err)
    }
  }

  const results: EntityAclEntry[] = []
  for (const entry of memoryAcl.values()) {
    if (entry.table_name === tableName && entry.entity_id === entityId) {
      results.push({ ...entry })
    }
  }
  return results
}

export async function isEntityAdmin(tableName: string, entityId: string, userId: string): Promise<boolean> {
  if (isConnected && pool) {
    try {
      const res = await pool.query(
        'SELECT 1 FROM entity_acl WHERE table_name = $1 AND entity_id = $2 AND user_id = $3',
        [tableName, entityId, userId]
      )
      return res.rows.length > 0
    } catch (err) {
      console.error(`[Database] Error checking ACL for ${tableName}/${entityId}:`, err)
    }
  }

  return memoryAcl.has(aclKey(tableName, entityId, userId))
}

export async function addEntityAdmin(tableName: string, entityId: string, userId: string): Promise<EntityAclEntry | null> {
  const now = new Date().toISOString()

  if (isConnected && pool) {
    try {
      const res = await pool.query(
        `INSERT INTO entity_acl (table_name, entity_id, user_id, role, created_at)
         VALUES ($1, $2, $3, 'admin', $4)
         ON CONFLICT (table_name, entity_id, user_id) DO NOTHING
         RETURNING *`,
        [tableName, entityId, userId, now]
      )
      if (res.rows.length > 0) {
        return {
          table_name: res.rows[0].table_name,
          entity_id: res.rows[0].entity_id,
          user_id: res.rows[0].user_id,
          role: res.rows[0].role,
          created_at: res.rows[0].created_at instanceof Date ? res.rows[0].created_at.toISOString() : String(res.rows[0].created_at),
        }
      }
      return null
    } catch (err) {
      console.error(`[Database] Error adding ACL admin for ${tableName}/${entityId}:`, err)
      return null
    }
  }

  const key = aclKey(tableName, entityId, userId)
  if (memoryAcl.has(key)) return null
  const entry: EntityAclEntry = { table_name: tableName, entity_id: entityId, user_id: userId, role: 'admin', created_at: now }
  memoryAcl.set(key, entry)
  return { ...entry }
}

export async function removeEntityAdmin(tableName: string, entityId: string, userId: string): Promise<boolean> {
  if (isConnected && pool) {
    try {
      const res = await pool.query(
        'DELETE FROM entity_acl WHERE table_name = $1 AND entity_id = $2 AND user_id = $3',
        [tableName, entityId, userId]
      )
      return (res.rowCount ?? 0) > 0
    } catch (err) {
      console.error(`[Database] Error removing ACL admin for ${tableName}/${entityId}:`, err)
      return false
    }
  }

  return memoryAcl.delete(aclKey(tableName, entityId, userId))
}

export async function getEntitiesWhereUserIsAdmin(userId: string): Promise<Array<{ table_name: string; entity_id: string }>> {
  if (isConnected && pool) {
    try {
      const res = await pool.query(
        'SELECT table_name, entity_id FROM entity_acl WHERE user_id = $1',
        [userId]
      )
      return res.rows.map((row: any) => ({ table_name: row.table_name, entity_id: row.entity_id }))
    } catch (err) {
      console.error(`[Database] Error fetching admin entities for user ${userId}:`, err)
    }
  }

  const results: Array<{ table_name: string; entity_id: string }> = []
  for (const entry of memoryAcl.values()) {
    if (entry.user_id === userId) {
      results.push({ table_name: entry.table_name, entity_id: entry.entity_id })
    }
  }
  return results
}

export async function getAllEntities(tableName: string): Promise<any[]> {
  if (isConnected && pool) {
    try {
      const res = await pool.query(
        'SELECT id, data, created_at, updated_at FROM entity_store WHERE table_name = $1 ORDER BY created_at ASC',
        [tableName]
      )
      return res.rows.map(row => {
        const item = typeof row.data === 'object' && row.data !== null ? row.data : {}
        return {
          ...item,
          id: row.id,
          _id: row.id,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
      })
    } catch (err) {
      // Review #4: Query-Fehler bei bestehender Verbindung NICHT swallowen —
      // weiterwerfen, so dass die Route mit 500 antwortet (kein leerer
      // In-Memory-Fallback beim aufrufer -> stiller Datenverlust).
      console.error(`[Database] Error fetching from ${tableName}:`, err)
      throw err
    }
  }

  // Fallback nur wenn NICHT verbunden (bewusster Degraded-Modus)
  const table = getMemoryTable(tableName)
  return Array.from(table.values())
}

export async function getEntityById(tableName: string, id: string): Promise<any | null> {
  if (isConnected && pool) {
    try {
      const res = await pool.query(
        'SELECT id, data, created_at, updated_at FROM entity_store WHERE table_name = $1 AND id = $2',
        [tableName, id]
      )
      if (res.rows.length > 0) {
        const row = res.rows[0]
        const item = typeof row.data === 'object' && row.data !== null ? row.data : {}
        return {
          ...item,
          id: row.id,
          _id: row.id,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
      }
      return null
    } catch (err) {
      console.error(`[Database] Error fetching ${tableName}/${id}:`, err)
      throw err // Review #4: nicht still auf leeren Fallback wechseln
    }
  }

  const table = getMemoryTable(tableName)
  return table.get(id) || null
}

export async function saveEntity(tableName: string, id: string, data: any): Promise<any> {
  const cleanData = { ...data, id, _id: id }
  const now = new Date().toISOString()

  if (isConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO entity_store (table_name, id, data, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (table_name, id)
         DO UPDATE SET data = $3, updated_at = $4`,
        [tableName, id, JSON.stringify(cleanData), now]
      )
      return { ...cleanData, updated_at: now }
    } catch (err) {
      console.error(`[Database] Error saving to ${tableName}:`, err)
      throw err // Review #4: Fehler weiterwerfen -> Route antwortet 500, kein stiller Datenverlust
    }
  }

  const table = getMemoryTable(tableName)
  const record = {
    ...cleanData,
    created_at: table.get(id)?.created_at || now,
    updated_at: now,
  }
  table.set(id, record)
  return record
}

export async function deleteEntity(tableName: string, id: string): Promise<boolean> {
  if (isConnected && pool) {
    try {
      await pool.query('DELETE FROM entity_acl WHERE table_name = $1 AND entity_id = $2', [tableName, id])
      const res = await pool.query(
        'DELETE FROM entity_store WHERE table_name = $1 AND id = $2',
        [tableName, id]
      )
      return (res.rowCount ?? 0) > 0
    } catch (err) {
      console.error(`[Database] Error deleting from ${tableName}:`, err)
      throw err // Review #4
    }
  }

  // Also clean memory ACL entries for this entity
  for (const key of memoryAcl.keys()) {
    if (key.startsWith(`${tableName}::${id}::`)) {
      memoryAcl.delete(key)
    }
  }
  const table = getMemoryTable(tableName)
  return table.delete(id)
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    isConnected = false
  }
}

// ---------------------------------------------------------------------------
// Kap. 6 — pgvector: Learning-Cycle-Embeddings, SEPARAT vom generic entity_store.
// Vektor-Ähnlichkeitssuche braucht vector-Spaltentyp + ivfflat-Index — kein
// JSONB-Workaround. getAllEntities/saveEntity bleiben für die fachlichen
// Objekte (LearningCycle, OverlapAssessment, Review-Status) zuständig; die
// Vektorsuche läuft über die typisierten Funktionen hier unten.
// ---------------------------------------------------------------------------

/** Dimension muss zum Embedding-Modell passen (z.B. nomic-embed-text: 768) */
let vectorDimension = Number(process.env.EMBEDDING_DIMENSION ?? 1024)

export function setVectorDimension(dim: number): void {
  if (!Number.isFinite(dim) || dim <= 0) throw new Error('EMBEDDING_DIMENSION > 0 erforderlich')
  vectorDimension = Math.floor(dim)
}

export async function initEmbeddingsTable(): Promise<void> {
  if (!(isConnected && pool)) {
    return // Degraded-Modus (In-Memory): Vektorsuche deaktiviert
  }
  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS learning_cycle_embeddings (
      cycle_id VARCHAR(255) PRIMARY KEY,
      embedding vector(${vectorDimension}) NOT NULL,
      model_id VARCHAR(100) NOT NULL,
      text_hash VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  // text_hash nachträglich ergänzen (Bestandstabellen ohne Migration erweitern)
  await pool.query(`ALTER TABLE learning_cycle_embeddings ADD COLUMN IF NOT EXISTS text_hash VARCHAR(64)`)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lc_embeddings_ivfflat
      ON learning_cycle_embeddings USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
  `).catch(() => {
    // ivfflat braucht lists im Verhältnis zur Datenmenge; ohne Index funktioniert die Suche (seq scan)
    console.warn('[Database] ivfflat-Index nicht angelegt — Vektorsuche läuft ohne Index')
  })
}

export interface CycleEmbeddingRef {
  cycleId: string
  similarity: number
}

function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`
}

function parsePgVector(s: string): number[] {
  return s
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isFinite(n))
}

/** Embedding persistieren (idempotent), getrennt von saveEntity. */
export async function saveCycleEmbedding(
  cycleId: string,
  embedding: number[],
  modelId: string,
  textHash?: string,
): Promise<void> {
  if (!(isConnected && pool)) throw new Error('pgvector: keine PostgreSQL-Verbindung')
  await pool.query(
    `INSERT INTO learning_cycle_embeddings (cycle_id, embedding, model_id, text_hash)
     VALUES ($1, $2::vector, $3, $4)
     ON CONFLICT (cycle_id) DO UPDATE SET embedding = $2::vector, model_id = $3, text_hash = $4, created_at = NOW()`,
    [cycleId, toPgVector(embedding), modelId, textHash ?? null],
  )
}

/**
 * Kap. 2.1 Schritt 2 — Cache-Lesen: gecachte Embeddings für die gegebenen
 * LCs (nur passend zum Modell). Der text_hash macht sichtbar, ob der Text
 * seit dem Cachen geändert hat; die Entscheidung trifft der Aufrufer.
 */
export interface CachedCycleEmbedding {
  embedding: number[]
  textHash: string | null
}

export async function getCachedCycleEmbeddings(
  cycleIds: string[],
  modelId: string,
): Promise<Map<string, CachedCycleEmbedding>> {
  if (!(isConnected && pool)) throw new Error('pgvector: keine PostgreSQL-Verbindung')
  if (cycleIds.length === 0) return new Map()
  const res = await pool.query(
    `SELECT cycle_id, embedding, text_hash
     FROM learning_cycle_embeddings
     WHERE model_id = $1 AND cycle_id = ANY($2)`,
    [modelId, cycleIds],
  )
  const out = new Map<string, CachedCycleEmbedding>()
  for (const row of res.rows) {
    const embedding = parsePgVector(String(row.embedding))
    if (embedding.length === 0) continue
    out.set(String(row.cycle_id), { embedding, textHash: row.text_hash ? String(row.text_hash) : null })
  }
  return out
}

/**
 * Kap. 2 — findTopKSimilar: Typisierte Vektor-Ähnlichkeitssuche
 * (cosine), NICHT über die generische Entity-API.
 */
export async function findTopKSimilar(
  embedding: number[],
  topK: number,
  threshold: number,
  modelId?: string,
): Promise<CycleEmbeddingRef[]> {
  if (!(isConnected && pool)) throw new Error('pgvector: keine PostgreSQL-Verbindung')
  const res = await pool.query(
    `SELECT cycle_id, model_id, 1 - (embedding <=> $1::vector) AS similarity
     FROM learning_cycle_embeddings
     WHERE 1 - (embedding <=> $1::vector) >= $2
       AND ($4::varchar IS NULL OR model_id = $4::varchar)
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [toPgVector(embedding), threshold, topK, modelId ?? null],
  )
  return res.rows.map((row) => ({
    cycleId: String(row.cycle_id),
    similarity: Number(row.similarity),
  }))
}
