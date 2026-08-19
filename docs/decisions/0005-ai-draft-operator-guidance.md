# ADR 0005: Flüchtige operative Hinweise für KI-E-Mail-Entwürfe

**Status:** Akzeptiert
**Datum:** 2026-08-19

## Kontext

Bei einzelnen Kundenanfragen reicht der bisherige Gesprächsverlauf nicht aus, um einen fachlich passenden Antwortentwurf zu erzeugen. Mitarbeitende benötigen deshalb eine Möglichkeit, situationsbezogene Informationen, gewünschte Tonalität oder ausdrücklich noch offene Fragen für genau einen KI-Entwurf bereitzustellen.

Die Hinweise können geschäftlich sensibel sein. Sie dürfen daher weder unbemerkt als E-Mail-Inhalt versendet noch als dauerhafter Kommunikationsbestandteil gespeichert werden. Gleichzeitig dürfen sie die Vorgaben gegen Halluzinationen, unbestätigte Zusagen oder irreführende Aussagen nicht außer Kraft setzen.

## Entscheidung

Der Gmail-Composer enthält ein optionales Textfeld **„Hinweise für die KI“** mit einer Begrenzung von 500 Zeichen. Die Eingabe wird ausschließlich bei der nächsten KI-Entwurfserstellung an den bestehenden Antwortendpunkt übergeben.

Der Client hält die Hinweise nur im lokalen Komponentenstatus. Der Backend-Service verwendet sie als abgegrenzten, operativen Kontext innerhalb des KI-Prompts. Der Kontext wird auf 500 Zeichen begrenzt und ausdrücklich den übergeordneten Wahrheits-, Sicherheits- und Sprachregeln untergeordnet. Er wird nicht in der E-Mail versendet, nicht in MongoDB gespeichert und nach einem erfolgreichen Versand aus dem Composer entfernt.

Die Ergebnisansicht markiert nachvollziehbar, dass operative Hinweise berücksichtigt wurden, ohne den vollständigen Hinweis als E-Mail-Metadatum offenzulegen.

## Konsequenzen

| Bereich | Konsequenz |
|---|---|
| Bedienung | Nutzer können einen KI-Entwurf präzise steuern, ohne den Entwurf nachträglich vollständig umschreiben zu müssen. |
| Datenschutz | Hinweise bleiben flüchtig und werden nicht Teil der gespeicherten Gmail-Verbindungsdaten oder des versendeten Inhalts. |
| Sicherheit | Begrenzung, Kontextabgrenzung und Priorisierung der übergeordneten Regeln reduzieren das Risiko widersprüchlicher oder irreführender Anweisungen. |
| Nachvollziehbarkeit | Die UI zeigt, dass ein Hinweis berücksichtigt wurde; Nutzer prüfen und bearbeiten den Entwurf weiterhin vor dem Versand. |
| Betrieb | Es entstehen keine zusätzlichen Datenbankmigrationen oder Hintergrundprozesse. |

## Alternativen

Eine dauerhafte Speicherung von Hinweisvorlagen oder historisierten Entwurfsanweisungen wurde nicht gewählt. Sie würde zusätzliche Aufbewahrungs-, Lösch- und Berechtigungskonzepte erfordern und war für den konkreten Einzelfall-Workflow nicht notwendig.

Ein freies, unbegrenztes Promptfeld wurde ebenfalls verworfen. Es erschwert die Bedienung, erhöht das Risiko für Prompt-Injection und würde unnötig viel Kontext an den KI-Anbieter übermitteln.

## Validierung

Die Funktion wurde mit einem realen Gmail-Thread und einem situationsbezogenen Testhinweis validiert. Der resultierende englische Entwurf übernahm die geforderte technische Einschränkung sowie die Bitte um Bestellnummer oder VIN. Die Oberfläche zeigte den Hinweis-Status und blieb vor einer Zustellung in der zweistufigen Versandbestätigung stehen.

## Referenzen

[1]: https://developers.google.com/identity/protocols/oauth2/web-server "Google OAuth 2.0 for Web Server Applications"
[2]: https://platform.openai.com/docs/guides/prompt-engineering "OpenAI Prompt Engineering Guide"

[1] [2]
