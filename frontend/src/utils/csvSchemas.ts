import type { ImportType, ImportTypeConfig, ImportFieldDefinition, ColumnMapping } from '@/types/csvImport'
import type { Room, RoomType, LayoutType } from '@/types/room'
import type { Location } from '@/types/location'
import type { LecturerAvailability, SchedulingRule } from '@/types/schedule'
import type { RoomAvailability } from '@/types/roomAvailability'
import type { Week } from '@/types/week'
import type { ScheduleEntry } from '@/types/scheduleEntry'
import { parseCsv } from '@/utils/csvParser'

export function normalizeHeader(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function parseStringArray(val: any): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean)
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.map(String).map(s => s.trim()).filter(Boolean)
        }
      } catch {
        // fallback to delimiter split
      }
    }
    return trimmed
      .split(/[,;|]/)
      .map(s => s.trim())
      .filter(Boolean)
  }
  return [String(val).trim()].filter(Boolean)
}

export function autoMapColumns(headers: string[], fields: ImportFieldDefinition[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const usedHeaders = new Set<string>()

  // 1. Pass 1: Try exact or alias matches
  for (const field of fields) {
    const fieldNorm = normalizeHeader(field.key)
    const labelNorm = normalizeHeader(field.label)
    const aliasesNorm = field.aliases.map(normalizeHeader)

    let matchedHeader: string | null = null

    // Exact header match first
    for (const h of headers) {
      if (usedHeaders.has(h)) continue
      const hNorm = normalizeHeader(h)
      if (hNorm === fieldNorm || hNorm === labelNorm || aliasesNorm.includes(hNorm)) {
        matchedHeader = h
        break
      }
    }

    if (matchedHeader) {
      mapping[field.key] = matchedHeader
      usedHeaders.add(matchedHeader)
    } else {
      mapping[field.key] = null
    }
  }

  return mapping
}

/** Shared single source of truth for applying a ColumnMapping to parsed rows. */
export function applyColumnMapping(
  rows: Record<string, string>[],
  fields: ImportFieldDefinition[],
  mapping: ColumnMapping
): Record<string, any>[] {
  return rows.map(row => {
    const obj: Record<string, any> = {}
    for (const field of fields) {
      const header = mapping[field.key]
      if (header && row[header] !== undefined) {
        obj[field.key] = row[header]
      } else if (field.defaultValue !== undefined) {
        obj[field.key] = field.defaultValue
      }
    }
    return obj
  })
}

/**
 * Parse pasted/imported CSV text into typed entities through the central
 * import module (auto-mapping + schema transform). Used by composables that
 * accept CSV text so no duplicate parsers exist.
 */
export function parseImportText(type: ImportType, text: string): any[] {
  const config = IMPORT_CONFIGS[type]
  const parsed = parseCsv(text, { hasHeader: true })
  const mapping = autoMapColumns(parsed.headers, config.fields)
  return config.transform(applyColumnMapping(parsed.rows, config.fields, mapping))
}

export const IMPORT_CONFIGS: Record<ImportType, ImportTypeConfig> = {
  rooms: {
    type: 'rooms',
    label: 'Rooms',
    icon: 'mdi-door-open',
    description: 'Classrooms, lecture halls, computer labs, and seminar rooms.',
    entityName: 'Room',
    fields: [
      {
        key: 'name',
        label: 'Room Name',
        required: true,
        type: 'string',
        description: 'Human-readable name (e.g., Science Building 204)',
        aliases: ['name', 'room_name', 'room name', 'classroom', 'room', 'title', 'raum', 'raumname'],
      },
      {
        key: 'room_number',
        label: 'Room Number',
        required: true,
        type: 'string',
        description: 'Official room number or designation (e.g., 204, B12)',
        aliases: ['room_number', 'room number', 'room_nr', 'room nr', 'roomno', 'room no', 'nr', 'number', 'raumnummer'],
      },
      {
        key: 'floor',
        label: 'Floor',
        required: true,
        type: 'string',
        description: 'Floor number or label (e.g., 2, 0, basement)',
        aliases: ['floor', 'level', 'etage', 'stockwerk', 'floor_number', 'floor number'],
      },
      {
        key: 'room_type',
        label: 'Room Type',
        required: true,
        type: 'enum',
        description: 'lecture_hall, classroom, computer_lab, laboratory, or other',
        options: ['lecture_hall', 'classroom', 'computer_lab', 'laboratory', 'other'],
        defaultValue: 'classroom',
        aliases: ['room_type', 'room type', 'type', 'raumtyp', 'category', 'kind'],
      },
      {
        key: 'capacity_seats',
        label: 'Seat Capacity',
        required: true,
        type: 'number',
        description: 'Maximum number of regular seats',
        aliases: ['capacity_seats', 'capacity seats', 'seats', 'capacity', 'max_seats', 'plaetze', 'sitzplaetze'],
      },
      {
        key: 'location_id',
        label: 'Location ID / Building Ref',
        required: false,
        type: 'string',
        description: 'Reference to Location entity or location ID',
        aliases: ['location_id', 'location id', 'location', 'standort', 'building_ref'],
      },
      {
        key: 'owner',
        label: 'Owner / Contact',
        required: false,
        type: 'string',
        description: 'Contact person or department responsible for the room',
        aliases: ['owner', 'contact', 'responsible', 'verantwortlicher'],
      },
      {
        key: 'capacity_accessible_seats',
        label: 'Accessible Seats',
        required: false,
        type: 'number',
        description: 'Number of wheelchair-accessible seats',
        aliases: ['capacity_accessible_seats', 'accessible_seats', 'accessible seats', 'rollstuhlplaetze'],
      },
      {
        key: 'capacity_desks',
        label: 'Desks Count',
        required: false,
        type: 'number',
        description: 'Number of desks or workstations',
        aliases: ['capacity_desks', 'desks', 'tische', 'workstations'],
      },
      {
        key: 'capacity_standing_capacity',
        label: 'Standing Capacity',
        required: false,
        type: 'number',
        description: 'Maximum number of additional standing occupants',
        aliases: ['capacity_standing_capacity', 'standing_capacity', 'standing capacity', 'stehplaetze'],
      },
      {
        key: 'layout_type',
        label: 'Layout Type',
        required: false,
        type: 'enum',
        description: 'rows, u_shape, boardroom, laboratory_benches, computer_workstations, other',
        options: ['rows', 'u_shape', 'boardroom', 'laboratory_benches', 'computer_workstations', 'other'],
        aliases: ['layout_type', 'layout type', 'layout', 'bestuhlung'],
      },
      {
        key: 'layout_movable_desks',
        label: 'Movable Desks',
        required: false,
        type: 'boolean',
        description: 'Whether desks can be rearranged (true/false)',
        aliases: ['layout_movable_desks', 'movable_desks', 'movable desks'],
      },
      {
        key: 'layout_movable_chairs',
        label: 'Movable Chairs',
        required: false,
        type: 'boolean',
        description: 'Whether chairs can be moved (true/false)',
        aliases: ['layout_movable_chairs', 'movable_chairs', 'movable chairs'],
      },
      {
        key: 'layout_group_work_possible',
        label: 'Group Work Possible',
        required: false,
        type: 'boolean',
        description: 'Whether room layout is suitable for group work',
        aliases: ['layout_group_work_possible', 'group_work_possible', 'group work'],
      },
      {
        key: 'layout_floor_area_m2',
        label: 'Floor Area (m²)',
        required: false,
        type: 'number',
        description: 'Total floor area in square meters',
        aliases: ['layout_floor_area_m2', 'floor_area_m2', 'floor area', 'area', 'flaeche', 'sqm'],
      },
      {
        key: 'equipment_whiteboards',
        label: 'Whiteboards Count',
        required: false,
        type: 'number',
        description: 'Number of whiteboard surfaces',
        aliases: ['equipment_whiteboards', 'whiteboards', 'whiteboard'],
      },
      {
        key: 'equipment_blackboard',
        label: 'Blackboard',
        required: false,
        type: 'boolean',
        description: 'Whether chalkboard is present',
        aliases: ['equipment_blackboard', 'blackboard', 'tafel'],
      },
      {
        key: 'equipment_flipchart',
        label: 'Flipchart',
        required: false,
        type: 'boolean',
        description: 'Whether flipchart is available',
        aliases: ['equipment_flipchart', 'flipchart'],
      },
      {
        key: 'equipment_smartboard',
        label: 'Smartboard',
        required: false,
        type: 'boolean',
        description: 'Whether interactive smartboard is installed',
        aliases: ['equipment_smartboard', 'smartboard'],
      },
      {
        key: 'equipment_projector',
        label: 'Projector (Beamer)',
        required: false,
        type: 'boolean',
        description: 'Whether a digital video projector is available',
        aliases: ['equipment_projector', 'projector', 'beamer'],
      },
      {
        key: 'equipment_projector_count',
        label: 'Projector Count',
        required: false,
        type: 'number',
        description: 'Number of installed projectors',
        aliases: ['equipment_projector_count', 'projector_count', 'projectors'],
      },
      {
        key: 'equipment_document_camera',
        label: 'Document Camera',
        required: false,
        type: 'boolean',
        description: 'Visualizer / document camera available',
        aliases: ['equipment_document_camera', 'document_camera', 'visualizer'],
      },
      {
        key: 'equipment_lectern',
        label: 'Lectern / Podium',
        required: false,
        type: 'boolean',
        description: 'Whether a speaker lectern is provided',
        aliases: ['equipment_lectern', 'lectern', 'podium', 'rednerpult'],
      },
      {
        key: 'equipment_speakers',
        label: 'Speakers (Audio)',
        required: false,
        type: 'boolean',
        description: 'Installed sound reinforcement speakers',
        aliases: ['equipment_speakers', 'speakers', 'sound_system', 'lautsprecher'],
      },
      {
        key: 'equipment_microphone',
        label: 'Microphone',
        required: false,
        type: 'boolean',
        description: 'Fixed or wireless microphone available',
        aliases: ['equipment_microphone', 'microphone', 'mic', 'mikrofon'],
      },
      {
        key: 'equipment_lecture_capture',
        label: 'Lecture Capture',
        required: false,
        type: 'boolean',
        description: 'Automated recording / streaming equipment installed',
        aliases: ['equipment_lecture_capture', 'lecture_capture', 'recording'],
      },
      {
        key: 'equipment_streaming_camera_available',
        label: 'Streaming Camera',
        required: false,
        type: 'boolean',
        description: 'Whether a streaming / webcam camera is available',
        aliases: ['equipment_streaming_camera_available', 'streaming_camera', 'camera', 'webcam'],
      },
      {
        key: 'equipment_video_conferencing_available',
        label: 'Video Conferencing',
        required: false,
        type: 'boolean',
        description: 'Integrated Zoom / Teams video conference system',
        aliases: ['equipment_video_conferencing_available', 'video_conferencing', 'videoconference', 'teams_room', 'zoom_room'],
      },
      {
        key: 'connectivity_wifi',
        label: 'WiFi Available',
        required: false,
        type: 'boolean',
        description: 'Wireless internet connectivity available',
        aliases: ['connectivity_wifi', 'wifi', 'wlan'],
      },
      {
        key: 'connectivity_wired_network',
        label: 'Wired Network (Ethernet)',
        required: false,
        type: 'boolean',
        description: 'Ethernet wall jacks available',
        aliases: ['connectivity_wired_network', 'wired_network', 'ethernet', 'lan'],
      },
      {
        key: 'connectivity_network_speed_mbps',
        label: 'Network Speed (Mbps)',
        required: false,
        type: 'number',
        description: 'Network bandwidth in Mbps',
        aliases: ['connectivity_network_speed_mbps', 'network_speed_mbps', 'network_speed', 'speed_mbps'],
      },
      {
        key: 'connectivity_power_outlets',
        label: 'Power Outlets Count',
        required: false,
        type: 'number',
        description: 'Number of accessible AC power sockets for students',
        aliases: ['connectivity_power_outlets', 'power_outlets', 'outlets', 'steckdosen'],
      },
      {
        key: 'accessibility_step_free_access',
        label: 'Step-Free Access',
        required: false,
        type: 'boolean',
        description: 'Wheelchair / step-free accessible entrance',
        aliases: ['accessibility_step_free_access', 'step_free_access', 'accessible', 'wheelchair', 'barrierefrei'],
      },
    ],
    transform: (mappedRows: Record<string, any>[]): Room[] => {
      return mappedRows.map(obj => {
        const floorVal = obj.floor ?? '0'
        const floorNum = Number(floorVal)
        const floor = isNaN(floorNum) ? String(floorVal) : floorNum

        let room_type: RoomType = 'classroom'
        const rt = (obj.room_type || '').toLowerCase().trim()
        if (['lecture_hall', 'classroom', 'computer_lab', 'laboratory', 'other'].includes(rt)) {
          room_type = rt as RoomType
        }

        const room: Room = {
          name: String(obj.name || ''),
          roomType: room_type,
          floor,
          roomNumber: String(obj.room_number || ''),
          capacity: Number(obj.capacity_seats) || 0,
          accessibility: {
            step_free_access: parseBoolean(obj.accessibility_step_free_access),
          },
        }

        if (obj.location_id) room.locationId = String(obj.location_id)
        if (obj.owner) room.owner = String(obj.owner)

        const layout: any = {}
        if (obj.layout_type) {
          const lt = String(obj.layout_type).toLowerCase().trim()
          if (['rows', 'u_shape', 'boardroom', 'laboratory_benches', 'computer_workstations', 'other'].includes(lt)) {
            layout.type = lt as LayoutType
          }
        }
        if (obj.layout_movable_desks !== undefined && obj.layout_movable_desks !== '') {
          layout.movable_desks = parseBoolean(obj.layout_movable_desks)
        }
        if (obj.layout_movable_chairs !== undefined && obj.layout_movable_chairs !== '') {
          layout.movable_chairs = parseBoolean(obj.layout_movable_chairs)
        }
        if (obj.layout_group_work_possible !== undefined && obj.layout_group_work_possible !== '') {
          layout.group_work_possible = parseBoolean(obj.layout_group_work_possible)
        }
        if (obj.layout_floor_area_m2 !== undefined && obj.layout_floor_area_m2 !== '') {
          layout.floor_area_m2 = Number(obj.layout_floor_area_m2) || undefined
        }
        if (Object.keys(layout).length > 0) room.layout = layout

        const equipment: any = {}
        if (obj.equipment_whiteboards !== undefined && obj.equipment_whiteboards !== '') {
          equipment.whiteboards = Number(obj.equipment_whiteboards) || 0
        }
        if (obj.equipment_blackboard !== undefined && obj.equipment_blackboard !== '') {
          equipment.blackboard = parseBoolean(obj.equipment_blackboard)
        }
        if (obj.equipment_flipchart !== undefined && obj.equipment_flipchart !== '') {
          equipment.flipchart = parseBoolean(obj.equipment_flipchart)
        }
        if (obj.equipment_smartboard !== undefined && obj.equipment_smartboard !== '') {
          equipment.smartboard = parseBoolean(obj.equipment_smartboard)
        }
        if (obj.equipment_projector !== undefined && obj.equipment_projector !== '') {
          equipment.projector = parseBoolean(obj.equipment_projector)
        }
        if (obj.equipment_projector_count !== undefined && obj.equipment_projector_count !== '') {
          equipment.projector_count = Number(obj.equipment_projector_count) || undefined
        }
        if (obj.equipment_document_camera !== undefined && obj.equipment_document_camera !== '') {
          equipment.document_camera = parseBoolean(obj.equipment_document_camera)
        }
        if (obj.equipment_lectern !== undefined && obj.equipment_lectern !== '') {
          equipment.lectern = parseBoolean(obj.equipment_lectern)
        }
        if (obj.equipment_speakers !== undefined && obj.equipment_speakers !== '') {
          equipment.speakers = parseBoolean(obj.equipment_speakers)
        }
        if (obj.equipment_microphone !== undefined && obj.equipment_microphone !== '') {
          equipment.microphone = parseBoolean(obj.equipment_microphone)
        }
        if (obj.equipment_lecture_capture !== undefined && obj.equipment_lecture_capture !== '') {
          equipment.lecture_capture = parseBoolean(obj.equipment_lecture_capture)
        }
        if (obj.equipment_streaming_camera_available !== undefined && obj.equipment_streaming_camera_available !== '') {
          equipment.streaming_camera = { available: parseBoolean(obj.equipment_streaming_camera_available) }
        }
        if (obj.equipment_video_conferencing_available !== undefined && obj.equipment_video_conferencing_available !== '') {
          equipment.video_conferencing = { available: parseBoolean(obj.equipment_video_conferencing_available) }
        }
        if (Object.keys(equipment).length > 0) room.equipment = equipment

        const connectivity: any = {}
        if (obj.connectivity_wifi !== undefined && obj.connectivity_wifi !== '') {
          connectivity.wifi = parseBoolean(obj.connectivity_wifi)
        }
        if (obj.connectivity_wired_network !== undefined && obj.connectivity_wired_network !== '') {
          connectivity.wired_network = parseBoolean(obj.connectivity_wired_network)
        }
        if (obj.connectivity_network_speed_mbps !== undefined && obj.connectivity_network_speed_mbps !== '') {
          connectivity.network_speed_mbps = Number(obj.connectivity_network_speed_mbps) || undefined
        }
        if (obj.connectivity_power_outlets !== undefined && obj.connectivity_power_outlets !== '') {
          connectivity.power_outlets = Number(obj.connectivity_power_outlets) || undefined
        }
        if (Object.keys(connectivity).length > 0) room.connectivity = connectivity

        return room
      })
    },
  },

  locations: {
    type: 'locations',
    label: 'Locations',
    icon: 'mdi-map-marker',
    description: 'Campuses, buildings, and geographic sites.',
    entityName: 'Location',
    fields: [
      {
        key: 'name',
        label: 'Location Name',
        required: true,
        type: 'string',
        description: 'Human-readable name (e.g., North Campus, Science Building)',
        aliases: ['name', 'location_name', 'location name', 'location', 'site', 'standort', 'bezeichnung'],
      },
      {
        key: 'building',
        label: 'Building',
        required: true,
        type: 'string',
        description: 'Building name or code (e.g., Science Building, Main Building)',
        aliases: ['building', 'building_name', 'building name', 'gebaeude', 'house', 'haus'],
      },
      {
        key: 'campus',
        label: 'Campus',
        required: false,
        type: 'string',
        description: 'Campus name or code (e.g., North Campus, Campus Bern)',
        aliases: ['campus', 'campus_name', 'areal', 'site_name'],
      },
      {
        key: 'address',
        label: 'Address',
        required: false,
        type: 'string',
        description: 'Postal or street address',
        aliases: ['address', 'street', 'strasse', 'adresse', 'postal_address'],
      },
      {
        key: 'latitude',
        label: 'Latitude',
        required: false,
        type: 'number',
        description: 'Geographic latitude in decimal degrees (e.g. 52.5201)',
        aliases: ['latitude', 'lat', 'breitengrad'],
      },
      {
        key: 'longitude',
        label: 'Longitude',
        required: false,
        type: 'number',
        description: 'Geographic longitude in decimal degrees (e.g. 13.4049)',
        aliases: ['longitude', 'lon', 'lng', 'laengengrad'],
      },
    ],
    transform: (mappedRows: Record<string, any>[]): Location[] => {
      return mappedRows.map(obj => {
        const loc: Location = {
          name: String(obj.name || ''),
          building: String(obj.building || ''),
        }
        if (obj.campus) loc.campus = String(obj.campus)
        if (obj.address) loc.address = String(obj.address)
        if (obj.latitude !== undefined && obj.latitude !== '') {
          loc.latitude = Number(obj.latitude) || undefined
        }
        if (obj.longitude !== undefined && obj.longitude !== '') {
          loc.longitude = Number(obj.longitude) || undefined
        }
        return loc
      })
    },
  },

  availability: {
    type: 'availability',
    label: 'Lecturer Availability',
    icon: 'mdi-calendar-clock',
    description: 'Recurring weekly availability for lecturers.',
    entityName: 'Availability',
    fields: [
      {
        key: 'lecturerId',
        label: 'Lecturer ID',
        required: true,
        type: 'string',
        description: 'ID or name of the lecturer',
        aliases: ['lecturer_id', 'lecturer id', 'lecturer', 'dozent', 'dozentid', 'instructor', 'instructor_id', 'teacher'],
      },
      {
        key: 'weekId',
        label: 'Week ID',
        required: false,
        type: 'string',
        description: 'ID of the week this availability slot applies to',
        aliases: ['week_id', 'week id', 'week', 'woche'],
      },
      {
        key: 'weekday',
        label: 'Weekday',
        required: false,
        type: 'enum',
        description: 'Day of the week for recurring availability',
        options: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
          'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag',
          'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        aliases: ['weekday', 'day', 'day_of_week', 'wochentag', 'tag', 'dayofweek'],
      },
      {
        key: 'startTime',
        label: 'Start Time',
        required: false,
        type: 'string',
        description: 'Start time of availability slot (HH:MM format)',
        aliases: ['start_time', 'start', 'von', 'begin', 'beginn', 'start_time'],
      },
      {
        key: 'endTime',
        label: 'End Time',
        required: false,
        type: 'string',
        description: 'End time of availability slot (HH:MM format)',
        aliases: ['end_time', 'end', 'bis', 'ende', 'end_time'],
      },
    ],
    transform: (mappedRows: Record<string, any>[]): LecturerAvailability[] => {
      return mappedRows.map(row => {
        let wd = String(row.weekday || 'monday').toLowerCase().trim()
        const dayMap: Record<string, string> = {
          montag: 'monday', dienstag: 'tuesday', mittwoch: 'wednesday',
          donnerstag: 'thursday', freitag: 'friday', samstag: 'saturday', sonntag: 'sunday',
          mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
          fri: 'friday', sat: 'saturday', sun: 'sunday',
        }
        wd = dayMap[wd] || wd
        const avail: LecturerAvailability = {
          lecturerId: String(row.lecturerId || '').trim(),
          weekday: wd as any,
          startTime: String(row.startTime || '08:00'),
          endTime: String(row.endTime || '12:00'),
        }
        if (row.weekId) avail.weekId = String(row.weekId).trim()
        return avail
      })
    },
  },

  scheduling_rules: {
    type: 'scheduling_rules',
    label: 'Scheduling Rules',
    icon: 'mdi-tune-vertical',
    description: 'Constraint rules for CP-SAT timetable generation.',
    entityName: 'Rule',
    fields: [
      {
        key: 'ruleType',
        label: 'Rule Type',
        required: true,
        type: 'enum',
        description: 'The scheduling constraint to apply',
        options: [
          'NO_TEACHER_OVERLAP', 'ROOM_CAPACITY', 'ROOM_OCCUPANCY', 'UNAVAILABLE_DATES',
          'ALLOWED_WEEKDAYS', 'ALLOWED_PHASE', 'FIXED_DAY', 'WEEKLY_BALANCE',
          'AVOID_FRIDAY_AFTERNOON', 'AVOID_SATURDAY', 'PREFER_MORNING',
          'AVOID_EVENING', 'MINIMIZE_STUDENT_GAPS', 'PREFER_EARLY_DATES',
        ],
        aliases: ['ruletype', 'rule_type', 'rule type', 'constraint_id', 'constraint', 'rule', 'regel', 'constraintid', 'rule_id'],
      },
      {
        key: 'semesterId',
        label: 'Semester ID',
        required: true,
        type: 'string',
        description: 'ID of the semester this rule applies to',
        aliases: ['semester_id', 'semester id', 'semester', 'semesterid'],
      },
      {
        key: 'category',
        label: 'Category',
        required: true,
        type: 'enum',
        description: 'hard (must satisfy) or soft (preference with penalty)',
        options: ['hard', 'soft'],
        aliases: ['category', 'kategorie', 'type', 'constraint_category'],
      },
      {
        key: 'weight',
        label: 'Priority Level',
        required: false,
        type: 'string',
        description: 'Priority for soft constraints: nice-to-have(1), preferred(5), desired(10), almost mandatory(20). Also accepts numeric values.',
        defaultValue: 1,
        aliases: ['weight', 'gewicht', 'penalty', 'priority', 'priority_level'],
      },
      {
        key: 'enabled',
        label: 'Enabled',
        required: false,
        type: 'boolean',
        description: 'Whether this rule is active (true/false)',
        defaultValue: true,
        aliases: ['enabled', 'active', 'aktiv', 'is_enabled'],
      },
      {
        key: 'description',
        label: 'Description',
        required: false,
        type: 'string',
        description: 'Human-readable description of the rule',
        aliases: ['description', 'beschreibung', 'desc', 'text', 'note'],
      },
      {
        key: 'appliesTo',
        label: 'Applies To',
        required: false,
        type: 'string',
        description: 'Module IDs or names this rule applies to (comma-separated, empty = all)',
        aliases: ['applies_to', 'applies', 'targets', 'modules', 'module_ids', 'gilt_fuer'],
      },
    ],
    transform: (mappedRows: Record<string, any>[]): SchedulingRule[] => {
      const WEIGHT_MAP: Record<string, number> = {
        'nice-to-have': 1,
        'nice to have': 1,
        'preferred': 5,
        'desired': 10,
        'almost mandatory': 20,
        'almost-mandatory': 20,
      }
      return mappedRows.map(row => {
        let weight: number
        const rawWeight = String(row.weight ?? '1').trim().toLowerCase()
        if (WEIGHT_MAP[rawWeight] !== undefined) {
          weight = WEIGHT_MAP[rawWeight]
        } else {
          weight = Number(row.weight) || 1
        }
        const rule: SchedulingRule = {
          ruleType: String(row.ruleType || ''),
          semesterId: String(row.semesterId || ''),
          category: row.category === 'soft' ? 'soft' : 'hard',
          weight,
          enabled: parseBoolean(row.enabled ?? true),
          description: row.description ? String(row.description) : undefined,
          appliesTo: row.appliesTo ? parseStringArray(row.appliesTo) : undefined,
          params: undefined,
        }
        if (rule.category === 'hard') {
          rule.weight = 1
        }
        return rule
      })
    },
  },

  room_availability: {
    type: 'room_availability',
    label: 'Room Availability',
    icon: 'mdi-calendar-clock-outline',
    description: 'Recurring weekly availability for rooms.',
    entityName: 'Room Availability',
    fields: [
      {
        key: 'roomId',
        label: 'Room ID',
        required: true,
        type: 'string',
        description: 'ID of the room',
        aliases: ['room_id', 'room id', 'room', 'roomid', 'raum', 'raum_id'],
      },
      {
        key: 'weekId',
        label: 'Week ID',
        required: false,
        type: 'string',
        description: 'ID of the week this availability slot applies to',
        aliases: ['week_id', 'week id', 'week', 'woche'],
      },
      {
        key: 'weekday',
        label: 'Weekday',
        required: true,
        type: 'enum',
        description: 'Day of the week for recurring availability',
        options: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunnday',
          'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
        aliases: ['weekday', 'day', 'day_of_week', 'wochentag', 'tag'],
      },
      {
        key: 'startTime',
        label: 'Start Time',
        required: true,
        type: 'string',
        description: 'Start time of availability slot (HH:MM format)',
        aliases: ['start_time', 'start', 'von', 'begin', 'beginn'],
      },
      {
        key: 'endTime',
        label: 'End Time',
        required: true,
        type: 'string',
        description: 'End time of availability slot (HH:MM format)',
        aliases: ['end_time', 'end', 'bis', 'ende'],
      },
    ],
    transform: (mappedRows: Record<string, any>[]): RoomAvailability[] => {
      return mappedRows.map(row => {
        let wd = String(row.weekday || 'monday').toLowerCase().trim()
        const dayMap: Record<string, string> = {
          montag: 'monday', dienstag: 'tuesday', mittwoch: 'wednesday',
          donnerstag: 'thursday', freitag: 'friday', samstag: 'saturday', sonntag: 'sunday',
          mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
          fri: 'friday', sat: 'saturday', sun: 'sunday',
        }
        wd = dayMap[wd] || wd
        const avail: RoomAvailability = {
          roomId: String(row.roomId || '').trim(),
          weekday: wd as any,
          startTime: String(row.startTime || '08:00'),
          endTime: String(row.endTime || '12:00'),
        }
        if (row.weekId) avail.weekId = String(row.weekId).trim()
        return avail
      })
    },
  },

  weeks: {
    type: 'weeks',
    label: 'Weeks',
    icon: 'mdi-calendar-week',
    description: 'Calendar weeks within a semester, including days off.',
    entityName: 'Week',
    fields: [
      {
        key: 'semesterId',
        label: 'Semester ID',
        required: true,
        type: 'string',
        description: 'ID of the semester this week belongs to',
        aliases: ['semester_id', 'semester id', 'semester', 'semesterid'],
      },
      {
        key: 'semesterWeek',
        label: 'Semester Week',
        required: true,
        type: 'number',
        description: 'Week number within the semester (1-based)',
        aliases: ['semesterweek', 'semester_week', 'semester week', 'week_number', 'woche', 'kalenderwoche'],
      },
      {
        key: 'startDate',
        label: 'Start Date',
        required: true,
        type: 'string',
        description: 'First day of the week (YYYY-MM-DD)',
        aliases: ['start_date', 'start date', 'start', 'beginn', 'von'],
      },
      {
        key: 'endDate',
        label: 'End Date',
        required: true,
        type: 'string',
        description: 'Last day of the week (YYYY-MM-DD)',
        aliases: ['end_date', 'end date', 'end', 'ende', 'bis'],
      },
      {
        key: 'daysOff',
        label: 'Days Off',
        required: false,
        type: 'string',
        description: 'Dates without teaching (comma-separated YYYY-MM-DD)',
        aliases: ['daysoff', 'days_off', 'days off', 'holidays', 'feiertage', 'freie_tage'],
      },
    ],
    transform: (mappedRows: Record<string, any>[]): Week[] => {
      return mappedRows.map(row => {
        const week: Week = {
          semesterId: String(row.semesterId || '').trim(),
          semesterWeek: Number(row.semesterWeek) || 1,
          startDate: String(row.startDate || '').trim(),
          endDate: String(row.endDate || '').trim(),
        }
        const daysOff = parseStringArray(row.daysOff)
        if (daysOff.length > 0) week.daysOff = daysOff
        if (row.id) week.id = String(row.id)
        return week
      })
    },
  },

  schedule_entries: {
    type: 'schedule_entries',
    label: 'Schedule Entries',
    icon: 'mdi-calendar-clock-outline',
    description: 'Scheduled sessions within a week: modules, rooms, classes, lecturers, weekday and time window.',
    entityName: 'Schedule Entry',
    fields: [
      {
        key: 'weekId',
        label: 'Week ID',
        required: true,
        type: 'string',
        description: 'ID of the week this entry belongs to',
        aliases: ['week_id', 'week id', 'week', 'woche'],
      },
      {
        key: 'moduleIds',
        label: 'Module IDs',
        required: false,
        type: 'string',
        description: 'Module IDs (comma, semicolon, or pipe separated)',
        aliases: ['moduleids', 'module_ids', 'module ids', 'modules', 'modul', 'modul_ids'],
      },
      {
        key: 'roomIds',
        label: 'Room IDs',
        required: false,
        type: 'string',
        description: 'Room IDs (comma, semicolon, or pipe separated)',
        aliases: ['roomids', 'room_ids', 'room ids', 'rooms', 'raum', 'raum_ids'],
      },
      {
        key: 'classIds',
        label: 'Class IDs',
        required: false,
        type: 'string',
        description: 'Class IDs (comma, semicolon, or pipe separated)',
        aliases: ['classids', 'class_ids', 'class ids', 'classes', 'klasse', 'klassen'],
      },
      {
        key: 'lecturerIds',
        label: 'Lecturer IDs',
        required: false,
        type: 'string',
        description: 'Lecturer IDs (comma, semicolon, or pipe separated)',
        aliases: ['lecturerids', 'lecturer_ids', 'lecturer ids', 'lecturers', 'dozent', 'dozenten'],
      },
      {
        key: 'weekday',
        label: 'Weekday',
        required: true,
        type: 'enum',
        description: 'Day of the week for the session',
        options: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
          'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
        aliases: ['weekday', 'day', 'day_of_week', 'wochentag', 'tag'],
      },
      {
        key: 'startTime',
        label: 'Start Time',
        required: true,
        type: 'string',
        description: 'Start time (HH:MM format)',
        aliases: ['start_time', 'start', 'von', 'begin', 'beginn'],
      },
      {
        key: 'endTime',
        label: 'End Time',
        required: true,
        type: 'string',
        description: 'End time (HH:MM format)',
        aliases: ['end_time', 'end', 'bis', 'ende'],
      },
    ],
    transform: (mappedRows: Record<string, any>[]): ScheduleEntry[] => {
      return mappedRows.map(row => {
        let wd = String(row.weekday || 'monday').toLowerCase().trim()
        const dayMap: Record<string, string> = {
          montag: 'monday', dienstag: 'tuesday', mittwoch: 'wednesday',
          donnerstag: 'thursday', freitag: 'friday', samstag: 'saturday', sonntag: 'sunday',
          mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
          fri: 'friday', sat: 'saturday', sun: 'sunday',
        }
        wd = dayMap[wd] || wd
        const entry: ScheduleEntry = {
          weekId: String(row.weekId || '').trim(),
          moduleIds: parseStringArray(row.moduleIds),
          roomIds: parseStringArray(row.roomIds),
          classIds: parseStringArray(row.classIds),
          lecturerIds: parseStringArray(row.lecturerIds),
          weekday: wd as any,
          startTime: String(row.startTime || '08:00'),
          endTime: String(row.endTime || '12:00'),
        }
        if (row.id) entry.id = String(row.id)
        return entry
      })
    },
  },
}

function parseBoolean(val: any): boolean {
  if (typeof val === 'boolean') return val
  if (!val) return false
  const s = String(val).toLowerCase().trim()
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'ja' || s === 't'
}
