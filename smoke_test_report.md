# Smoke-Test-Bericht

**System:** E-RYDEZ Operations Console  
**Testart:** Laufzeit-, Routing- und Headless-Browser-Smoke-Test  
**Umfang:** Kontrollierte, ausschließlich lesende Prüfung der lokalen Compose-Instanz. Es wurden weder Shopify-Synchronisierungen noch Gmail-Sendevorgänge oder sonstige Provideraktionen ausgelöst.

## Stack und Zugang

| Komponente | Beobachteter Zustand | Zugang |
|---|---|---|
| Frontend / Nginx | `healthy` | `http://127.0.0.1:8082` |
| FastAPI Backend | `healthy`, nur Compose-intern an `8000/tcp` | über denselben Origin unter `/api` |
| MongoDB | `healthy`, nur Compose-intern an `27017/tcp` | keine direkte Host-Veröffentlichung |

Der einzige veröffentlichte Host-Port ist erwartungsgemäß die loopback-gebundene Frontend-URL. Das bestätigt die vorgesehene lokale Deployment-Grenze.

## Kompakter Testplan

| ID | Testfall | Erwartung | Ergebnis |
|---|---|---|---|
| ST-01 | Container- und Health-Prüfung | Alle drei Container sind healthy; Nginx, FastAPI und Ready-Check antworten. | **Bestanden** |
| ST-02 | Sichere API-Kernpfade | Health, Shopify-Status ohne Live-Providerkontakt, paginierte Orders und Gmail-Status liefern HTTP 200. | **Bestanden** |
| ST-03 | SPA-Navigation | Root sowie Orders, Products, Inventory, Customers, Fulfillment, Returns, Refunds, Reports, Gmail und Settings liefern den SPA-Fallback. | **Bestanden** |
| ST-04 | Headless-Browser-Rendering | Chrome lädt Root, Orders, Gmail und Settings mit frischem Testprofil; Fehlerindikatoren in der Browserausgabe werden gezählt. | **Bestanden** |
| ST-05 | Container-Fehlerindikatoren | Die letzten 200 Frontend- und Backend-Logzeilen werden nur auf Fehlerindikatoren geprüft. | **Bestanden** |
| ST-06 | Interaktive Formulare und Seiteneffekte | Shopify-Sync, Gmail-Senden und Gmail-OAuth werden nicht ausgelöst; Such- und Tabelleninteraktionen benötigen eine funktionierende interaktive Browser-Verbindung. | **Nicht ausgeführt – bewusst / blockiert** |

## Ergebnisse

| Prüfbereich | Befund |
|---|---|
| Docker-Stack | `erydez-operations-frontend-1`, `erydez-operations-backend-1` und `erydez-operations-mongodb-1` liefen healthy. |
| Health-Endpunkte | `/healthz`, `/api/health/live` und `/api/health/ready` antworteten jeweils mit HTTP 200. |
| Sichere Fachendpunkte | `/api/shopify/status?live=false`, `/api/orders?page=1&page_size=1` und `/api/gmail/status` antworteten jeweils mit HTTP 200. Providerzugriffe oder Dateninhalte wurden nicht ausgegeben. |
| SPA-Routen | Elf geprüfte Pfade lieferten HTTP 200 und dieselbe kompakte SPA-Einstiegsantwort: `/`, `/orders`, `/products`, `/inventory`, `/customers`, `/fulfillment`, `/returns`, `/refunds`, `/reports`, `/gmail` und `/settings`. |
| Headless Chrome | Die Pfade `/`, `/orders`, `/gmail` und `/settings` wurden mit einem separaten Chrome-Testprofil gerendert. Die datensparsame Prüfung der Browserausgabe ergab **0** Treffer für `SEVERE`, `CONSOLE`, `Uncaught`, `TypeError` oder `ReferenceError`. |
| Containerlogs | Die datensparsame Prüfung der letzten 200 Zeilen pro Frontend- und Backend-Container ergab **0** Treffer für `error`, `exception` oder `traceback`. |

## UI- und Konsolenbefunde

Im getesteten Headless-Umfang wurden keine Browser-Konsolenfehlerindikatoren gefunden. Auch die statische SPA-Auslieferung und zentrale Route-Fallbacks waren unauffällig.

Der interaktive Browser-Connector war jedoch nicht verfügbar: Die Verbindung zum aktivierten lokalen Browser lieferte `Receiving end does not exist`. Deshalb konnten keine echten Klickpfade, sichtbaren Layoutprüfungen, Suchinteraktionen, Tabellenwechsel oder Formulareingaben über die interaktive Browsersteuerung durchgeführt werden. Der Headless-Chrome-Test bestätigt Rendering und Laufzeit ohne registrierte Fehlerindikatoren, ersetzt aber keine manuelle visuelle Abnahme.

> **Bewusste Sicherheitsgrenze:** Shopify-Synchronisierung, Gmail-OAuth, KI-Draft-Erzeugung und insbesondere Gmail-Senden wurden nicht getestet, da sie externe Provideraktionen beziehungsweise reale Seiteneffekte auslösen können.

## Empfehlung

Der lokale Stack ist für die geprüften Smoke-Kriterien funktionsfähig. Vor einer vollständigen UI-Freigabe sollte die lokale Browser-Verbindung wiederhergestellt werden. Danach empfiehlt sich ein kurzer interaktiver Nachtest: globale Suche, Orders-Filter und Pagination, Tabellen-/Detailnavigation, Gmail-Status und der nicht-sendeauslösende Composer-Einstieg. Shopify-Sync und Gmail-Senden sollten nur in einem ausdrücklich freigegebenen, kontrollierten Provider-Test erfolgen.
