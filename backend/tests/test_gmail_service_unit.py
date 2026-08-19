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


def test_detect_german_french_and_english():
    assert _detect_language({"body": "Guten Tag, wann wird meine Bestellung geliefert? Freundliche Grüsse"}) == "Deutsch"
    assert _detect_language({"body": "Bonjour, merci pour votre commande. Cordialement."}) == "Französisch"
    assert _detect_language({"body": "Hello, thank you for your order. Please confirm delivery."}) == "Englisch"


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
