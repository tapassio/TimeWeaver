/**
 * Seed des generischen Entity-Stores mit den Mock-/Demodaten aus mockGUI/data.
 * Nutzt die unveränderte REST-API (POST /api/:table), funktioniert also gegen
 * In-Memory-Fallback und Postgres gleichermaßen.
 *
 *   npm run seed
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const API = process.env.SEED_API_URL ?? 'http://localhost:3000/api'
const dataDir = resolve(process.cwd(), 'mockGUI/data')

// JSON-Datei -> Entity-Tabelle
const tableMap: Record<string, string> = {
  'programs.json': 'programs',
  'terms.json': 'terms',
  'modules.json': 'modules',
  'objectives.json': 'objectives',
  'objective-relationships.json': 'objective_relationships',
  'objective-mappings.json': 'objective_mappings',
  'competencies.json': 'competencies',
  'proof-of-knowledge.json': 'proof_of_knowledge',
  'semesters.json': 'semesters',
  'contact-blocks.json': 'contact_blocks',
  'instructors.json': 'instructors',
  'instructor-availability.json': 'instructor_availability',
  'locations.json': 'locations',
  'rooms.json': 'rooms',
  'communications.json': 'communications',
  'rubrics.json': 'rubrics',
  'assessment-results.json': 'assessment_results',
  'improvement-actions.json': 'improvement_actions',
  'todos.json': 'todos',
}


/**
 * Learning Cycles aus den echten Modul-Excels (Detailed Module Concept,
 * ein Sheet pro Modul) einspielen — gleiche Struktur wie der App-Excel-Import.
 * I-R-M-Level für Demo: LC1 -> I, letzte LC -> M, dazwischen R.
 */
import { existsSync } from 'node:fs'
import * as XLSX from 'xlsx'

interface SeedLc {
  id: string
  moduleId: string
  structuralElement: string
  learningGoals: string
  mainContent: string
  didactics: string
  assignmentDescription?: string
  assignmentType?: string
  gradingPercentage?: number
  level?: 'I' | 'R' | 'M'
  sourceFile: string
  sourceRow: number
  version: string
}

const conceptFiles = [
  'DBA_Module_Concept_Semester1_HS2026.xlsx',
  'DBA_Module_Concept_Semester2_FS2027.xlsx',
  'DBA_Module_Concept_Semester3_HS2027.xlsx',
]

const moduleNameByModuleId = new Map<string, string>()

function seedLearningCycles(): SeedLc[] {
  const lcs: SeedLc[] = []
  for (const file of conceptFiles) {
    const path = resolve(dataDir, file)
    if (!existsSync(path)) continue
    const buf = readFileSync(path)
    const wb = XLSX.read(buf, { type: 'buffer' })
    for (const sheetName of wb.SheetNames) {
      const aoa: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]!, {
        header: 1, blankrows: false, defval: '', raw: false,
      })
      if (aoa.length < 5) continue
      const programMatch = String(aoa[0]![0] ?? '').match(/-\s*(.+)$/)
      const moduleMatch = String(aoa[1]![0] ?? '').match(/^\s*([A-Z]{2,}\d*)\s*-\s*(.+?)\s*\((\d+)\s*ECTS\)/)
      if (!programMatch || !moduleMatch) continue // Overview-Sheets (Module Coordination/Parameters) skippen
      const program = (programMatch[1] ?? sheetName).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const code = (moduleMatch[1] ?? sheetName).toLowerCase()
      const moduleId = `mod-${program}-${code}`
      // Kap Spec (Übersicht): echten Modulnamen aus Titelzeile mitführen
      moduleNameByModuleId.set(moduleId, (moduleMatch[2] ?? sheetName).trim())
      const lcNumbers: number[] = []
      for (const row of aoa.slice(4)) {
        const m = String(row[0] ?? '').match(/Learning Cycle\s*(\d+)/i)
        if (m?.[1]) lcNumbers.push(Number(m[1]))
      }
      const lastN = Math.max(0, ...lcNumbers)
      for (const row of aoa.slice(4)) {
        const m = String(row[0] ?? '').match(/Learning Cycle\s*(\d+)/i)
        if (!m?.[1]) continue
        const n = Number(m[1])
        const goals = String(row[2] ?? '').trim()
        const content = String(row[3] ?? '').trim()
        if (!goals && !content) continue
        const typeRaw = String(row[6] ?? '').trim()
        lcs.push({
          id: `${moduleId}-lc${n}`,
          moduleId,
          structuralElement: `Learning Cycle ${n}`,
          learningGoals: goals,
          mainContent: content,
          didactics: String(row[4] ?? '').trim(),
          assignmentDescription: String(row[5] ?? '').trim() || undefined,
          assignmentType: typeRaw === 'Graded' ? 'Graded' : typeRaw === 'Pass/Fail' ? 'Pass/Fail' : 'Non-graded',
          gradingPercentage: Number(String(row[7] ?? '').trim()) || undefined,
          level: n === 1 ? 'I' : n === lastN ? 'M' : 'R',
          sourceFile: file,
          sourceRow: n,
          version: 'seed-v1',
        })
      }
    }
  }
  return lcs
}


/**
 * Todos fürs Kanban vorbereiten (Kap.-Testdaten):
 * Jedes Todo bekommt ein Enddatum (due_date). Verteilung der Beispiel-Daten so,
 * dass alle 4 Kanban-Spalten befüllt sind:
 *   backlog  -> nicht in den nächsten 2 Wochen fällig  (Col „Todos“)
 *   soon     -> fällig in <= 14 Tagen                  (Col „bald fällig“)
 *   wip      -> Status in_progress                     (Col „in Bearbeitung“)
 *   done     -> Status done                            (Col „erledigt“)
 */
function enrichTodo(todo: Record<string, unknown>, idx: number): Record<string, unknown> {
  const pattern = idx % 4
  const offsets: Record<string, number> = {
    // pattern 0 → backlog (weite Zukunft), 1 → bald (heute+kurz), 2 → wip, 3 → done
    0: 30 + (idx % 3) * 5,
    1: 2 + (idx % 13),
    2: 14 + (idx % 9),
    3: 5 + (idx % 11),
  }
  const dueOffset = offsets[String(pattern)]!
  const base = new Date()
  base.setDate(base.getDate() + dueOffset)
  const due = base.toISOString().slice(0, 10)
  const status = pattern === 2 ? 'in_progress' : pattern === 3 ? 'done' : 'open'
  return { ...todo, due_date: due, status }
}

async function post(table: string, items: any[]) {
  for (const item of items) {
    const id = item._id ?? item.id
    const res = await fetch(`${API}/${table}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    })
    if (!res.ok) throw new Error(`${table}/${id}: HTTP ${res.status}`)
  }
  return items.length
}


/**
 * Kap. curriculum-overview-spec — auch die strukturierten CurriculumModule
 * (Gruppe pro Modul mit Semester) einspeisen — die Mapping-Übersicht liest
 * /api/curriculum_modules (nicht die flat learning_cycles-Tabelle).
 */
function seedCurriculumModules(): Array<Record<string, unknown>> {
  const lcs = seedLearningCycles()
  const byModule = new Map<string, Record<string, unknown>>()
  for (const lc of lcs) {
    let mod = byModule.get(lc.moduleId) as Record<string, unknown> | undefined
    if (!mod) {
      mod = {
        id: lc.moduleId,
        name: moduleNameByModuleId.get(lc.moduleId) ?? lc.moduleId,
        studyProgramId: 'MSc Digital Business Administration',
        semester: inferSemesterFromLc(lc),
        learningCycles: [] as unknown[],
      }
      byModule.set(lc.moduleId, mod)
    }
    ;(mod.learningCycles as unknown[]).push(lc)
  }
  return [...byModule.values()]
}

function inferSemesterFromLc(lc: SeedLc): number {
  // Semester-Zuordnung über sourceFile (Semester1/2/3)
  const m = (lc.sourceFile || '').match(/Semester(\d+)/i)
  return m ? Number(m[1]) : 0
}


async function main() {
  let total = 0
  for (const file of readdirSync(dataDir)) {
    const table = tableMap[file]
    if (!table) continue
    const items = JSON.parse(readFileSync(resolve(dataDir, file), 'utf-8'))
    if (!Array.isArray(items) || items.length === 0) continue
    const enriched = file === 'todos.json'
      ? items.map((t: Record<string, unknown>, i: number) => enrichTodo(t, i))
      : items
    const count = await post(table, enriched)
    total += count
    console.log(`✓ ${file} -> ${table}: ${count} Einträge`)
  }
  // Learning Cycles aus den Modul-Excels (Content-Mapping braucht echte LCs)
  const lcs = seedLearningCycles()
  if (lcs.length) {
    const savedLc = await post('learning_cycles', lcs)
    total += savedLc
    console.log(`✓ Modul-Excels -> learning_cycles: ${savedLc} Learning Cycles`)
    const mods = seedCurriculumModules()
    const savedMods = await post('curriculum_modules', mods)
    total += savedMods
    console.log(`✓ Modul-Excels -> curriculum_modules: ${savedMods} CurriculumModules`)
  }

  console.log(`Done: ${total} Einträge gesamt gesendet nach ${API}`)
}

main().catch(err => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
