"""Unit tests for the Google OAuth 2.0 Gmail service.

The tests do not call Google or persist real credentials. They verify the public
normalization contract, OAuth configuration validation, token encryption, and
that replies derive recipient/threading headers from Gmail source data.
"""

from __future__ import annotations

import asyncio
import base64
import os
from email import message_from_bytes
from pathlib import Path
import sys
from urllib.parse import parse_qs, urlparse

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import gmail_service
from gmail_service import (
    GmailConfigurationError,
    _build_conversation_context,
    _build_draft_plan,
    _detect_language,
    _extract_sender_name,
    _fernet,
    build_authorization_url,
    normalize_thread_for_api,
    oauth_configuration_status,
    send_thread_reply,
)

TEST_FERNET_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="


def configure_oauth(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "client-id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "unit-test-client-secret")
    monkeypatch.setenv("GMAIL_OAUTH_REDIRECT_URI", "http://localhost:8082/api/gmail/oauth/callback")
    monkeypatch.setenv("GMAIL_TOKEN_ENCRYPTION_KEY", TEST_FERNET_KEY)


def raw_message(
    *,
    message_id="message-1",
    thread_id="thread-1",
    sender="Customer <customer@example.com>",
    recipient="info.erydez@gmail.com",
    subject="Order enquiry",
    body="Hello, when will my order arrive?",
    internal_date="1787159206000",
    message_header_id="<message-1@example.com>",
):
    encoded = base64.urlsafe_b64encode(body.encode("utf-8")).decode("ascii").rstrip("=")
    return {
        "id": message_id,
        "threadId": thread_id,
        "internalDate": internal_date,
        "snippet": body[:80],
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "From", "value": sender},
                {"name": "To", "value": recipient},
                {"name": "Subject", "value": subject},
                {"name": "Message-ID", "value": message_header_id},
                {"name": "References", "value": "<previous@example.com>"},
            ],
            "body": {"data": encoded},
        },
    }


def test_oauth_configuration_reports_missing_values(monkeypatch):
    for name in ("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GMAIL_OAUTH_REDIRECT_URI", "GMAIL_TOKEN_ENCRYPTION_KEY"):
        monkeypatch.delenv(name, raising=False)
    status = oauth_configuration_status()
    assert status["configured"] is False
    assert "GOOGLE_OAUTH_CLIENT_ID" in status["missing"]
    assert "GMAIL_TOKEN_ENCRYPTION_KEY" in status["missing"]


def test_oauth_authorization_url_uses_state_offline_access_and_scopes(monkeypatch):
    configure_oauth(monkeypatch)
    url = build_authorization_url("csrf-state-value")
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "accounts.google.com"
    assert query["response_type"] == ["code"]
    assert query["state"] == ["csrf-state-value"]
    assert query["access_type"] == ["offline"]
    assert query["prompt"] == ["consent"]
    assert "gmail.readonly" in query["scope"][0]
    assert "gmail.send" in query["scope"][0]


def test_fernet_roundtrip_keeps_refresh_token_encrypted(monkeypatch):
    configure_oauth(monkeypatch)
    token = "refresh-token-value"
    encrypted = _fernet().encrypt(token.encode("utf-8"))
    assert token.encode("utf-8") not in encrypted
    assert _fernet().decrypt(encrypted).decode("utf-8") == token


def test_fernet_rejects_missing_configuration(monkeypatch):
    monkeypatch.delenv("GMAIL_TOKEN_ENCRYPTION_KEY", raising=False)
    with pytest.raises(GmailConfigurationError):
        _fernet()


def test_normalize_thread_marks_inbound_and_outbound_and_hides_internal_fields():
    inbound = raw_message()
    outbound = raw_message(
        message_id="message-2",
        sender="E-RYDEZ <info.erydez@gmail.com>",
        recipient="customer@example.com",
        body="Thank you for your message.",
        internal_date="1787159300000",
    )
    result = normalize_thread_for_api({"id": "thread-1", "historyId": "provider-only", "messages": [outbound, inbound]}, "info.erydez@gmail.com")
    assert result["id"] == "thread-1"
    assert result["messageCount"] == 2
    assert [item["direction"] for item in result["messages"]] == ["in", "out"]
    assert result["subject"] == "Order enquiry"
    assert result["messages"][0]["body"] == "Hello, when will my order arrive?"
    assert "historyId" not in str(result)
    assert "payload" not in str(result)


def test_normalize_thread_collects_attachments():
    message = raw_message()
    message["payload"] = {
        "mimeType": "multipart/mixed",
        "headers": message["payload"]["headers"],
        "parts": [
            {"mimeType": "text/plain", "body": {"data": base64.urlsafe_b64encode(b"See file").decode("ascii")}},
            {"mimeType": "application/pdf", "filename": "invoice.pdf", "body": {"attachmentId": "attachment-1"}},
        ],
    }
    result = normalize_thread_for_api({"id": "thread-1", "messages": [message]}, "info.erydez@gmail.com")
    assert result["hasAttachments"] is True
    assert result["messages"][0]["attachments"] == [{"filename": "invoice.pdf", "mimeType": "application/pdf"}]


def test_normalize_thread_preserves_safe_html_and_removes_unsafe_markup():
    message = raw_message(body="Hello customer")
    plain = base64.urlsafe_b64encode(b"Hello customer").decode("ascii")
    html_body = (
        b'<div style="color: #145CFF"><strong>Hello customer</strong><br>'
        b'<a href="https://example.com">Order details</a>'
        b'<img src="https://example.com/image.png" alt="Product image" onerror="alert(1)">'
        b'<script>alert(1)</script><a href="javascript:alert(1)">unsafe</a></div>'
    )
    html_encoded = base64.urlsafe_b64encode(html_body).decode("ascii")
    message["payload"] = {
        "mimeType": "multipart/alternative",
        "headers": message["payload"]["headers"],
        "parts": [
            {"mimeType": "text/plain", "body": {"data": plain}},
            {"mimeType": "text/html", "body": {"data": html_encoded}},
        ],
    }

    result = normalize_thread_for_api({"id": "thread-1", "messages": [message]}, "info.erydez@gmail.com")
    normalized = result["messages"][0]

    assert normalized["body"] == "Hello customer"
    assert '<strong>Hello customer</strong>' in normalized["htmlBody"]
    assert 'href="https://example.com"' in normalized["htmlBody"]
    assert 'target="_blank"' in normalized["htmlBody"]
    assert 'src="https://example.com/image.png"' in normalized["htmlBody"]
    assert "onerror" not in normalized["htmlBody"]
    assert "script" not in normalized["htmlBody"]
    assert "alert(1)" not in normalized["htmlBody"]
    assert "javascript:" not in normalized["htmlBody"]


def test_normalize_thread_handles_nested_rich_html_inline_images_and_attachment_variety():
    message = raw_message(body="Plain-text invoice fallback")
    plain = base64.urlsafe_b64encode(b"Plain-text invoice fallback").decode("ascii")
    rich_html = """<div style=\"font-family:Arial; color:#17202A; background-image:url(https://tracker.example/pixel)\">
      <h2>Rechnung &amp; Lieferstatus</h2>
      <p>Guten Tag <strong>Frau Stein</strong>, Ihre Bestellung enthalt <em>mehrere Positionen</em>.</p>
      <table width=\"100%\" style=\"border-collapse:collapse; width:100%\"><thead><tr><th>Artikel</th><th>Menge</th><th>Preis</th></tr></thead>
      <tbody><tr><td>City-Scooter</td><td>1</td><td>CHF 899.00</td></tr><tr><td colspan=\"2\">Rabatt</td><td>- CHF 50.00</td></tr></tbody></table>
      <ul><li>Lieferadresse verifiziert</li><li>Sendung wird vorbereitet</li></ul>
      <blockquote>Am 18.08.2026 schrieb E-RYDEZ Team: Ihre Bestellung wird gepruft.</blockquote>
      <pre>Bestellung: ERY-10482\nReferenz: 2026-08-19</pre>
      <p><a href=\"mailto:service@example.ch\">Service kontaktieren</a> · <a href=\"tel:+41440000000\">Telefon</a></p>
      <img src=\"data:image/png;base64,aGVsbG8=\" alt=\"Produktvorschau\" width=\"640\" height=\"320\">
      <img src=\"cid:inline-tracking-image\" alt=\"Inline-Grafik\">
      <svg><script>alert('blocked')</script><text>nicht anzeigen</text></svg>
      <iframe src=\"https://untrusted.example\">nicht anzeigen</iframe><style>body { display:none; }</style>
    </div>""".encode("utf-8")
    encoded_html = base64.urlsafe_b64encode(rich_html).decode("ascii")
    message["payload"] = {
        "mimeType": "multipart/mixed",
        "headers": message["payload"]["headers"],
        "parts": [
            {
                "mimeType": "multipart/alternative",
                "parts": [
                    {"mimeType": "text/plain", "body": {"data": plain}},
                    {"mimeType": "text/html", "body": {"data": encoded_html}},
                ],
            },
            {"mimeType": "application/pdf", "filename": "rechnung-ERY-10482.pdf", "body": {"attachmentId": "attachment-pdf"}},
            {
                "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "filename": "artikeluebersicht.xlsx",
                "body": {"attachmentId": "attachment-xlsx"},
            },
            {"mimeType": "image/png", "filename": "tracking-vorschau.png", "body": {"attachmentId": "attachment-inline"}},
            {"mimeType": "application/zip", "filename": "lieferdokumente.zip", "body": {"attachmentId": "attachment-zip"}},
        ],
    }

    result = normalize_thread_for_api({"id": "thread-rich", "messages": [message]}, "info.erydez@gmail.com")
    normalized = result["messages"][0]
    html_body = normalized["htmlBody"]

    assert normalized["body"] == "Plain-text invoice fallback"
    assert "<table" in html_body and "<th>Artikel</th>" in html_body and 'colspan="2"' in html_body
    assert "<ul><li>Lieferadresse verifiziert</li>" in html_body
    assert "<blockquote>Am 18.08.2026" in html_body
    assert "<pre>Bestellung: ERY-10482" in html_body
    assert 'href="mailto:service@example.ch"' in html_body
    assert 'src="data:image/png;base64,aGVsbG8="' in html_body
    assert 'alt="Produktvorschau"' in html_body
    assert "background-image" not in html_body
    assert "cid:inline-tracking-image" not in html_body
    assert "tel:+41440000000" not in html_body
    assert "iframe" not in html_body and "script" not in html_body and "svg" not in html_body
    assert "alert('blocked')" not in html_body and "nicht anzeigen" not in html_body
    assert normalized["attachments"] == [
        {"filename": "rechnung-ERY-10482.pdf", "mimeType": "application/pdf"},
        {"filename": "artikeluebersicht.xlsx", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
        {"filename": "tracking-vorschau.png", "mimeType": "image/png"},
        {"filename": "lieferdokumente.zip", "mimeType": "application/zip"},
    ]
    assert result["hasAttachments"] is True


def test_detect_german_french_and_english():
    assert _detect_language({"body": "Guten Tag, wann wird meine Bestellung geliefert? Freundliche Grüsse"}) == "Deutsch"
    assert _detect_language({"body": "Bonjour, merci pour votre commande. Cordialement."}) == "Französisch"
    assert _detect_language({"body": "Hello, thank you for your order. Please confirm delivery."}) == "Englisch"


def test_draft_plan_classifies_delivery_without_reusing_quoted_history():
    plan = _build_draft_plan([
        {"direction": "out", "body": "Wir prüfen den Versand.", "subject": "Bestellung"},
        {
            "direction": "in",
            "body": "Hello, when will my delivery arrive?\n\nOn 19 August, E-RYDEZ wrote:\nWe will ship it tomorrow.",
            "subject": "Re: Bestellung",
        },
    ])

    assert plan["intent"] == "delivery_status"
    assert plan["reply_profile"]["id"] == "delivery_status"
    assert plan["language"] == "Englisch"
    assert plan["order_reference_detected"] is False
    assert "delivery_or_tracking_must_be_verified" in plan["risk_flags"]
    assert "order_reference_missing" in plan["risk_flags"]
    assert plan["missing_information"] == ["Bestellnummer oder andere eindeutige Auftragsreferenz"]


def test_draft_plan_detects_pickup_order_reference_and_formality():
    plan = _build_draft_plan([
        {
            "direction": "in",
            "body": "Guten Tag, ich möchte für Bestellung #3691512 einen Abholtermin vereinbaren.",
            "subject": "Abholung Bestellung #3691512",
        },
    ])

    assert plan["intent"] == "pickup_appointment"
    assert plan["order_reference_detected"] is True
    assert plan["formality"] == "formell"
    assert plan["missing_information"] == []
    assert "availability_must_be_verified" in plan["risk_flags"]


def test_draft_plan_rejects_unknown_language_and_profile_hints():
    plan = _build_draft_plan(
        [{"direction": "in", "body": "Hello, can you confirm my delivery?", "subject": "Delivery"}],
        language_hint="Unsupported",
        profile_hint="not-a-profile",
    )

    assert plan["language"] == "Englisch"
    assert plan["reply_profile"]["id"] == "delivery_status"


def test_build_conversation_context_removes_reply_quotations():
    context = _build_conversation_context([
        {
            "direction": "in",
            "from": "Customer <customer@example.com>",
            "subject": "Delivery",
            "body": "Hallo, wann kommt die Bestellung?\n\nAm 19.08. schrieb E-RYDEZ:\nDie Bestellung wurde ausgeliefert.",
        },
    ])

    assert "wann kommt die Bestellung" in context
    assert "Die Bestellung wurde ausgeliefert" not in context


def test_sender_name_extraction_accepts_normalized_and_raw_messages():
    assert _extract_sender_name({"from": "Max Mustermann <max@example.com>"}) == "Max Mustermann"
    assert _extract_sender_name({"pickedHeaders": {"from": '"E-RYDEZ (Shopify)" <mailer@shopify.com>'}}) == "E-RYDEZ (Shopify)"
    assert _extract_sender_name({"from": "user@example.com"}) == "user"


def test_build_conversation_context_is_bounded_and_uses_headers():
    content = "A" * 3000
    context = _build_conversation_context([
        {"from": "Customer <customer@example.com>", "subject": "Question", "date": "2026-08-19T12:00:00Z", "body": content}
    ])
    assert "Customer <customer@example.com>" in context
    assert "Betreff: Question" in context
    assert "[... gekürzt ...]" in context
    assert len(context) < 2500


def test_send_reply_uses_gmail_source_thread_not_browser_recipient(monkeypatch):
    source = raw_message(subject="Re: Existing topic", message_header_id="<customer-message@example.com>")
    raw_thread = {"id": "thread-1", "messages": [source]}
    captured = {}

    async def fake_read_raw_thread(db, thread_id):
        assert thread_id == "thread-1"
        return raw_thread, "access-token"

    async def fake_get_token(db):
        return "access-token", {"email_address": "info.erydez@gmail.com"}

    def fake_request(method, url, **kwargs):
        captured.update({"method": method, "url": url, **kwargs})
        return {"id": "sent-message-1", "threadId": "thread-1"}

    monkeypatch.setattr(gmail_service, "_read_raw_thread", fake_read_raw_thread)
    monkeypatch.setattr(gmail_service, "get_connection_token", fake_get_token)
    monkeypatch.setattr(gmail_service, "_request_google", fake_request)

    result = asyncio.run(send_thread_reply(object(), "thread-1", "Confirmed reply text."))
    raw = captured["json_body"]["raw"]
    message = message_from_bytes(base64.urlsafe_b64decode(raw.encode("ascii")))
    assert result == {"id": "sent-message-1", "thread_id": "thread-1", "recipient": "customer@example.com", "subject": "Re: Existing topic"}
    assert captured["method"] == "POST"
    assert captured["json_body"]["threadId"] == "thread-1"
    assert message["To"] == "customer@example.com"
    assert message["Subject"] == "Re: Existing topic"
    assert message["In-Reply-To"] == "<customer-message@example.com>"
    assert "<previous@example.com>" in message["References"]
    assert "<customer-message@example.com>" in message["References"]
    assert "Confirmed reply text." in message.get_payload()


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))


class _TokenCollection:
    def __init__(self, token_record):
        self.token_record = token_record

    async def find_one(self, query, projection):
        assert query == {"id": gmail_service.TOKEN_DOCUMENT_ID}
        assert projection == {"_id": 0}
        return self.token_record


class _TokenDb:
    def __init__(self, token_record):
        self.gmail_oauth_tokens = _TokenCollection(token_record)


def test_connection_token_is_cached_in_memory_until_provider_expiry(monkeypatch):
    configure_oauth(monkeypatch)
    encrypted = _fernet().encrypt(b"refresh-token-value").decode("utf-8")
    database = _TokenDb({"id": gmail_service.TOKEN_DOCUMENT_ID, "refresh_token_encrypted": encrypted})
    requests_made = []

    class FakeResponse:
        ok = True

        def json(self):
            return {"access_token": "short-lived-token", "expires_in": 3600}

    def fake_post(*args, **kwargs):
        requests_made.append((args, kwargs))
        return FakeResponse()

    gmail_service._ACCESS_TOKEN_CACHE.clear()
    monkeypatch.setattr(gmail_service.requests, "post", fake_post)

    first_token, _ = asyncio.run(gmail_service.get_connection_token(database))
    second_token, _ = asyncio.run(gmail_service.get_connection_token(database))

    assert first_token == second_token == "short-lived-token"
    assert len(requests_made) == 1


def test_thread_list_returns_compact_summaries_without_mailbox_persistence(monkeypatch):
    raw_threads = {
        "thread-a": {"id": "thread-a", "messages": [raw_message(message_id="message-a", thread_id="thread-a")]},
        "thread-b": {"id": "thread-b", "messages": [raw_message(message_id="message-b", thread_id="thread-b")]},
    }
    calls = []

    async def fake_token(db):
        return "access-token", {"email_address": "info.erydez@gmail.com"}

    async def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs.get("params")))
        if url.endswith("/threads"):
            return {"threads": [{"id": "thread-a"}, {"id": "thread-b"}], "nextPageToken": "next-page"}
        return raw_threads[url.rsplit("/", 1)[-1]]

    class SyncState:
        async def update_one(self, *args, **kwargs):
            return None

    class Db:
        gmail_sync_state = SyncState()

    monkeypatch.setattr(gmail_service, "get_connection_token", fake_token)
    monkeypatch.setattr(gmail_service, "_request_google_async", fake_request)

    result = asyncio.run(gmail_service.list_threads(Db(), max_results=2))

    assert result["total"] == 2
    assert result["nextPageToken"] == "next-page"
    assert all(thread["messages"] == [] for thread in result["threads"])
    assert len(calls) == 3
    assert all("payload" not in str(thread) for thread in result["threads"])
