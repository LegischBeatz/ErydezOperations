# ADR 0008: Sichere Performance-Messung und bedarfsorientierte Leseoptimierung

- **Status:** Accepted
- **Datum:** 2026-08-20

## Kontext

Die E-RYDEZ Operations Console liest Commerce-Daten ausschließlich aus dem aktiven, validierten Shopify-Snapshot in MongoDB. Gmail bleibt eine lokale OAuth-gestützte On-demand-Integration und darf weder als Mailbox gespiegelt noch im Hintergrund synchronisiert werden. Eine Performance-Analyse hat gezeigt, dass mehrere Commerce-Listen zunächst vollständige aktive Collections in den API-Prozess laden, während die Gmail-Inbox einen Access-Token-Refresh und mehrere Thread-Metadatenabfragen seriell ausführt.

Eine Optimierung muss die Snapshot-Konsistenz, Shopify als autoritative Commerce-Quelle, Gmail-On-demand-Lesen, verschlüsselte Refresh-Token-Persistenz und den explizit bestätigten Versand vollständig erhalten. Diagnosedaten dürfen keine Suchbegriffe, Kundenfelder, Nachrichteninhalte, Providerpayloads oder Geheimnisse erfassen.

## Entscheidung

1. Die API misst jede `/api`-Antwort mit einem `Server-Timing`-Anwendungswert und redigierten Struktur-Logs. Erfasst werden nur HTTP-Methode, Route ohne Identifikatoren/Query, Status, Dauer, Antwortgrößenhinweis und aggregierte Datenbankdauer.
2. Direkt ausdrückbare Commerce-Filter werden innerhalb des aktiven `sync_id`-Snapshots in MongoDB ausgeführt. Orders, Inventory und Customers zählen und lesen jeweils nur die benötigte Seite; Products wendet seine weiterhin kompatible Listenform nach serverseitigem Text-/Statusfilter an. Die exakte Geschäftsregel für Tagesalter bleibt ein begrenzter Kompatibilitätspfad in Python.
3. Globale Commerce-Suche führt unabhängige aktive Snapshot-Abfragen parallel aus. Browser-Suchfelder drosseln Netzwerkanfragen, ohne die lokale Eingaberückmeldung oder die bestehende URL-/Filtersemantik aufzugeben.
4. Gmail hält einen Access-Token ausschließlich kurzlebig im Prozessspeicher, abgeleitet aus dem bestehenden verschlüsselten Refresh-Token. Threadlisten laden nur kompakte Metadaten in begrenzter Parallelität und enthalten keine vollständigen Nachrichten. Vollständige Threads bleiben ein expliziter On-demand-Detailaufruf.
5. Nginx komprimiert geeignete textbasierte Antworten und cachet ausschließlich gehashte statische Build-Assets langfristig. HTML wird revalidiert; für `/api` wird kein pauschales Browser- oder Proxy-Caching eingeführt.

## Alternativen

| Alternative | Nicht gewählt, weil |
|---|---|
| Mehr FastAPI-Worker ohne weitere Änderungen | Der Shopify-Sync-Lock ist pro Prozess; mehrere Worker könnten parallele Vollsynchronisationen ermöglichen. |
| Dauerhafte Speicherung von Gmail-Threads für die Inbox | Dies würde die On-demand- und Nicht-Mirror-Grenze verletzen und zusätzliche Datenschutz-/Betriebspflichten schaffen. |
| Browser- oder Nginx-Cache für alle API-Antworten | Aktive Snapshot-, Gmail- und Integrationsdaten haben unterschiedliche Frische- und Datenschutzanforderungen. |
| Reine Frontend-Virtualisierung | Sie reduziert DOM-Arbeit, nicht aber Full-Collection-Reads, Python-Filterung oder JSON-Transfer. |
| Unbegrenzte Gmail-Parallelität | Sie kann Gmail-Quoten und Providerfehler verschärfen. |

## Konsequenzen

Die meisten Commerce-Nutzerpfade übertragen und verarbeiten weniger Snapshotdaten. Gmail-Listen bleiben on demand, benötigen aber weniger wiederholte OAuth-Refreshes und vermeiden die vollständige Nachrichtenübertragung in der Listenansicht. `Server-Timing` und redigierte Logkategorien schaffen eine erste Messgrundlage, sind aber kein vollständiges Metrik- oder Tracing-System.

Reguläre Ausdruckssuchen können weiterhin von der Snapshotgröße abhängig sein. Neue MongoDB-Indizes werden erst nach produktionsnahen `explain("executionStats")`-Messungen bewertet. Überblick, Reports, Fulfillment, Returns/Refunds und Vollsnapshot-Synchronisation bleiben für eine spätere P1-Stufe mit getrennten Last- und Sicherheitsprüfungen vorgesehen.

## Risiken und Maßnahmen

| Risiko | Maßnahme |
|---|---|
| Subtile Abweichung der Suchsemantik | Bestehende Vertrags- und gezielte Unit-Tests für Textsuche, Statusfilter und Pagination beibehalten/erweitern. |
| Access-Token-Veralterung oder Backend-Neustart | Token vor Ablauf erneuern; Cache ist nur eine Optimierung, ein Neustart erzwingt sicher erneut den regulären OAuth-Refresh. |
| Gmail-Quoten durch parallele Metadatenabrufe | Konservative feste Parallelitätsgrenze, Providerfehlerweitergabe und spätere Messung der Requestzahl. |
| Diagnosedaten enthalten sensible Inhalte | Nur Route-Templates und aggregierte Dauer-/Größenwerte loggen; keine Query, Identifikatoren, Kundenfelder, Gmail-Inhalte, Token oder Providerpayloads. |
| Falsch konfigurierter Asset-Cache | Langfristige Cache-Regel ausschließlich für CRA-`static/`-Hashassets; `index.html` bleibt revalidierbar und APIs werden nicht gecacht. |

## Implementierungsnotizen

Die Entscheidung verändert weder die Eigentümerschaft noch die Aktivierungssemantik des Shopify-Snapshots. Sie führt keine Shopify-Mutation, Gmail-Watch, Gmail-Hintergrundsynchronisation, Mailbox-Persistenz, Attachment-Download oder automatische E-Mail-Sendung ein. Die zwei Schritte der Gmail-Sendebestätigung und die serverseitig abgeleiteten Empfänger-/Threading-Header bleiben unverändert.
