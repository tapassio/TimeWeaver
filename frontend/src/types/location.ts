import type { AclInfo } from '@/types/curriculum'

export interface Location extends AclInfo {
  id?: string
  name: string
  campus?: string
  building: string
  address?: string
  latitude?: number
  longitude?: number
}

export type LocationExport = Location[]