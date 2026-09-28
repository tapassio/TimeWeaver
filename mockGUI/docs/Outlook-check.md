## Outlook-Anbindung für den Stundenplaner

1. **App registrieren**

   * App in Microsoft Entra ID registrieren.

   * Application Permissions verwenden.

   * Admin Consent einholen.

2. **Berechtigungen**

   * `Calendars.ReadBasic`: Frei/Belegt der Dozierenden prüfen.

   * `Calendars.ReadWrite`: Termine im Kalender einer zentralen Planungs-Mailbox erstellen.

   * Zugriff über Exchange Online RBAC auf Dozierende und Planungs-Mailbox beschränken.

3. **Verfügbarkeit abrufen**

```http
POST /users/{planningMailbox}/calendar/getSchedule
```

Request:

```json
{
  "schedules": ["lecturer@university.ch"],
  "startTime": {
    "dateTime": "2027-02-15T08:00:00",
    "timeZone": "Europe/Zurich"
  },
  "endTime": {
    "dateTime": "2027-02-19T20:00:00",
    "timeZone": "Europe/Zurich"
  },
  "availabilityViewInterval": 15
}
```

Für CP-SAT abbilden:

* `free` → Slot erlaubt

* `tentative` → Soft Penalty

* `busy` / `outOfOffice` → Slot gesperrt

* unbekannt → manuell prüfen

4. **Stundenplan berechnen**

   * Graph-Verfügbarkeit in eine lokale Verfügbarkeitsmatrix umwandeln.

   * Matrix als Constraints an CP-SAT übergeben.

   * Direkt vor der Veröffentlichung nochmals `getSchedule` aufrufen.

5. **Unterrichtstermine erstellen**

```http
POST /users/timetable@university.ch/events
```

* Zentrale Planungs-Mailbox als Organisator verwenden.

* Dozierende als `required` Attendees hinzufügen.

* Räume als `resource` Attendees hinzufügen.

* Stabile `transactionId` setzen, um Duplikate zu verhindern.

* Graph-Event-ID zusammen mit der internen Unterrichtseinheit speichern.

6. **Architektur**

   * Microsoft Graph nur serverseitig aufrufen.

   * Client Secret besser durch Zertifikat oder Managed Identity ersetzen.

   * Optimierung und Veröffentlichung als getrennte Prozesse implementieren.

   * Termine erst nach manueller Freigabe versenden.
