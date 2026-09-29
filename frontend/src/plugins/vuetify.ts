import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

/**
 * Design-System TimeWeaver — Sister-App CourseWeaver nutzt BFH-Blau, damit der Split sichtbar bleibt. Beide teilen dieselben Tokens.
 * damit der Split sichtbar bleibt — beide teilen dieselben Tokens).
 */
export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#00796B',       // BFH-Blau
          secondary: '#00695C',
          accent: '#F2A900',
          error: '#C62828',
          success: '#2E7D32',
          warning: '#EF6C00',
          info: '#0277BD',
          surface: '#F5F7FA',
          'surface-bright': '#FFFFFF',
          'surface-variant': '#E8EEF7',
          'on-surface': '#102230',
        },
        variables: {
          'border-radius-root': '12px',
        },
      },
      dark: {
        dark: true,
        colors: {
          primary: '#26A69A',
          secondary: '#004D40',
          accent: '#F2A900',
          surface: '#0E1B2C',
        },
      },
    },
  },
  defaults: {
    VCard: { rounded: 'lg', elevation: 1 },
    VBtn: { rounded: 'lg', color: undefined },
    VTextField: { variant: 'outlined', density: 'compact' },
    VSelect: { variant: 'outlined', density: 'compact' },
    VDataTable: { density: 'compact' },
  },
})
