# ADR 0009: Lokale Request-Härtung, Retention und idempotenter Gmail-Versand

- **Status:** Accepted
- **Datum:** 2026-08-22
- **Entscheidungsträger:** E-RYDEZ Operations

## Kontext

Die Konsole bleibt ein lokaler Einzeloperator-Arbeitsplatz. Docker Compose veröffentlicht ausschließlich Nginx auf der Loopback-Adresse; die Anwendung führt weiterhin weder Benutzerlogin noch Autorisierung noch TLS ein. Gleichwohl kann ein Browser auf dem vertrauenswürdigen Host ungewollte Cross-Site-Anfragen erzeugen, während einzelne lokale Kontrollevidenzen ohne Ablauf wachsen könnten. Der Gmail-Versand ist ein externer, nicht widerrufbarer Effekt; ein Netzwerkfehler nach Provider-Annahme darf nicht zu einer unkontrollierten Doppelübermittlung verleiten.

Die Entscheidung darf Shopify nicht mutieren, keine Gmail-Watches, Webhooks, Hintergrundsynchronisierung, Mailbox-Spiegelung oder Attachment-Downloads einführen. Gmail-Reply-Metadaten bleiben serverseitig aus dem Quellthread abgeleitet und die Zwei-Schritt-Bestätigung bleibt sichtbar.

## Entscheidung

1. Unsichere `/api`-Methoden akzeptieren Browser-Anfragen nur bei passender Same-Origin-/Fetch-Metadata-Provenance und dem Browser-Header `X-Erydez-Request: local-console`. Cross-Site-Requests werden abgelehnt. Lokale CLI-Anfragen ohne Browser-Provenance bleiben für das dokumentierte Operator-Runbook zulässig. Diese Maßnahme ist **keine** Authentifizierung und verändert nicht die Loopback-only-Grenze.
2. Nginx ergänzt CSP, Frame-, MIME-, Referrer- und Permissions-Policies. Die CSP bleibt mit der lokalen, same-origin SPA vereinbar, verhindert eingebettete Fremdobjekte und fordert Skripte ausschließlich von derselben Origin. Das Deployment bleibt bewusst HTTP auf Loopback; keine Aussage über externes TLS wird getroffen.
3. Integration-Health-Checks sind nur über ein explizites `POST` schreibend. Das bisherige `GET` liefert ausschließlich den letzten gespeicherten oder den aktuell berechneten sicheren Status. Health-Snapshots und lokale Audit-Ereignisse erhalten ein TTL-gesteuertes Ablaufdatum.
4. Jede Gmail-Sendebestätigung enthält einen browsererzeugten Idempotenzschlüssel. Der Server reserviert diesen Schlüssel atomar, speichert nur Thread-ID, Hash des Inhalts, sicheren Status und Ablaufzeit, jedoch nie den Nachrichteninhalt. Ein erfolgreich gespeicherter Vorgang wird sicher wiedergegeben; ein unklarer Provider-Ausgang wird nicht automatisch wiederholt.
5. Die Übersicht berechnet Zähler, Summen, Statusgruppen, Top-Produkte und Low-Stock-Ergebnisse per MongoDB-Aggregation, statt vollständige Snapshot-Collections in den API-Prozess zu laden. Nicht paginierte Listen erhalten explizite sichere Obergrenzen.

## Alternativen

| Alternative | Bewertung | Entscheidung |
|---|---|---|
| Benutzerlogin, Rollen und Sessions | Erforderlich für Mehrbenutzer-/externen Betrieb, aber unvereinbar mit dem bestätigten lokalen Einzeloperator-Ziel ohne zusätzliche IdP- und UX-Entscheidung. | Nicht Bestandteil dieser ADR. |
| CORS als alleiniger CSRF-Schutz | Verhindert nicht jede Cross-Site-Anfrage und unterscheidet keine vertrauenswürdige lokale Browser-Mutation. | Verworfen. |
| Zufälliges lokales API-Token im React-Bundle | Ein statisches Browser-Token wäre kein Geheimnis und keine verlässliche Identität. | Verworfen. |
| Idempotenz ausschließlich im Browser | Browser-Zustand geht bei Reload/Timeout verloren und kann den Provider-Send nicht atomar schützen. | Verworfen. |
| Vollständige Inbox-/Snapshot-Persistenz für Performance | Würde Gmail-On-Demand-/Nicht-Mirror-Grenzen oder Snapshot-Ressourcenbudgets verletzen. | Verworfen. |

## Konsequenzen

Die lokale Konsole ist resistenter gegen browservermittelte Cross-Site-Mutationen und stellt eine restriktivere Browser-Laufzeitumgebung bereit. Der lokale Operator muss für Browser-Mutationen den zentralen API-Client verwenden; dokumentierte lokale CLI-Aufrufe bleiben funktional. Für separate Development-Origin muss `CORS_ORIGINS` explizit gesetzt sein und der Client sendet denselben Provenance-Header.

Health- und Audit-Evidenz ist absichtlich zeitlich begrenzt. Die Standardfristen von 90 Tagen für Health, 365 Tagen für Audit und 24 Stunden für abgeschlossene Gmail-Sendeoperationen sind lokale Betriebsdefaults und können über positive Umgebungswerte angepasst werden. Eine TTL-Löschung erfolgt asynchron durch MongoDB; sie ist kein Sekundengenaues Löschversprechen.

Ein Gmail-Timeout nach dem Provider-Send kann als `outcome_unknown` enden. Der Operator darf dieselbe Bestätigung dann nicht wiederholen, sondern muss den Thread aktualisieren und gegebenenfalls bewusst eine neue, überprüfte Bestätigung vorbereiten. Diese konservative Behandlung bevorzugt Vermeidung doppelter E-Mails gegenüber automatischer Wiederholung.

## Risiken und Maßnahmen

| Risiko | Maßnahme |
|---|---|
| Lokale Browser-Mutation ohne erwarteten Header | Server gibt `403` zurück; der zentrale Client setzt den Header bei `POST`/`PATCH`. |
| Lokales CLI bricht durch Browser-Schutz | Requests ohne `Origin`/Fetch-Metadata bleiben als dokumentierte Local-Operator-Schnittstelle zulässig. |
| CSP verhindert zukünftige Fremdassets | CSP wird als explizite Deployment-Grenze getestet; neue externe Assets benötigen eine bewusste Sicherheitsentscheidung. |
| MongoDB-Ausfall nach Gmail-Provider-Annahme | Server kennzeichnet das Ergebnis als unklar und blockiert automatisches Wiederholen mit demselben Schlüssel. |
| Retention löscht für eine Untersuchung benötigte Evidence | Fristen sind konfigurierbar; die Anpassung erfolgt vor dem Ablauf und ohne Providerpayloads oder Nachrichteninhalte. |
| Aggregation ändert Dashboard-Semantik | Unit-/Integrationstests vergleichen weiterhin Zähler, Statusgruppen und begrenzte Resultatformen gegen aktive Snapshots. |

## Implementierungshinweise

Die Maßnahmen liegen in `backend/server.py`, `frontend/src/lib/api.js`, `frontend/src/pages/GmailInbox.jsx`, `frontend/src/pages/Settings.jsx`, `frontend/nginx.conf`, `compose.yaml` und `.env.example`. Der API- und Gmail-Vertrag, die Runbooks und Tests müssen die neue explizite Health-Aufzeichnung, Header-Provenance, TTL-Konfiguration, Ergebnisbehandlung für Gmail-Sends und Listengrenzen beschreiben. Die Plattform bleibt Docker Compose mit Nginx-Frontend, internem FastAPI/MongoDB, Loopback-only-Frontend-Port, ohne App-Authentifizierung und ohne TLS.
