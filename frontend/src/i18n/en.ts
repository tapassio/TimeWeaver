/**
 * UI labels: ENGLISH — full sister dictionary of the German one.
 * Same keys as i18n/de.ts; missing keys fall back to de via useI18n().t().
 */
export const en: Record<string, string> = {
  // Brand
  'app.title': 'CourseWeaver',
  'app.logout': 'Logout',

  // Navigation
  'nav.dashboard': 'Dashboard',
  'nav.curriculum': 'Curriculum',
  'nav.taxonomy': 'Taxonomy',
  'nav.modules': 'Modules',
  'nav.mapping': 'Mapping',
  'nav.schedule': 'Planning',
  'nav.todos': 'Todos',
  'nav.constraints': 'Constraints',
  'nav.rooms': 'Rooms & Locations',
  'nav.conflicts': 'Conflicts',
  'nav.reports': 'Reports',
  'nav.admin': 'Admin',
  'nav.settings': 'Settings',

  // Dashboard
  'dashboard.title': 'Overview',
  'dashboard.subtitle': 'Programs, todos and conflicts at a glance.',
  'dashboard.programs': 'Programs',
  'dashboard.nextBlocks': 'Upcoming on-campus blocks',
  'dashboard.upcomingComms': 'Upcoming communications',
  'dashboard.openTodos': 'Open todos',
  'dashboard.incl_conflicts': 'including dynamically detected schedule conflicts',
  'dashboard.noBlocks': 'No upcoming blocks.',
  'dashboard.noComms': 'No planned communications.',

  // Schedule
  'schedule.title': 'Planning',
  'schedule.subtitle': 'On-campus calendar. Drag a module from the pool onto a cell to create a contact block; click a block chip to remove it.',
  'schedule.program': 'Program',
  'schedule.semester': 'Semester',
  'schedule.activeWeeks': 'active on-campus weeks',
  'schedule.conflicts': 'Conflicts',
  'schedule.noConflicts': 'No conflicts.',
  'schedule.resolveTitle': 'Resolve conflict',
  'schedule.module': 'Module (move)',
  'schedule.newDate': 'New date',
  'schedule.period': 'Period',
  'schedule.room': 'Room',
  'schedule.apply': 'Apply',
  'schedule.modulePool': 'Module pool',
  'schedule.backToSemester': 'Back to semester overview',
  'schedule.unconfirmed': 'unconfirmed',
  'schedule.periodMorning': 'Morning',
  'schedule.periodAfternoon': 'Afternoon',
  'schedule.periodEvening': 'Evening',
  'schedule.noSemester': 'No semester selected.',

  // Todos
  'todos.title': 'Todos',
  'todos.board': 'Board',
  'todos.list': 'List',
  'todos.col.backlog': 'Todos',
  'todos.col.soon': 'due soon',
  'todos.col.wip': 'in progress',
  'todos.col.done': 'done',
  'todos.open': 'open',
  'todos.markDone': 'mark done',
  'todos.reopen': 'reopen',

  // Settings
  'settings.title': 'Settings',
  'settings.sections.auth': 'Authentication',
  'settings.sections.database': 'Database & API',
  'settings.sections.display': 'Appearance',
  'settings.sections.defaults': 'Defaults (Department/Program)',
  'settings.defaultsTitle': 'Preferences (Department / Program / Semester)',
  'settings.department': 'Department (free-text allowed)',
  'settings.departmentHint': 'Default “BFH-W” — free text allowed for any other name',
  'settings.defaultProgram': 'Default master program',
  'settings.defaultSemester': 'Default semester',
  'settings.planningLabel': 'Planning calendar',
  'settings.planningDays': 'Available weekdays for on-campus (default: Thu–Sat)',
  'settings.startKW': 'Start CW (empty = default HS 39 / FS 6)',
  'settings.endKW': 'End CW (empty = default HS 51 / FS 23)',
  'settings.saveDefaults': 'Save defaults',
  'settings.uiLanguage': 'UI language (default: German)',
  'settings.darkMode': 'Dark mode',

  // Assurance
  'assurance.title': 'Assurance of Learning',
  'assurance.tabMatrix': 'Matrix',
  'assurance.tabRubrics': 'Rubrics',
  'assurance.tabAol': 'AoL measurement points',
  'assurance.tabLoop': 'Closing the loop',

  // common
  'common.allPrograms': 'All programs',
  'common.noSemester': 'No semester selected.',
}
