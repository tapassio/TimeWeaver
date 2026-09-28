/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_TITLE?: string
  readonly DATABASE_URL?: string
  readonly POSTGRES_HOST?: string
  readonly POSTGRES_PORT?: string
  readonly POSTGRES_DB?: string
  readonly POSTGRES_USER?: string
  readonly POSTGRES_PASSWORD?: string
  readonly OIDC_ISSUER?: string
  readonly OIDC_CLIENT_ID?: string
  readonly OIDC_PROVIDER_NAME?: string
  readonly OIDC_REGISTRATION_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}