# Systematischer Code-Review: E-RYDEZ Operations Console

**Rolle:** Principal Software Architect & Security Lead

**Review-Datum:** 22. August 2026

**Prüfmodus:** Der ursprüngliche Review war rein analytisch. Nach der bestätigten Architekturentscheidung **Option A — lokaler Einzeloperator** wurden die unten dokumentierten, mit dieser Betriebsgrenze vereinbaren Maßnahmen implementiert; es wurde kein Commit erstellt.

> **Scope und Bewertungsmaßstab.** Der Review bewertet den aktuellen Arbeitsbaum als lokale, browserbasierte Operations-Konsole mit Shopify-Read-Model und Gmail-Workspace. Die Risikoeinstufung berücksichtigt ausdrücklich die dokumentierte Annahme eines vertrauenswürdigen, lokalen Hosts. Sie darf daher nicht als Freigabe für einen öffentlich erreichbaren Betrieb verstanden werden. [1] [2]

> **Implementierungsstand vom 22. August 2026.** Die nachstehend mit **Erledigt** markierten Maßnahmen wurden nach dem Review für das bestätigte Local-Operator-Modell umgesetzt und mit isolierten Unit-/Frontend-Checks, Produktionsbuild, Compose-Konfigurationsprüfung und Dependency-Audits verifiziert. Die offene fehlende App-Authentifizierung bleibt eine bewusste, dokumentierte Betriebsgrenze und ist kein Defizit, das ohne Wechsel zu Option B oder C sicher „wegrefaktoriert“ werden kann.

| Befund | Status nach Umsetzung | Konkret umgesetzte Maßnahme |
|---|---|---|
| SEC-02 | **Erledigt für Option A** | Same-Origin-/Fetch-Metadata-Guard und `X-Erydez-Request` für Browser-Mutationen; Cross-Site-Mutationen liefern `403`. |
| DEP-01 | **Erledigt** | FastAPI auf 0.141.1 sowie Cryptography auf geprüfte Fix-Version 50.0.0 angehoben; produktiver Python-Audit ohne bekannte Befunde. |
| REL-01 | **Erledigt** | Atomare, TTL-begrenzte Gmail-Sende-Idempotenz mit Content-Hash, Safe Replay und konservativem `outcome_unknown`-Pfad. |
| PERF-01 / PERF-03 | **Wesentlich reduziert** | MongoDB-Aggregation für die Übersicht, begrenzte Listen/Relationen und auf acht Ergebnisse begrenzte globale Produktsuche. |
| SEC-03 | **Erledigt für Option A** | Restriktive Same-Origin-CSP sowie Frame-, MIME-, Referrer- und Permissions-Header am Nginx-Perimeter. |
| OPS-01 | **Erledigt** | Health-GET ist schreibfrei; explizites Health-POST und TTL-Retention für Health-/Audit-Evidence. |
| QUAL-02 | **Erledigt** | Same-Origin-API-Fallback statt `undefined/api`; redundante Legacy-Client-Wrapper entfernt. |
| SEC-01 / PERF-02 / ARC-01 / ARC-02 | **Offen bzw. bewusst außerhalb von Option A** | Keine App-Auth/TLS/Mehrbenutzerarchitektur, vollständige Snapshot-Staging-Last, großer HTTP-Orchestrator und CRA-Migration erfordern eine separate Option-B-/C- oder Migrationsentscheidung. |

## 1. Gesamtbewertung und Health-Score vor Umsetzung

Die Codebasis hat eine **solide fachliche Sicherheitsintention**, klare Provider-Grenzen und eine gut nachvollziehbare Snapshot-Strategie. Besonders positiv sind die explizite Shopify-Read-only-Grenze, die staged Snapshot-Aktivierung, Fernet-verschlüsselte Gmail-Refresh-Tokens, der einmalig konsumierbare OAuth-State sowie die serverseitig abgeleitete Gmail-Reply-Adressierung. [1] [2] [5] [6]

Dem stehen jedoch drei strukturelle Risiken gegenüber: Erstens fehlt jede Authentifizierung, Autorisierung und Transportverschlüsselung auf Anwendungsebene. Zweitens ist der API-Umfang inklusive side-effect-Routen ohne serverseitige Same-Origin-/CSRF-Kontrolle erreichbar. Drittens erzwingen die aktuell aufgelösten Python-Abhängigkeiten eine bekannte verwundbare Starlette-Version. Hinzu kommen mehrere ungebremste Datenpfade, die mit wachsendem Shopify-Bestand nicht skalieren. [2] [3] [4] [5] [8]

| Dimension | Gewicht | Bewertung | Begründung |
|---|---:|---:|---|
| Architektur und Domänengrenzen | 20 | 16 | Provider Ownership, API-Grenze und Snapshot-Aktivierung sind gut dokumentiert und überwiegend eingehalten. |
| Anwendungssicherheit und Datenschutz | 25 | 10 | Gute Token-/HTML-/Reply-Schutzmechanismen, aber keine AuthN/AuthZ, keine TLS- oder Request-Origin-Grenze sowie ein verwundbarer Framework-Stand. |
| Stabilität und Datenkonsistenz | 20 | 12 | Snapshot-Validierung ist gut; einzelne Prozesssperre, kein verteilter Lock, fehlende Idempotenz und ungebremste Nebenwirkungsrouten begrenzen die Robustheit. |
| Performance und Skalierbarkeit | 15 | 8 | Indizes und begrenzte Gmail-Konkurrenz helfen, doch vollständige Materialisierung, unpagierte Listen und Regex-Suchen dominieren bei Wachstum. |
| Wartbarkeit und Code-Qualität | 10 | 6 | Gute kleine Provider-Module, aber ein übergroßes `server.py`, Legacy-Reste, doppelte API-Wrapper und veraltetes Build-Tooling. |
| Testbarkeit und Lieferqualität | 10 | 8 | Isolierte Backend-Unit-Tests und vorhandene Frontend-Tests bestehen; kritische End-to-End-, Autorisierungs-, Last- und Fehlerpfade bleiben ungetestet. |
| **Gesamt** | **100** | **60 / 100** | **Ausgangsbewertung vor Option-A-Umsetzung: bedingt produktionsfähig ausschließlich im engen Local-Operator-Modell.** |

### 1.1 Health-Score nach bestätigter Option-A-Umsetzung

| Dimension | Bewertung nach Umsetzung | Einordnung |
|---|---:|---|
| Architektur und Domänengrenzen | 17 / 20 | Provider-Ownership und Active-Snapshot-Semantik bleiben erhalten; der große HTTP-Orchestrator bleibt als mittelfristige Modularisierungsaufgabe. |
| Anwendungssicherheit und Datenschutz | 18 / 25 | Dependency-Fixes, CSP, Header, Fehlerredaktion und lokale Browser-Mutation-Grenze sind umgesetzt; Authentifizierung/TLS bleiben absichtlich außerhalb des Local-Operator-Modells. |
| Stabilität und Datenkonsistenz | 16 / 20 | Idempotenter Gmail-Send, explizite Health-Schreiboperation und TTL-Retention reduzieren irreversible und wachsende Zustände. |
| Performance und Skalierbarkeit | 12 / 15 | MongoDB-Aggregation und Listengrenzen reduzieren API-Heap/Transfer; vollständige Snapshot-Staging bleibt ein bewusstes Architekturmerkmal. |
| Wartbarkeit und Code-Qualität | 7 / 10 | Zentraler Client ist gestrafft und Verträge/ADR synchronisiert; CRA und der große `server.py` bleiben Migrationsaufgaben. |
| Testbarkeit und Lieferqualität | 9 / 10 | Neue Sicherheits-/Idempotenzregressionen, Unit-Suiten, produktiver Audit, Build und Compose-Prüfung; Live-HTTP-Suite erfordert weiterhin einen kontrollierten Snapshot-Service. |
| **Gesamt** | **79 / 100** | **Gut für den dokumentierten lokalen Einzeloperator. Nicht als Freigabe für externen oder Mehrbenutzerbetrieb zu verstehen.** |

## 2. Codebase-Überblick

Die Anwendung ist eine React-19-SPA mit React Router, SWR, Axios, Tailwind/Radix und CRACO. Der Browser greift ausschließlich über `frontend/src/lib/api.js` auf die FastAPI-Anwendung zu. Der Python-Backend-Kern besteht aus FastAPI, Motor/PyMongo, einem Shopify-GraphQL-Adapter und einem Gmail-/OAuth-/KI-Dienst; MongoDB hält aktive Shopify-Snapshots und kontrollplane-eigene Metadaten. Im Compose-Betrieb ist nur Nginx auf `127.0.0.1` veröffentlicht, während Backend und MongoDB im internen Compose-Netz bleiben. [1] [2] [3] [4]

| Bereich | Beobachteter Aufbau | Architekturbewertung |
|---|---|---|
| Frontend | 14 JavaScript- und 70 JSX-Dateien mit insgesamt rund 6.979 Quellzeilen; SPA-Routen werden zentral in `App.js` registriert. [7] | Die UI-Struktur ist grundsätzlich nachvollziehbar; einzelne Seiten sind groß und zustandsreich. |
| Backend | 13 Python-Dateien mit rund 4.616 Quellzeilen; `server.py` umfasst allein rund 1.500 Zeilen und vereint HTTP, Persistenz, Snapshots, Integrations-Control-Plane und Gmail-Routen. [5] | **Hohe Kopplung** und erschwerte isolierte Änderungen; die Provider-Adapter selbst sind sinnvoll separiert. |
| Datenmodell | Vollständige Shopify-Snapshots mit gemeinsamem `sync_id`; alte Snapshots werden nach erfolgreicher Aktivierung bereinigt. [2] [5] | Konsistente Read-Model-Semantik, aber vollständige Materialisierung begrenzt die Skalierung. |
| Gmail | OAuth-Authorization-Code-Flow, Fernet-Tokenverschlüsselung, On-Demand-Thread-Reads, serverabgeleitete Antworten und optionale KI-Drafts. [2] [6] | Gute fachliche Schutzabsicht; Daten- und Side-Effect-Grenzen sind sorgfältiger als die globale API-Perimeter-Sicherheit. |
| Deployment | Compose, Nginx, einzelner Uvicorn-Worker, MongoDB-Volume, Backend non-root und read-only Dateisystem. [2] [4] | Für einen lokalen Operator sinnvoll gehärtet; nicht für horizontale Skalierung oder öffentliches Hosting ausgelegt. |

Die Architektur dokumentiert ausdrücklich, dass weder Login, Rollenmodell, Mandantentrennung noch TLS existieren. Das ist im aktuellen Local-Operator-Modell ein **akzeptierter Scope**, bleibt aber ein harter Blocker für jede spätere Erweiterung des Zugriffskreises. [1] [2] [3]

## 3. Priorisierte Befunde

### 3.1 Priorisierungsübersicht

| ID | Priorität | Kategorie | Befund | Risiko und Auswirkung |
|---|---|---|---|---|
| SEC-01 | **Hoch** | Architektur / Zugriffsschutz | Keine Anwendungs-Authentifizierung oder -Autorisierung für lesende, steuernde oder sendende Routen. | Jeder Prozess bzw. Browser mit Zugriff auf den Host-Port kann Commerce-PII lesen, Syncs starten, Integrationszustände ändern oder Gmail-Nachrichten versenden. |
| SEC-02 | **Hoch** | Request-Sicherheit | Kein serverseitiger Origin-/Fetch-Metadata-/CSRF-Schutz für zustandsändernde Localhost-Routen. | Cross-Site-Anfragen können insbesondere Sync oder Gmail-Disconnect anstoßen; deaktiviertes CORS verhindert nicht das Absenden einfacher Cross-Site-Requests. |
| DEP-01 | **Hoch** | Supply Chain | `fastapi==0.110.1` löst Starlette `0.37.2` auf; der isolierte Audit meldete neun Advisory-Einträge für dieses Paket. | Der Stack enthält mindestens die BadHost-Schwachstelle, deren Fix laut OSV erst in Starlette `1.0.1` liegt; ein abgestimmtes FastAPI-/Starlette-Upgrade ist nötig. |
| REL-01 | **Mittel** | Side Effects | Gmail-Senden ist nicht idempotent und besitzt keine serverseitige Deduplizierung. | Timeout, Browser-Retry oder Doppelübermittlung können identische Kundenantworten erneut senden. |
| PERF-01 | **Mittel** | Datenzugriff | Übersicht, Reports, mehrere Listen und Detailrouten materialisieren vollständige Collections bzw. Relationen im Prozess. | Heap-, GC- und Antwortzeit wachsen proportional zur gesamten Snapshotgröße; die Übersicht wird bei großen Shops zum Engpass. |
| PERF-02 | **Mittel** | Synchronisierung | Shopify-Snapshot wird sequenziell abgefragt, vollständig im Speicher aufgebaut und mit nur prozesslokalem Lock aktiviert. | Lange Laufzeiten, hoher Speicherbedarf und fehlende Koordination bei mehreren Prozessen/Instanzen. |
| SEC-03 | **Mittel** | Browser-Sicherheit / Datenschutz | Gmail-HTML wird direkt per `dangerouslySetInnerHTML` gerendert; es gibt keinen Content-Security-Policy-Header. | Der Custom-Sanitizer ist eine gute erste Barriere, aber ein Parser-Fehler oder neue Browserkante hätte keine zweite Verteidigungsschicht; externe Bilder erlauben zusätzlich Tracking. |
| OPS-01 | **Mittel** | HTTP-Semantik / Retention | `GET /integrations/{id}/health` schreibt eine Health-Historie; Audit- und Health-Daten haben keine sichtbare Retention. | Crawler, Polling oder Wiederholungen erzeugen Datenwachstum und machen einen GET-Request nicht mehr nebenwirkungsfrei. |
| ARC-01 | **Mittel** | Wartbarkeit | `backend/server.py` bündelt zahlreiche Verantwortlichkeiten und nutzt direkte Dict-Responses ohne konsistente Response-Modelle. | Hohe Änderungsrisiken, unklare öffentliche Schemas und erschwerte Testisolation. |
| ARC-02 | **Mittel** | Tooling | CRA/`react-scripts` 5 bleibt zentral, obwohl Create React App offiziell deprekiert wurde und keine aktiven Maintainer hat. | Zunehmende Upgrade-, Build- und Security-Patch-Risiken; die lokale `.npmrc` übergeht Peer-Dependency-Konflikte. |
| PERF-03 | **Gering** | Suche / API | `mongo_contains` nutzt nicht verankerte, case-insensitive Regexe; globale Suche ruft eine unpagierte Produktliste auf und kürzt erst danach. | Keine Regex-Injection wegen `re.escape`, aber potentiell teure Collection-Scans und unnötige Datenübertragung. |
| QUAL-01 | **Gering** | Legacy / DRY | API-Client und Übersetzungsdatei enthalten große Mengen nicht mehr primärer Legacy-Funktionalität; `adminPost` dupliziert `post`. | Veraltete Oberfläche suggeriert nicht vorhandene Fähigkeiten und erhöht Wartungs- und Testlast. |
| QUAL-02 | **Gering** | Konfiguration | Im lokalen Frontend-Start ohne gesetztes `REACT_APP_BACKEND_URL` wird `undefined/api` statt einer robusten Same-Origin-Basis erzeugt. | Entwicklererlebnis und lokale Testbarkeit sind fragil; der Docker-Build maskiert den Fehler durch explizit leeren Build-Arg. |

### 3.2 SEC-01 — Fehlende Authentifizierung und Autorisierung

Die Anwendung exponiert nicht nur Lesezugriff auf Shopify-Orders, Kunden, Adressen und E-Mail-Metadaten, sondern auch operative Routen wie `POST /api/shopify/sync`, Lifecycle-Änderungen, Recovery-Owner-Zuweisungen, Gmail-Disconnect und Gmail-Send. In `server.py` existiert für diese Routen weder eine Identity-Prüfung noch eine Rollen- oder Berechtigungsprüfung; die Compose-Topologie reduziert die Reichweite ausschließlich über eine Loopback-Portbindung. [2] [4] [5]

Diese Bewertung bedeutet nicht, dass der aktuelle Betrieb bereits öffentlich ist. Sie bedeutet jedoch: **Die Vertrauensgrenze ist der Host selbst und nicht die Anwendung.** Ein lokaler anderer Benutzer, Malware im Benutzerkontext, ein Browser-Plugin oder ein später hinzugefügter Reverse Proxy erben unmittelbar alle Operator-Rechte. Die dokumentierte Einschränkung „kein Login/keine Autorisierung“ ist deshalb keine technische Kompensation, sondern das dominierende Sicherheitsrisiko. [1] [2] [3]

| Sofortmaßnahme | Zielbild | Akzeptanzkriterium |
|---|---|---|
| Zugriff vor jeder Mutation und jedem PII-Read erzwingen | Authentifizierte Identität mit rollenbasierten Scopes, mindestens `commerce.read`, `sync.execute`, `gmail.read`, `gmail.send`, `integration.manage` | Ohne gültige Identität liefern alle geschützten Endpunkte `401`; ohne Scope `403`. |
| Localhost-Modell explizit absichern | Ein zufälliges, nur im lokalen Client verfügbare Origin-Bindung/Session-Secret oder eine OS-gebundene Desktop-Integration | Ein anderer lokaler Prozess kann keinen mutierenden Request nur durch Kenntnis des Ports ausführen. |
| Externe Nutzung separat designen | TLS, Reverse-Proxy-Policy, IdP/OIDC, CSRF, Audit-Identität und Mandantenmodell als ADR | Kein Port-Binding außerhalb Loopback ohne freigegebenes ADR und Penetrationstest. |

### 3.3 SEC-02 — Fehlender Schutz gegen Cross-Site-Steuerung

OAuth nutzt korrekt einen gehashten, einmalig konsumierbaren State mit zehn Minuten Ablaufzeit. Dieser Schutz gilt jedoch ausschließlich für den OAuth-Callback. Die übrigen Side-Effect-Endpunkte besitzen keinen Anti-CSRF-Token, keine Origin-Validierung und keinen Fetch-Metadata-Filter. Besonders relevant sind die bodylosen bzw. einfach auslösbaren Routen für vollständige Shopify-Synchronisierung und Gmail-Disconnect. [5] [6]

OWASP empfiehlt, zustandsändernde Requests serverseitig zu schützen, Cross-Site-Requests per Token, Custom Header, Origin-Prüfung oder Fetch Metadata abzuweisen und keine GET-Routen mit Schreibwirkung zu verwenden. Die aktuelle Route `GET /integrations/{connection_id}/health` schreibt zudem ausdrücklich in die Health-Historie. [9] [5]

**Empfohlenes Zielmuster, nicht implementiert:**

```python
# Vorher: jede Anfrage am gebundenen Port kann den Sync auslösen.
@api.post("/shopify/sync")
async def sync_shopify() -> dict[str, Any]:
    return await run_full_sync()

# Nachher: konzeptionelles Muster. Identität und Origin-Prüfung sind zentral.
@api.post("/shopify/sync", dependencies=[Depends(require_scope("sync.execute"))])
async def sync_shopify(request: Request) -> dict[str, Any]:
    require_same_origin_or_valid_csrf(request)
    return await run_full_sync()
```

Eine robuste Lösung muss OAuth-Redirects und bewusst erlaubte externe Callbacks explizit ausnehmen, aber alle Standard-Mutationsrouten standardmäßig schließen. Ein UI-Dialog wie die vorhandene Zwei-Schritt-Gmail-Bestätigung ist wertvoll, ersetzt aber keine serverseitige Request-Provenance. [5] [6] [9]

### 3.4 DEP-01 — Verwundbarer ASGI-Framework-Stand

Der produktive Requirements-Satz pinnt FastAPI `0.110.1`; dessen zulässige Auflösung verwendet Starlette `0.37.2`. Die isolierte Abhängigkeitsprüfung meldete für diese Auflösung neun Advisory-Einträge in Starlette. OSV dokumentiert exemplarisch `PYSEC-2026-161`/CVE-2026-48710 („BadHost“): Alle früheren Versionen einschließlich `0.37.2` sind betroffen, der Fix beginnt erst bei `1.0.1`. Die konkrete Ausnutzbarkeit des Auth-Bypass-Aspekts hängt von path-basierten Schutzmechanismen ab, die diese Codebasis aktuell nicht hat; der verwundbare Bibliotheksstand bleibt dennoch nicht akzeptabel. [8] [10]

| Befund | Einordnung | Erforderliche Reaktion |
|---|---|---|
| Starlette `0.37.2` | Audit- und OSV-nachgewiesen verwundbar | Geplantes, getestetes Upgrade von FastAPI und Starlette als kompatibles Paket; nicht nur Starlette gegen FastAPI-Grenzen erzwingen. |
| `requirements-runtime.txt` enthält teilweise offene Untergrenzen | Reproduzierbarkeit und zukünftige Auflösung sind nicht vollständig fixiert | Lock-/Constraint-Strategie für Python-Runtime etablieren, inklusive CVE-Gate in CI. |
| `requirements.txt` enthält zahlreiche offenbar nicht produktive Pakete | Größere Entwicklungsangriffsfläche und Pflegeaufwand | Runtime-, Test- und Tool-Abhängigkeiten strikt getrennt halten; unbenutzte Pakete nach Importanalyse entfernen. |
| npm-Lockfile | Audit am Review-Tag ohne bekannte npm-Vulnerabilities | Positiver Befund; Audit als CI-Gate beibehalten, nicht als Ersatz für Toolchain-Migration verstehen. |

### 3.5 REL-01 — Nicht idempotentes Gmail-Senden

Der Sendepfad liest den Provider-Thread erneut und leitet Empfänger, Betreff und Threading-Header korrekt aus der letzten eingehenden Nachricht ab. Damit wird Browser-seitige Recipient/Header-Manipulation sauber verhindert. Nach der Provider-Übermittlung gibt es jedoch keinen Idempotency-Key, keine persistierte Sende-Operation und keine Deduplizierung gegen erneute Zustellung. Ein Timeout nach erfolgreicher Provider-Annahme kann deshalb für Browser oder Operator wie ein Fehlschlag aussehen und eine zweite identische E-Mail auslösen. [5] [6]

```python
# Vorher: die Sendefunktion hat keine stabile Operations-ID.
result = await _request_google_async(
    "POST", f"{GMAIL_API_BASE}/messages/send",
    access_token=access_token,
    json_body={"raw": raw, "threadId": thread_id},
)

# Nachher: konzeptionell. Eine servererzeugte Operation wird atomar angelegt.
operation = await begin_idempotent_send(thread_id, content_hash, actor_id)
if operation.completed:
    return operation.safe_result
result = await gmail_send(...)
await mark_send_completed(operation.id, safe_result(result))
```

Die Idempotenz muss mit einer stabilen, vom Server kontrollierten Operation-ID und einem klaren Retry-Fenster designt werden. Dabei ist zu verhindern, dass ein bewusst bearbeiteter, neuer Inhalt fälschlich als Duplikat verworfen wird.

### 3.6 PERF-01 und PERF-02 — Nicht skalierende Snapshot- und Query-Pfade

Die Übersicht lädt alle Orders, Produkte und Inventory-Items mit `to_list(None)` und berechnet Kennzahlen, Top-Produkte und Alterswerte im Python-Prozess. Die Reports-Route ruft die gesamte Overview-Route erneut auf. Zusätzlich geben Produkt-, Fulfillment-, Refund- und Return-Listen komplette Collections zurück; Detailrouten können alle Kundenorders oder alle offenen Orders einer Variante materialisieren. [5]

Die Snapshot-Synchronisierung lädt danach Produkte, Orders, Customers und Inventory sequenziell, hält Rohdaten und normalisierte Collections gleichzeitig im Speicher und versieht anschließend jedes Objekt mit `sync_id`. Der prozesslokale `asyncio.Lock` schützt nur einen einzelnen Worker/Prozess; er ist keine verteilte Koordination. Die explizite Ein-Worker-Konfiguration macht dies derzeit weniger sichtbar, verhindert aber horizontale Skalierung. [2] [4] [5] [7]

| Hotspot | Ist-Zustand | Empfohlene Zielarchitektur |
|---|---|---|
| `/overview` | Vollständige Materialisierung und Python-Aggregation | MongoDB-Aggregation mit `$match`, `$group`, `$facet` und begrenzten Top-N-Projektionen; nur aggregierte Ergebnisse übertragen. |
| Listen und Details | Mehrere unpagierte Rückgaben | Einheitliche Pagination/Cursor, Maximalgrößen und gezielte Feldprojektionen. |
| Textsuche | Case-insensitive, nicht verankerte Regexe über mehrere Felder | MongoDB-Text-/Atlas-Search-Index oder Suchmaterialisierung; Query-Limits und Messung von Explain-Plänen. |
| Business-Day-Filter | Vollständige Kandidatenliste plus kalenderweiser Python-Loop | Beim Sync berechnetes/indiziertes Alter oder begrenzte Server-Aggregation; Test mit vielen Jahren und hohen Order-Zahlen. |
| Vollsync | Komplettes In-Memory-Build, sequenzielle Fetches | Streaming/chunkweise Normalisierung, gespeicherter Sync-Status, distributed lock/Lease und gegebenenfalls Background-Worker. |

```python
# Vorher: vollständige Laden und Berechnung im API-Prozess.
orders = await db.orders.find({"sync_id": sync_id}, NO_ID).sort("processed_at", DESCENDING).to_list(None)
products = await db.products.find({"sync_id": sync_id}, NO_ID).to_list(None)
inventory = await db.inventory_items.find({"sync_id": sync_id}, NO_ID).to_list(None)

# Nachher: konzeptionell. Die Datenbank liefert nur die benötigten Aggregatwerte.
summary = await db.orders.aggregate([
    {"$match": {"sync_id": sync_id}},
    {"$facet": {
        "cards": [{"$group": {"_id": None, "orders": {"$sum": 1}}}],
        "recent": [{"$sort": {"processed_at": -1}}, {"$limit": 8}, {"$project": SAFE_ORDER_FIELDS}],
    }},
]).to_list(length=1)
```

Die Abkehr von vollständigen Reads ist kein vorzeitiges Optimieren: Die Architektur beschreibt vollständige Commerce-Snapshots und ein einzelnes Backend ausdrücklich als derzeitige Nichtfunktionsgrenze. Performance-Tests müssen deshalb vor und nach jeder Umstellung reale Datenvolumina messen. [2]

### 3.7 SEC-03 und OPS-01 — HTML-Defense-in-Depth sowie wachsende Control-Plane-Daten

Die Gmail-HTML-Sanitization ist sorgfältig umgesetzt: Blockierte Tags, erlaubte Attribute, sichere Link-Schemata und Einschränkung von Inline-CSS werden serverseitig behandelt; die Tests decken mehrere positive und negative Fälle ab. Dennoch wird das Ergebnis direkt im DOM gerendert und Nginx setzt weder CSP noch andere Browser-Sicherheitsheader. Das Risiko ist primär **Defense in Depth und Privacy**, nicht ein bestätigter XSS-Exploit: Ferninhalte können E-Mail-Tracking auslösen, und ein benutzerdefinierter Sanitizer ist kritischer als eine etablierte, kontinuierlich gepflegte Sanitizer-Bibliothek plus CSP/Sandbox. [5] [6] [11]

Zugleich persistiert die GET-Health-Route jedes Ergebnis und die Health-/Audit-Collections besitzen keine sichtbare Zeit- oder Mengenretention. Dies widerspricht der Erwartung an sichere HTTP-Methoden, erhöht Speicherverbrauch und kann durch Polling unbemerkt wachsen. [3] [5] [9]

| Ziel | Empfohlene Maßnahme |
|---|---|
| E-Mail-Inhalt isolieren | Sanitized HTML in ein restriktiv gesandboxtes `iframe` oder eine dedizierte Viewer-Origin verlagern; externe Bilder standardmäßig blockieren bzw. über einen kontrollierten Proxy laden. |
| Browserhärtung | CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors` und angemessene Cache-Header als Nginx-Baseline einführen; CSP gegen reale Gmail-Formatierungsfälle testen. |
| Health-Semantik | Schreibendes Sampling in `POST /health-snapshots` oder einen expliziten Job verschieben; `GET` rein lesend halten. |
| Retention | TTL-Index oder geplanter, getesteter Cleanup für `integration_health_snapshots`, `integration_audit_events` und Sync-Historie; Aufbewahrungsdauer fachlich entscheiden. |

## 4. Architektur- und Code-Qualitätsbewertung

Die wesentlichen Trennungen sind gut gewählt. `shopify.py` kapselt Authentifizierung, Pagination und Normalisierung; `gmail_service.py` kapselt OAuth, Token-Caching, Provider-Calls, HTML-Sanitization und KI-Entwürfe. Der Frontend-API-Client ist als Browser-Backend-Grenze wirksam, und die Snapshot-Aktivierung schützt davor, einen teilweise gefüllten Bestand sichtbar zu machen. [1] [2] [5] [6] [7]

Die Clean-Architecture-Qualität sinkt dort, wo `server.py` gleichzeitig Composition Root, Datenzugriffsschicht, Domain-Service, Integrations-Control-Plane, DTO-Serializer, Routing-Container und Middleware-Host ist. Direkte Dictionary-Responses vereinfachen die Entwicklung, erschweren aber Schema-Garantien, Maskierung sensibler Felder und automatische OpenAPI-Qualität. Der Legacy-Surface im API-Client und in Übersetzungen referenziert zudem nicht mehr primäre Funktionen wie Work Queue, Automations, Appointments und Purchasing, während der aktive Backend-Vertrag diese nicht vollständig bereitstellt oder leere Antworten liefert. [3] [5] [7]

| Prinzip | Bewertung | Konkrete Beobachtung | Zielzustand |
|---|---|---|---|
| Single Responsibility | Teilweise verletzt | `server.py` bündelt diverse Subdomänen und Infrastruktur. | Router je Domäne, Service-/Repository-Schicht, DTO-Module und Composition Root. |
| DRY | Teilweise verletzt | `post` und `adminPost` sind identisch; wiederkehrende UI-Fehlerbehandlung und Legacy-API-Methoden. | Gemeinsame Request-Policies und Entfernen nachweislich toter API-Flächen. |
| Dependency Inversion | Teilweise erfüllt | Provideradapter sind getrennt, der Server greift jedoch direkt global auf Mongo und Konstruktoren zu. | Dependency Injection für DB, Clock, Provider-Clients und Locks. |
| Explizite Verträge | Teilweise erfüllt | Gute Dokumentation, aber direkte `dict`/`list`-Responses ohne Pydantic-Response-Modelle. | Versionierte Pydantic-DTOs und Contract-Tests je Route. |
| Fehlerbehandlung | Teilweise erfüllt | Nutzerfehler sind meist safe; Providerfehler werden teils direkt als `str(exc)` in Sync-Records/Responses übernommen. | Zentraler Allow-list-Error-Mapper mit Korrelation-ID und getrenntem internem Fehlerdetail. |

Die dauerhaft beizubehaltenden positiven Schutzgrenzen sind: keine Shopify-Mutationen im Console-Backend, serverabgeleitete Gmail-Reply-Metadaten, optionaler/nicht sendender KI-Draft, Fernet-Speicherung von Refresh-Tokens und keine lokale Mailbox-Spiegelung. Diese Grenzen dürfen durch Refactorings nicht regressieren. [1] [2] [6]

## 5. Testabdeckung, Validierung und Lieferfähigkeit

Die isoliert ausführbaren Backend-Unit-Tests waren erfolgreich: **42 Tests bestanden**. Sie decken unter anderem OAuth-Konfiguration, Fernet-Roundtrip, HTML-Sanitization, Thread-Normalisierung, serverabgeleitete Reply-Headers, Shopify-Pagination und Snapshot-Link-Validierung ab. Die isolierten Frontend-Tests bestanden ebenfalls: **2 Suites mit 9 Tests**. Die Python-Syntaxprüfung der isolierten Backend-Kopie war erfolgreich. [5] [6] [12] [13]

| Prüfbereich | Ergebnis | Aussagekraft | Verbleibende Lücke |
|---|---|---|---|
| Backend-Unit-Tests | 42 bestanden | Gute Abdeckung von Purity-/Mapping-/Safety-Helpern. | Keine Route-Level-Auth-/CSRF-Tests, keine Send-Idempotenz, keine Mongo-Last- oder Retention-Tests. |
| Frontend-Unit-Tests | 2 Suites / 9 Tests bestanden | API-Request-Shapes und Format-Helper sind geschützt. | Keine Tests für Gmail-UI, Zwei-Schritt-Senden im Browser, XSS/CSP, Fehlerrückgaben oder kritische Nutzerflüsse. |
| HTTP-Integrationstest | Vorhanden, nicht ausgeführt | Testdatei prüft einen kontrollierten Live-Backend-Stack mit aktivem Snapshot. | Kein kontrollierter Snapshot/keine Provider-Credentials im Review; Ausführung wäre nicht rein analytisch und könnte Daten berühren. [12] |
| Compose-/Smoke-CI | Vorhanden | Start, Health und Port-Exposition werden geprüft. | Kein SAST, Dependency-Audit, secret scan, SBOM, AuthZ-/CSRF-Test, DAST oder Performance-Gate. [14] |
| npm Audit | Zur Review-Zeit 0 bekannte Vulnerabilities im vollständigen Lockfile | Positiver Momentbefund. | Keine CI-Erzwingung; deprecierte Toolchain und per `.npmrc` tolerierte Peer-Konflikte bleiben. [7] |

Die Teststrategie sollte als nächstes nicht pauschal „mehr Unit-Tests“ produzieren, sondern prüfbare Sicherheits- und Betriebsinvarianten definieren: unauthentifizierte Mutation muss fehlschlagen, Cross-Site-Mutation muss blockiert werden, doppelte Send-Operation muss genau einmal auslösen, Snapshot-Aktivierung darf bei Teilfehlern nicht kippen, Retention muss nach definiertem Umfang greifen und Overview/Search müssen unter repräsentativer Last feste Latenzbudgets einhalten.

## 6. Konkrete Optimierungs- und Refactoring-Roadmap

### 6.1 Phase A — Sicherheitsblocker vor Funktionsausbau

| Reihenfolge | Maßnahme | Ergebnis | Abnahmetest |
|---:|---|---|---|
| 1 | AuthN/AuthZ und Scope-Modell einführen | Jede Daten- und Mutationsroute kennt einen authentifizierten Principal. | Anonyme Requests erhalten `401`; Rollentests verifizieren `403` für fehlende Scopes. |
| 2 | Same-Origin-/CSRF-/Fetch-Metadata-Policy implementieren | Browser-basierte Cross-Site-Steuerung wird verhindert. | Cross-Site POST zu Sync, Disconnect, Lifecycle und Send wird `403`; OAuth-Callback bleibt funktionsfähig. |
| 3 | FastAPI/Starlette kompatibel aktualisieren | Kein bekannter Starlette-`0.37.2`-Befund bleibt in der produktiven Auflösung. | Lock/Constraints, `pip-audit` und vollständige Regression sind grün. |
| 4 | TLS-/Reverse-Proxy-ADR erstellen | Das Localhost-Modell wird sauber von einer späteren externen Architektur getrennt. | Kein externer Bind ohne dokumentiertes Threat Model, TLS, IdP und Geheimnismanagement. |

### 6.2 Phase B — Zuverlässigkeit und Datenpfade

| Reihenfolge | Maßnahme | Ergebnis | Abnahmetest |
|---:|---|---|---|
| 5 | Idempotente Gmail-Sendeoperationen | Kein doppeltes Mail-Senden bei Retry/Timeout. | Gleiche Operations-ID liefert denselben sicheren Status und nur einen Provider-Send. |
| 6 | Query-Budgets und Pagination vereinheitlichen | Keine unbounded List- oder Detailantworten mehr. | Maximale Response-Größe und `page_size` gelten auf allen Collections. |
| 7 | Overview und Suche datenbankseitig aggregieren | CPU-/RAM-Last skaliert nicht linear mit vollständigen Collections. | Explain-Pläne, P95-Latenz und Heap-Budget sind unter Zielvolumen dokumentiert. |
| 8 | Distributed Sync Lease und Streaming/Chunking | Mehrprozessfähigkeit und vorhersehbarer Snapshot-Ressourcenverbrauch. | Zwei Instanzen führen nie parallel denselben Sync aus; Fehler lässt aktiven Snapshot unverändert. |
| 9 | Retention für Control-Plane-Daten | Begrenztes Datenwachstum und nachvollziehbare Aufbewahrung. | TTL/Job-Test verifiziert Löschung nur nach freigegebener Frist. |

### 6.3 Phase C — Wartbarkeit und Lieferkette

| Reihenfolge | Maßnahme | Ergebnis | Abnahmetest |
|---:|---|---|---|
| 10 | `server.py` schrittweise in Router, Services, Repositories und DTOs zerlegen | Kleinere, testbare Einheiten ohne Verhaltensänderung. | Contract-Tests und API-Schema bleiben kompatibel; Architekturentscheidung dokumentiert. |
| 11 | Response-Modelle und zentralen Error-Mapper einführen | Explizite Verträge und kontrollierte Fehleroffenlegung. | OpenAPI-Snapshot und negative Tests je öffentliche Route. |
| 12 | Legacy-Flächen entscheiden und entfernen | API-Client, Übersetzungen und Backend-Vertrag stimmen überein. | Keine unreferenzierten Legacy-Methoden; Routing/API-Inventory ist automatisiert geprüft. |
| 13 | CRA/CRACO schrittweise zu Vite oder einem geeigneten React-Router-Framework migrieren | Aktives, wartbares Build-Ökosystem. | Identischer SPA-Betrieb, Tests, Build, Nginx-Serving und CSP in einer Migrations-ADR. [11] |
| 14 | CI Security Gates ergänzen | Regressionsschutz der Supply Chain und Source-Hygiene. | `pip-audit`, `npm audit`, Secret-Scan, SBOM und SAST sind Merge-Gates mit dokumentiertem Ausnahmeprozess. |

## 7. Positive Befunde, die geschützt werden müssen

Die Review hat keine hartcodierten Geheimnisse in den versionierten Quellen nach typischen AWS-, OpenAI-, Shopify- und Google-Key-Formaten festgestellt; `.env` ist untracked und durch `.gitignore` geschützt. Dies ist ein positiver Punkt, jedoch kein Ersatz für Secret-Scanning in CI. [4] [15]

Weiterhin sind folgende Mechanismen fachlich und technisch richtig ausgerichtet: die aktive Snapshot-Umschaltung erfolgt erst nach Validierung; Provider-Calls blockieren den FastAPI-Event-Loop nicht; Gmail-Thread-Reads sind on demand und konkurrierend begrenzt; KI-Drafts bleiben editierbar und nicht sendend; und die Mail-Sendelogik übernimmt weder Recipient noch Subject aus dem Browser. [2] [5] [6]

> **Schlussfolgerung.** Die Konsole ist als bewusst begrenztes Local-Operator-System sinnvoll aufgebaut. Sie ist jedoch noch keine sicher generalisierbare Operations-Plattform. Die kurzfristige Priorität lautet: Perimeter schließen, verwundbare Framework-Abhängigkeiten aktualisieren und Side Effects idempotent machen. Erst danach sollten Skalierungs- und modulare Refactorings folgen.

## 8. Review-Grenzen und Arbeitsbaumstatus

Der Review umfasste Quellen, Konfiguration, Verträge, Compose/Container, Dependency-Manifeste, relevante UI- und Backend-Module sowie die vorhandenen Tests. Die Live-HTTP-Integrationstests wurden nicht ausgeführt, weil sie einen kontrollierten Backend-Stack mit aktivem Shopify-Snapshot verlangen und die Review-Vorgabe keine Seiteneffekte zulässt. Ein vollständiger Frontend-Produktionsbuild wurde im angehängten Remote-Arbeitskontext nicht wiederholt, da dort keine Node-Laufzeit installiert war; die isolierten Frontend-Unit-Tests wurden dagegen erfolgreich ausgeführt.

Vor dem Anlegen dieses Berichts enthielt der Arbeitsbaum bereits nicht von diesem Review stammende Änderungen an `backend/Dockerfile`, `backend/server.py`, `docs/contracts/README.md` und `frontend/src/lib/api.js`, die Löschung von `frontend/src/pages/WorkQueue.jsx` sowie die untracked Datei `backend/tests/test_work_queue_removed.py`. `git diff --check` meldete keine Whitespace-Fehler, jedoch CRLF-Hinweise für zwei bereits modifizierte Dateien. Diese vorbestehenden Änderungen wurden **nicht verändert**.

## Referenzen

[1]: ./PROJECT.md "Projektbeschreibung und Sicherheitsgrenzen"
[2]: ./docs/architecture.md "Architektur, Datenflüsse und nichtfunktionale Grenzen"
[3]: ./docs/contracts/README.md "HTTP- und Datenvertragsdokumentation"
[4]: ./compose.yaml "Compose-Topologie und Loopback-Exposition"
[5]: ./backend/server.py "FastAPI-Routen, Snapshot-Aktivierung, Query- und Control-Plane-Logik"
[6]: ./backend/gmail_service.py "OAuth, Token-Schutz, HTML-Sanitization, Provider-Calls und Sendelogik"
[7]: ./frontend/package.json "Frontend-Abhängigkeiten, Skripte und Overrides"
[8]: ./backend/requirements-runtime.txt "Produktive Python-Abhängigkeiten"
[9]: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html "OWASP Cross-Site Request Forgery Prevention Cheat Sheet"
[10]: https://osv.dev/vulnerability/PYSEC-2026-161 "OSV: PYSEC-2026-161 / CVE-2026-48710 (Starlette BadHost)"
[11]: https://react.dev/blog/2025/02/14/sunsetting-create-react-app "React: Sunsetting Create React App"
[12]: ./backend/tests/test_erydez_backend.py "HTTP-Integrationstest für kontrolliertes Backend"
[13]: ./backend/tests/test_gmail_service_unit.py "Gmail-/OAuth-/Sanitization-Unit-Tests"
[14]: ./.github/workflows/compose-smoke.yml "Compose-Smoke-Workflow"
[15]: ./.gitignore "Ignore-Regeln für Umgebungsdateien"

---

**Autor:** Manus AI

**Status:** Review abgeschlossen; die freigegebenen Option-A-Maßnahmen sind implementiert und der aktuelle Stand ist oben nachvollziehbar ausgewiesen.
