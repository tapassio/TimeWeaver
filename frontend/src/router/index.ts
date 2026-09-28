import { createRouter, createWebHistory } from 'vue-router'
import { useOidc } from '@/composables/useOidc'
import { useAuthStore } from '@/stores/auth'

import AppLayout from '@/layouts/AppLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresAuth: false, requiresConfig: false },
    },
    {
      path: '/callback',
      name: 'callback',
      component: () => import('@/views/CallbackView.vue'),
      meta: { requiresAuth: false, requiresConfig: false },
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'schedule',
          name: 'schedule',
          component: () => import('@/views/ScheduleView.vue'),
        },
        {
          path: 'rooms',
          name: 'rooms',
          component: () => import('@/views/RoomsView.vue'),
        },
        {
          path: 'availability',
          name: 'availability',
          component: () => import('@/views/AvailabilityView.vue'),
        },
        {
          path: 'constraints',
          name: 'constraints',
          component: () => import('@/views/ConstraintsView.vue'),
        },
        {
          path: 'admin',
          name: 'admin',
          component: () => import('@/views/AdminView.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: '/:pathMatch(.*)*',
          redirect: '/',
        },
        {
          // Einstellungen UNBEDINGT im AppLayout belassen: v-app-bar (Kopfzeile mit
          // Navigation) bleibt sichtbar. Guard via meta-Override child-first.
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { requiresAuth: false, requiresConfig: false, requiresAdmin: false },
        },
      ],
    },
  ],
})

let authInitialized = false
let initAuthPromise: Promise<boolean> | null = null

router.beforeEach(async (to) => {
  const oidc = useOidc()
  const auth = useAuthStore()

  // Dev-Bypass (bewusst opt-in): VITE_DEV_NO_AUTH=1 überspringt OIDC/Login-Checks —
  // z.B. um Ansichten direkt anzusehen, ohne DocPouch/OIDC-Instanz zu starten.
  if (import.meta.env.VITE_DEV_NO_AUTH === '1') {
    return true
  }

  if (to.name === 'callback') {
    return true
  }

  if (!authInitialized) {
    if (!initAuthPromise) {
      initAuthPromise = auth.initAuth()
    }
    await initAuthPromise
    authInitialized = true
  }

  if (to.meta.requiresConfig !== false && !oidc.isConfigured.value) {
    return { name: 'settings' }
  }

  if (to.meta.requiresAuth !== false && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }

  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'dashboard' }
  }
})

export default router
