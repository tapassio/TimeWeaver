/**
 * useI18n — scoped translations für die App-Oberfläche.
 * Sprache kommt aus Einstellungen (localStorage 'courseweaver_language', vebiankt mit
 * Settings → Darstellung → Oberflächensprache). Default: 'de'.
 * t(key) = en[key] bei 'en', sonst de (Fallback: key selbst).
 */
import { computed, ref } from 'vue'
import { de } from '@/i18n/de'
import { en } from '@/i18n/en'

export type UiLanguage = 'de' | 'en'

const language = ref<UiLanguage>(
  (localStorage.getItem('courseweaver_language') === 'en' ? 'en' : 'de') as UiLanguage,
)

export function useI18n() {
  function setLanguage(lang: UiLanguage): void {
    language.value = lang
    localStorage.setItem('courseweaver_language', lang)
  }

  function t(key: string): string {
    const dict = language.value === 'en' ? en : de
    return dict[key] ?? de[key] ?? key
  }

  const current = computed<UiLanguage>(() => language.value)

  return { t, language: current, setLanguage }
}
