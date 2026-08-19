# Gmail-KI-Antworten mit situativen Hinweisen

## Zweck

Die Gmail-Ansicht in der E-RYDEZ Operations Console zeigt verbundene Gmail-Konversationen an. Für einen ausgewählten Thread kann ein bearbeitbarer KI-Entwurf erstellt werden. Der Versand erfolgt ausschließlich nach der zweistufigen Bestätigung im Composer.

## Arbeitsablauf

| Schritt | Aktion | Ergebnis |
|---|---|---|
| 1 | In **Gmail** einen Kunden-Thread auswählen. | Der Verlauf und der Antwort-Composer werden angezeigt. |
| 2 | Unter **Hinweise für die KI** optional konkrete Informationen, Tonalität oder offene Fragen eintragen. | Die Hinweise steuern nur den nächsten KI-Entwurf. |
| 3 | **KI-Antwort generieren** auswählen. | Ein Entwurf wird mit Thread-Kontext und den Hinweisen erzeugt. |
| 4 | Entwurf fachlich prüfen und direkt im Composer bearbeiten. | Der bearbeitete Text bleibt vor dem Versand vollständig unter Nutzerkontrolle. |
| 5 | **Senden vorbereiten** und anschließend **Jetzt senden** wählen. | Die Antwort wird über das verbundene Gmail-Konto im bestehenden Thread zugestellt. |

> **Beispiel für einen geeigneten Hinweis:** „Bitte erkläre, dass die technische Machbarkeit erst geprüft werden muss, und frage nach Bestellnummer oder VIN. Antworte kurz und professionell.“

## Sicherheits- und Datenschutzverhalten

| Thema | Verhalten |
|---|---|
| Hinweislänge | Maximal 500 Zeichen. |
| Speicherung | Hinweise bestehen nur im geöffneten Composer und werden nicht in MongoDB gespeichert. |
| E-Mail-Inhalt | Hinweise werden nicht automatisch in die E-Mail übernommen. Nur der Nutzer prüft und versendet den finalen Entwurf. |
| KI-Schutz | Hinweise sind dem Thread-Kontext untergeordnet und können keine Sicherheits-, Sprach- oder Wahrheitsregeln überschreiben. |
| Versand | Die UI verlangt zwei bewusste Aktionen; eine KI-Antwort wird nie automatisch verschickt. |
| Tokens | Google-Refresh-Tokens werden verschlüsselt in der lokalen Datenbank gehalten; API-Schlüssel bleiben in der nicht versionierten `.env`. |

## Betrieb

Die Docker-Compose-Anwendung wird lokal unter `http://localhost:8082/gmail` bereitgestellt. Für den KI-Betrieb werden ein gültiger `OPENAI_API_KEY` und verfügbares API-Guthaben benötigt. Für Gmail sind `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` und die autorisierte Redirect-URI `http://localhost:8082/api/gmail/oauth/callback` erforderlich.

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

## Referenzen

[1]: https://developers.google.com/identity/protocols/oauth2/web-server "Google OAuth 2.0 for Web Server Applications"
[2]: https://platform.openai.com/docs/guides/prompt-engineering "OpenAI Prompt Engineering Guide"

[1] [2]
