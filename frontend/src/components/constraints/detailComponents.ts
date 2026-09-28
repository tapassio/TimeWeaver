/**
 * Spec Fix 2026-09 — EINE Quelle für die Detailfeld-Komponente pro Regeltyp:
 * Sowohl der "Neue Regel"-Dialog als auch das Inline-Akkordeon in der
 * Regel-Zeile rendern DASSELBE Detail, keine zweite Editier-Komponente.
 */
import type { Component } from 'vue'
import NoWeekdayFields from './details/NoWeekdayFields.vue'
import ExcludeDatesFields from './details/ExcludeDatesFields.vue'
import RoomCapacityFields from './details/RoomCapacityFields.vue'
import PrerequisiteFields from './details/PrerequisiteFields.vue'
import TagRuleFields from './details/TagRuleFields.vue'
import GenericSoftFields from './details/GenericSoftFields.vue'

export const DETAIL_COMPONENTS: Record<string, Component> = {
  no_weekday: NoWeekdayFields,
  exclude_dates: ExcludeDatesFields,
  room_capacity: RoomCapacityFields,
  prerequisite: PrerequisiteFields,
  // Kap. 11.2 — Tag-basierte Regeln als eigene Kategorie "Tages-Tags"
  day_tags: TagRuleFields,
}

export function detailComponentFor(typeId: string): Component {
  return DETAIL_COMPONENTS[typeId] ?? GenericSoftFields
}
