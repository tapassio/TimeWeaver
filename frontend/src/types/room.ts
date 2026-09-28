import type { AclInfo } from '@/types/curriculum'

export type RoomType =
  | 'lecture_hall'
  | 'classroom'
  | 'computer_lab'
  | 'laboratory'
  | 'other'

export type LayoutType =
  | 'rows'
  | 'u_shape'
  | 'boardroom'
  | 'laboratory_benches'
  | 'computer_workstations'
  | 'other'

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export type ConnectionType =
  | 'HDMI'
  | 'DisplayPort'
  | 'USB-C'
  | 'VGA'
  | '3.5mm_audio'
  | 'Ethernet'

export type StreamingCameraType = 'fixed' | 'tracking' | 'pan_tilt_zoom'

export type StreamingCameraQuality = '720p' | '1080p' | '4k'

export interface RoomLayout {
  type?: LayoutType
  movable_desks?: boolean
  movable_chairs?: boolean
  group_work_possible?: boolean
  floor_area_m2?: number
}

export interface StreamingCamera {
  available: boolean
  type?: StreamingCameraType
  position?: string
  quality?: StreamingCameraQuality
}

export interface VideoConferencing {
  available: boolean
  system?: string
  supports_remote_participants?: boolean
}

export interface RoomEquipment {
  whiteboards: number
  blackboard?: boolean
  flipchart: boolean
  smartboard?: boolean
  projector: boolean
  projector_count?: number
  display_type?: string | string[]
  document_camera?: boolean
  lectern?: boolean
  speakers?: boolean
  microphone?: boolean
  lecture_capture?: boolean
  streaming_camera: StreamingCamera
  video_conferencing?: VideoConferencing
}

export interface RoomConnectivity {
  wifi?: boolean
  wired_network?: boolean
  network_speed_mbps?: number
  power_outlets?: number
  connections?: ConnectionType[]
  wireless_presentation?: boolean
}

export interface RoomAccessibility {
  step_free_access: boolean
  accessible_door?: boolean
  accessible_seating?: boolean
  hearing_loop?: boolean
  braille_signage?: boolean
  accessible_restrooms_nearby?: boolean
}

export interface RoomMaintenance {
  last_updated: string
}

export interface Room extends AclInfo {
  id?: string
  name: string
  roomType: RoomType
  owner?: string
  locationId?: string
  floor: number | string
  roomNumber: string
  capacity: number
  layout?: RoomLayout
  equipment?: RoomEquipment
  connectivity?: RoomConnectivity
  accessibility: RoomAccessibility
  maintenance?: RoomMaintenance
}

export type RoomExport = Room[]