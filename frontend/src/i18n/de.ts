/**
 * UI-Beschriftungen: DEUTSCH (Referenzsprache).
 * Schlüsselbezeichnungen `nav.*`, `common.*`, `views.*` werden von views via useI18n().t(key) gelesen.
 */
export const de: Record<string, string> = {
  // Brand
  'app.title': 'TimeWeaver',
  'app.logout': 'Abmelden',

  // Navigation
  'nav.dashboard': 'Dashboard',
  'nav.curriculum': 'Curriculum',
  'nav.taxonomy': 'Taxonomy',
  'nav.modules': 'Modules',
  'nav.mapping': 'Mapping',
  'nav.availability': 'Verfügbarkeit',
  'nav.schedule': 'Planung',
  'nav.todos': 'Todos',
  'nav.constraints': 'Regeln & Constraints',
  'nav.rooms': 'Räume & Standorte',
  'nav.conflicts': 'Konflikte',
  'nav.reports': 'Berichte',
  'nav.admin': 'Admin',
  'nav.settings': 'Einstellungen',

  // Dashboard
  'dashboard.title': 'Übersicht',
  'dashboard.subtitle': 'Programme, Todos und Konflikte auf den ersten Blick.',
  'dashboard.programs': 'Programme',
  'dashboard.nextBlocks': 'Nächste On-Campus-Blöcke',
  'dashboard.upcomingComms': 'Zukünftige Kommunikationen',
  'dashboard.openTodos': 'Offene Todos',
  'dashboard.incl_conflicts': 'inkl. dynamisch erkannter Terminkonflikte',
  'dashboard.noBlocks': 'Keine kommenden Blöcke.',
  'dashboard.noComms': 'Keine geplanten Kommunikationen.',

  // Schedule
  'schedule.title': 'Planung',
  'schedule.subtitle': 'On-Campus-Kalender. Modul aus dem Pool auf eine Zelle ziehen, um einen Kontaktblock anzulegen; Klick auf einen Blockchip entfernt ihn wieder.',
  'schedule.program': 'Programm',
  'schedule.semester': 'Semester',
  'schedule.activeWeeks': 'aktive On-Campus-Wochen',
  'schedule.conflicts': 'Konflikte',
  'schedule.noConflicts': 'Keine Konflikte.',
  'schedule.resolveTitle': 'Konflikt lösen',
  'schedule.module': 'Modul (verschieben)',
  'schedule.newDate': 'Neuer Termin',
  'schedule.period': 'Periode',
  'schedule.room': 'Raum',
  'schedule.apply': 'Anwenden',
  'schedule.modulePool': 'Modul-Pool',
  'schedule.backToSemester': 'Zurück zur Semesterübersicht',
  'schedule.unconfirmed': 'unbestätigt',
  'schedule.periodMorning': 'Vormittag',
  'schedule.periodAfternoon': 'Nachmittag',
  'schedule.periodEvening': 'Abend',
  'schedule.noSemester': 'Kein Semester gewählt.',

  // Todos
  'todos.title': 'Todos',
  'todos.board': 'Board',
  'todos.list': 'Liste',
  'todos.col.backlog': 'Todos',
  'todos.col.soon': 'bald fällig',
  'todos.col.wip': 'in Bearbeitung',
  'todos.col.done': 'erledigt',
  'todos.open': 'offen',
  'todos.markDone': 'erledigt',
  'todos.reopen': 'wieder öffnen',

  // Settings
  'settings.title': 'Einstellungen',
  'settings.sections.auth': 'Authentication',
  'settings.sections.database': 'Database & API',
  'settings.sections.display': 'Darstellung',
  'settings.sections.defaults': 'Standards (Departement/Programm)',
  'settings.defaultsTitle': 'Voreinstellungen (Departement / Programm / Semester)',
  'settings.department': 'Departement (freie Eingabe möglich)',
  'settings.departmentHint': 'Default „BFH-W“ — Freitext erlaubt für beliebige weitere Namen',
  'settings.defaultProgram': 'Standard-Masterprogramm',
  'settings.defaultSemester': 'Standard-Semester',
  'settings.planningLabel': 'Planungs-Kalender',
  'settings.planningDays': 'Verfügbare Wochentage für On-Campus (Default: Do–Sa)',
  'settings.startKW': 'Start-KW (leer = Default HS 39 / FS 6)',
  'settings.endKW': 'End-KW (leer = Default HS 51 / FS 23)',
  'settings.saveDefaults': 'Save Defaults',
  'settings.uiLanguage': 'Oberflächensprache (default: Deutsch)',
  'settings.darkMode': 'Dark Mode',

  // Assurance
  'assurance.title': 'Assurance of Learning',
  'assurance.tabMatrix': 'Matrix',
  'assurance.tabRubrics': 'Rubriken',
  'assurance.tabAol': 'AoL-Messpunkte',
  'assurance.tabLoop': 'Closing the loop',

  // common
  'common.allPrograms': 'Alle Programme',
  'common.noSemester': 'Kein Semester gewählt.',
}
