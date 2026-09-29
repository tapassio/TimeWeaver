/**
 * Migration Datenmodell-Schritt 1 (data-model-comparison.md §3):
 *
 *   Für jede bisherige (Programm, Semester)-Kombination, die direkt am Modul
 *   hängt, wird eine Class-Row (Kohorte) erzeugt und die betroffenen Module
 *   verknüpft (classes.moduleIds + modules.classIds).
 *
 * Ausführen:   tsx server/migrate-classes.ts   (API via SEED_API_URL, Default http://localhost:3200/api)
 * Idempotent:  bestehende Class-Rows werden gemerged (moduleIds Union), Module
 *              werden mit classIds ergänzt statt überschrieben.
 */

const API = process.env.SEED_API_URL ?? 'http://localhost:3200/api'

interface ModuleRow {
  id: string
  name?: string
  title?: string
  code?: string
  program?: string
  programId?: string
  programIds?: string[]
  // CW-Legacy-MockFelder
  program_id?: string
  semester?: number
  semesterId?: string
  year?: number
  classIds?: string[]
}

interface ClassRow {
  id: string
  name: string
  programId?: string
  /** @deprecated compat mit CourseWeaver rows */
  programIds?: string[]
  semesterId?: string
  curriculumVersionId?: string
  size?: number
  moduleIds?: string[]
}

function norm(v: string): string {
  return String(v).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function programOf(m: ModuleRow): string {
  return m.program ?? m.programId ?? m.program_id ?? m.programIds?.[0] ?? 'unassigned'
}

function semesterOf(m: ModuleRow): string {
  return String(m.semesterId ?? m.semester ?? m.year ?? 's0')
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/${tablePath(path)}`)
  if (!res.ok) throw new Error(`GET ${tablePath(path)}: HTTP ${res.status}`)
  return res.json()
}

function tablePath(p: string): string {
  return p
}

async function summary() {
  console.log(`[migrate-classes] API: ${API}`)
  const [modules, existing] = await Promise.all([
    api<ModuleRow[]>('modules'),
    api<ClassRow[]>('classes'),
  ])
  console.log(`modules=${modules.length}, classes=${existing.length}`)


  const groups = new Map<string, { program: string; semester: string; moduleIds: string[] }>()
  for (const m of modules) {
    const program = programOf(m)
    const semester = m.semesterId ?? m.semester ?? m.year ?? 'unassigned'
    const key = `${program}::${semester}`
    const g = groups.get(key)
    if (g) g.moduleIds.push(m.id)
    else groups.set(key, { program, semester: String(semester), moduleIds: [m.id] })
  }

  const classesById = new Map(existing.map(c => [c.id, c]))
  let created = 0
  let merged = 0

  for (const g of groups.values()) {
    const id = `class-${norm(g.program)}-${norm(g.semester)}`
    const prev = classesById.get(id)
    const moduleIds = Array.from(new Set([...(prev?.moduleIds ?? []), ...g.moduleIds]))
    const row: ClassRow = {
      ...(prev ?? {}),
      id,
      name: prev?.name ?? `${g.program} · ${g.semester}`,
      programId: prev?.programId ?? g.program,
      programIds: prev?.programIds ?? [g.program],
      semesterId: prev?.semesterId ?? (g.semester.match(/^sem-/i) ? g.semester : undefined),
      curriculumVersionId: prev?.curriculumVersionId,
      size: prev?.size ?? g.moduleIds.length,
      moduleIds,
    }
    const res = await fetch(`${API}/classes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    })
    if (!res.ok) throw new Error(`classes/${id}: HTTP ${res.status} ${await res.text()}`)
    if (prev) merged++
    else created++

    // module.classIds ergänzen (Merge, damit keine Zuordnungen verloren gehen)
    for (const mid of moduleIds) {
      const mod = modules.find(m => m.id === mid)
      if (!mod) continue
      const nextIds = Array.from(new Set([...(mod.classIds ?? []), id]))
      if ((mod.classIds ?? []).includes(id)) continue
      const res2 = await fetch(`${API}/modules/${encodeURIComponent(mid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classIds: nextIds }),
      })
      if (!res2.status || res2.status >= 400) {
        throw new Error(`modules/${mid}: HTTP ${res2.status} ${await res2.text()}`)
      }
    }
  }

  console.log(`[migrate-classes] created=${created} merged=${merged} total classes=${new Set([...existing.map(c => c.id), ...Array.from(groups.values()).map(g => `class-${norm(g.program)}-${norm(g.semester)}`)]).size}`)
  console.log('[migrate-classes] fertig — module.classIds + classes.* geschrieben.')
}

summary().catch(err => {
  console.error('migrate-classes failed:', err.message)
  process.exit(1)
})
