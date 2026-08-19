# Gmail Workspace: UI/UX-Überarbeitung

## Ziel und Umfang

Die Gmail-Arbeitsfläche wurde als fokussierter E-Mail-Workspace überarbeitet. Ziel war, dass Mitarbeitende Kunden-E-Mails in ihrem vollständigen Kontext lesen, einordnen und sicher beantworten können, ohne die dichte und sachliche Gestaltung der Operations Console zu verlassen. Die bestehende API-Grenze in `frontend/src/lib/api.js` und der kontrollierte, zweistufige Versandablauf bleiben unverändert.

## Umgesetzte Verbesserungen

| Bereich | Umsetzung | Nutzerwirkung |
|---|---|---|
| Inbox | Klare Listenhierarchie mit Absender, Betreff, Vorschau, Zeit, Nachrichtenanzahl, Anhangshinweis, Suche, Schnellfiltern und „Weitere E-Mails laden“. | Konversationen lassen sich schneller priorisieren und auffinden. |
| Thread-Ansicht | Nachrichten werden als chronologische, getrennte Karten mit Richtung, Absender, Empfänger, Zeitpunkt und aufklappbaren Header-Details dargestellt. | Der gesamte Gesprächsverlauf und die Verantwortlichkeiten sind ohne Kontextverlust verständlich. |
| E-Mail-Inhalt | Plain Text bleibt lesbar; serverseitig bereinigtes HTML bewahrt Absätze, Links, Listen, Tabellen, Bilder und Zitate. Lange Inhalte können bewusst ausgeklappt werden. | Reale E-Mails wirken wie E-Mails statt wie unstrukturierte Rohtexte. |
| Anhänge | Dateiname und MIME-Typ werden in kompakten, klar getrennten Chips dargestellt; verbreitete Dateiformate werden als PDF, XLSX, DOCX, PPTX, PNG, JPG, ZIP, CSV oder TXT abgekürzt. | Anhänge sind sichtbar, ohne den Lesefluss zu stören. |
| KI-Entwurf | Hinweise sind einklappbar, auf 500 Zeichen begrenzt und deutlich als nicht gespeichert bzw. nicht versendet markiert. Nach der Generierung erscheinen editierbarer Entwurf, genutzter Kontext und Prüfhinweis. | Die KI unterstützt den Arbeitsablauf, ersetzt aber keine fachliche Prüfung. |
| Versand | Empfänger und Thread-Zusammenhang sind sichtbar; die bestehende Vorbereitung und anschließende Bestätigung bleiben erhalten. | Der Versand bleibt eine bewusste, nachvollziehbare Nutzerentscheidung. |
| Responsive Verhalten | Breite Bildschirme nutzen Liste und Konversation parallel. Auf kleinen Breiten wird zwischen Inbox und Thread gewechselt; die globale Navigation wird als ausblendbare Mobilnavigation geführt. | Der Workspace bleibt auch auf schmalen Bildschirmen bedienbar. |
| Zustände | Skeletons, Leerzustand, Fehlermeldung mit Wiederholungsaktion, Verbindungsstatus und KI-nicht-verfügbar-Hinweis sind explizit gestaltet. | Rückmeldungen sind nachvollziehbar statt leer oder fehleranfällig zu wirken. |

## Darstellung und Sicherheit

Formatierte E-Mails erreichen das Frontend zusätzlich als `htmlBody`. Der Backend-Service bereinigt diesen Wert mit einer Allow-List und entfernt ausführbare oder eingebettete Inhalte sowie unsichere URL-Schemata. Das Frontend verwendet `body` weiterhin als Fallback, falls eine HTML-Repräsentation nicht verfügbar ist. Der genaue HTTP- und Datenvertrag ist in [`contracts/gmail.md`](contracts/gmail.md) beschrieben.

## Verifikation

| Prüfung | Ergebnis |
|---|---|
| Docker-Compose-Neubau | Erfolgreich; Frontend, Backend und MongoDB waren anschließend gesund. |
| Frontend-Produktionsbuild | Erfolgreich innerhalb des Docker-Compose-Builds. |
| Gmail-Unit-Tests | Erfolgreich: `12 passed`. Die Tests decken erlaubtes formatiertes HTML, das Entfernen unsicherer Attribute, Tags und URLs sowie verschachtelte MIME-Strukturen mit mehreren Anhangstypen ab. |
| Backend-Syntax | Erfolgreich mit `PYTHONPYCACHEPREFIX=/tmp/pycache python -m compileall -q /app` im laufenden Backend-Container. |
| Breite Browseransicht | Visuell geprüft mit Inbox, Thread, HTML-Formatierung, Zitat, Anhängen, langen Inhalten, Details und Composer. |
| KI-Antwortablauf | Visuell geprüft mit Hinweisen, Entwurf, Kontextchips, editierbarem Composer und Versandvorbereitung. Der finale Versand wurde nicht ausgelöst. |
| Schmale Browseransicht | Visuell geprüft in einer 375-Pixel-Einbettung; Thread-Auswahl, Rücknavigation und Composer blieben bedienbar. |
| Lade-, Leer- und Fehlerzustand | Visuell geprüft mittels realitätsnaher lokaler Gmail-Testantworten. |
| Erweiterter Rich-HTML- und Anhangstest | Visuell und per Unit-Test geprüft mit Tabelle, Liste, Daten-URI-Inline-Bild, Zitat, vorformatiertem Text, Mailto-Link sowie PDF-, XLSX-, PNG- und ZIP-Anhängen. |
| Gesamt-UI bei breiten Ansichten | Mit realer Inbox und Threadansicht bei 1.100, 1.440 und 1.920 Pixeln geprüft. Die HTML-spezifischen Layoutregeln blieben unverändert; korrigiert wurden ausschließlich Spaltenbreiten, gemeinsame Inhaltsachsen, Composer-Höhen und responsive Header-Aktionen. |

## Bekannte Grenze

Die Ansicht stellt die von Gmail gelieferten Attachment-Metadaten dar. Ein direkter Datei-Download ist nicht Teil des bestehenden Gmail-HTTP-Vertrags und wurde daher nicht ergänzt. Eingebettete Inhalte mit `cid:`-Referenzen werden aus Sicherheits- und Datenverfügbarkeitsgründen nicht als Bild geladen; sie bleiben bei Bedarf als reguläre Anhangsmetadaten sichtbar.
