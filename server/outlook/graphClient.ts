/**
 * 9.1/9.6 — Microsoft Graph-Zugriff, NUR serverseitig (nie via Vue-Client).
 *
 * Auth-Strategien (kompromissarm, Reihenfolge empfohlen):
 *   1. Managed Identity  (AZURE_CLIENT_ID via IMDS / DefaultAzureCredential-Äquivalent)
 *   2. Zertifikat        (AZURE_TENANT_ID + AZURE_CLIENT_ID + Zertifikat)
 *   3. Client Secret     (nur zur starke Einschränkung durch RBAC for Applications/
 *                        Nachfolger der Application Access Policies, vgl. 9.1)
 *
 * App-Berechtigungen (Application Permissions + Admin Consent):
 *   - Calendars.ReadBasic   -> getSchedule (Frei/Belegt, geringstprivilegiert)
 *   - Calendars.ReadWrite   -> Events im Kalender der zentralen Planungs-Mailbox
 *
 * Die app-weite Berechtigung wird über Exchange Online "RBAC for Applications"
 * (Nachfolger der Application Access Policies, vgl. 9.1) auf genau die
 * Dozierenden- und die Planungs-Mailbox beschränkt.
 */
import { buildGetScheduleBody, type GraphScheduleResponse, type GraphTimespan } from './availability.js'

export interface GraphAuthContext {
  tenantId: string
  clientId: string
  /** 'clientSecret' | 'certificate' | 'managedIdentity' */
  strategy: 'clientSecret' | 'certificate' | 'managedIdentity'
  clientSecret?: string
  certificateThumbprint?: string
  certificatePrivateKeyPem?: string
}

export interface OutlookGraphClientOptions {
  planningMailbox: string
  tenantId?: string
  clientId?: string
  /** konkretes Client-Secret (nur für Devlokale Tests) */
  clientSecret?: string
  /** ServiceProvider zum Testen/Mock — sonst interner Client-Credentials-Flow */
  fetchImpl?: typeof fetch
  baseUrl?: string
}

interface TokenCache {
  token: string
  expiresAtMs: number
}

export class OutlookGraphClient {
  readonly planningMailbox: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private tokenCache: TokenCache | null = null

  constructor(private readonly options: OutlookGraphClientOptions) {
    this.planningMailbox = options.planningMailbox
    this.baseUrl = options.baseUrl ?? 'https://graph.microsoft.com/v1.0'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  private get authContext(): GraphAuthContext | null {
    const tenantId = this.options.tenantId ?? process.env.AZURE_TENANT_ID
    const clientId = this.options.clientId ?? process.env.AZURE_CLIENT_ID
    const clientSecret = this.options.clientSecret ?? process.env.AZURE_CLIENT_SECRET
    if (!tenantId || !clientId) return null
    return { tenantId, clientId, strategy: 'clientSecret', clientSecret }
  }

  /** Client Credentials; austauschbare Stelle für Zertifikat/Managed Identity. */
  private async getAccessToken(): Promise<string> {
    const ctx = this.authContext
    if (!ctx) throw new Error('Outlook Graph: keinen Auth-Kontext konfiguriert (AZURE_TENANT_ID/AZURE_CLIENT_ID/AZURE_CLIENT_SECRET)')
    if (ctx.strategy === 'clientSecret' && !ctx.clientSecret) {
      throw new Error('Outlook Graph: AZURE_CLIENT_SECRET fehlt; produktiv Zertifikat oder Managed Identity verwenden')
    }

    const now = Date.now()
    if (this.tokenCache && this.tokenCache.expiresAtMs > now + 60_000) return this.tokenCache.token

    const res = await this.fetchImpl(
      `https://login.microsoftonline.com/${ctx.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: ctx.clientId,
          client_secret: ctx.clientSecret ?? '',
          scope: 'https://graph.microsoft.com/.default',
        }),
      },
    )
    if (!res.ok) {
      throw new Error(`Outlook Graph: Token-Abruf fehlgeschlagen (HTTP ${res.status})`)
    }
    const json = (await res.json()) as { access_token: string; expires_in: string }
    this.tokenCache = {
      token: json.access_token,
      expiresAtMs: now + Number(json.expires_in ?? 3600) * 1000,
    }
    return this.tokenCache.token
  }

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    const token = await this.getAccessToken()
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Outlook Graph ${init.method ?? 'POST'} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`)
    }
    return res.status === 204 ? null : res.json()
  }

  /** 9.2 — Frei/Belegt für Dozierenden-Mailboxen (Application Permission Calendars.ReadBasic). */
  async getSchedule(ops: {
    instructorMails: string[]
    startTime: GraphTimespan
    endTime: GraphTimespan
    availabilityViewInterval?: number
  }): Promise<GraphScheduleResponse> {
    return (await this.call(`/users/${encodeURIComponent(this.planningMailbox)}/calendar/getSchedule`, {
      method: 'POST',
      body: JSON.stringify(buildGetScheduleBody(ops)),
    })) as GraphScheduleResponse
  }

  /** 9.5 — Event im Kalender der zentralen Planungs-Mailbox anlegen (Calendars.ReadWrite). */
  async createEvent(event: {
    subject: string
    start: GraphTimespan
    end: GraphTimespan
    requiredAttendees?: string[]
    roomResources?: string[]
    transactionId: string
  }): Promise<{ id: string; transactionId?: string } | null> {
    const attendees: unknown[] = [
      ...(event.requiredAttendees ?? []).map((m) => ({
        emailAddress: { address: m },
        type: 'required',
      })),
      ...(event.roomResources ?? []).map((m) => ({
        emailAddress: { address: m },
        type: 'resource',
      })),
    ]
    return (await this.call(`/users/${encodeURIComponent(this.planningMailbox)}/events`, {
      method: 'POST',
      body: JSON.stringify({
        subject: event.subject,
        start: event.start,
        end: event.end,
        attendees,
        transactionId: event.transactionId,
      }),
    })) as { id: string; transactionId?: string } | null
  }

  /** Update bestehendes Event (Graph-ID aus 9.5 gespeichert), statt Duplikate anzulegen. */
  async updateEvent(eventId: string, event: { subject: string; start: GraphTimespan; end: GraphTimespan }): Promise<void> {
    await this.call(`/users/${encodeURIComponent(this.planningMailbox)}/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ subject: event.subject, start: event.start, end: event.end }),
    })
  }
}
