"""Unit contracts for the F-009a local integration control plane."""

from __future__ import annotations

import os
from pathlib import Path
import sys

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "erydez_integration_control_test")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server  # noqa: E402


def sample_connection(**overrides):
    connection = {
        "id": "gmail-local",
        "provider": "gmail",
        "environment": "local",
        "display_identity": "Existing authorized Gmail mailbox",
        "lifecycle_state": "setup_required",
        "desired_state": "active",
        "capabilities": ["connection_control", "metadata_only_health"],
        "business_owner": {"display_name": "Existing authorized Gmail mailbox identity", "status": "confirmed"},
        "recovery_owner": {"display_name": None, "status": "pending"},
        "secret_reference": "must-not-serialize",
        "refresh_token": "must-not-serialize",
        "created_at": "2026-08-16T00:00:00Z",
        "updated_at": "2026-08-16T00:00:00Z",
        "last_action_reason": "Initialize approved local Gmail readiness record",
    }
    connection.update(overrides)
    return connection


def test_local_operator_label_uses_the_configured_non_secret_audit_label(monkeypatch):
    monkeypatch.setattr(server, "LOCAL_OPERATOR_LABEL", "Local operator")
    assert server.local_operator_label() == "Local operator"


def test_public_connection_never_serializes_secret_like_fields():
    result = server.public_connection(sample_connection())
    assert result["id"] == "gmail-local"
    assert "secret_reference" not in result
    assert "refresh_token" not in result
    assert set(result) == {
        "id",
        "provider",
        "environment",
        "display_identity",
        "lifecycle_state",
        "desired_state",
        "capabilities",
        "business_owner",
        "recovery_owner",
        "created_at",
        "updated_at",
        "last_action_reason",
    }


def test_control_plane_health_does_not_claim_message_readiness():
    health = server.connection_health(sample_connection())
    assert health["overall_status"] == "setup_required"
    assert health["dimensions"]["authorization"]["status"] == "not_configured"
    assert health["dimensions"]["receiver"]["status"] == "not_configured"
    assert health["dimensions"]["subscription"]["status"] == "not_built"
    assert health["dimensions"]["reconciliation"]["status"] == "not_built"
    assert "does not read, send, or synchronize Gmail data" in health["scope_note"]


def test_paused_connection_has_explicit_non_provider_action():
    health = server.connection_health(sample_connection(lifecycle_state="paused", desired_state="paused"))
    assert health["overall_status"] == "paused"
    assert "Resume only" in health["next_action"]


def test_public_audit_timeline_item_excludes_secret_like_connection_fields():
    event = {
        "id": "audit-1",
        "connection_id": "gmail-local",
        "actor": "Local operator",
        "action": "pause",
        "reason": "Pause for a local maintenance review",
        "prior_state": "setup_required",
        "next_state": "paused",
        "outcome": "recorded",
        "created_at": "2026-08-16T12:00:00Z",
        "provider_payload": "must-not-serialize",
    }
    result = server.public_audit_timeline_item(event, sample_connection())
    assert result["provider"] == "gmail"
    assert result["display_identity"] == "Existing authorized Gmail mailbox"
    assert result["actor"] == "Local operator"
    assert result["action"] == "pause"
    assert "secret_reference" not in result
    assert "refresh_token" not in result
    assert "provider_payload" not in result
    assert set(result) == {
        "id",
        "connection_id",
        "provider",
        "display_identity",
        "actor",
        "action",
        "reason",
        "prior_state",
        "next_state",
        "outcome",
        "created_at",
    }


def test_public_sync_run_ledger_item_exposes_safe_run_metadata_only():
    run = {
        "id": "run-1",
        "mode": "full_snapshot",
        "status": "failed",
        "started_at": "2026-08-16T12:00:00Z",
        "failed_at": "2026-08-16T12:00:04Z",
        "counts": {"orders": 3, "products": 2},
        "error": "access_token=shpat_sensitive client_secret=private-value",
        "snapshot": {"orders": [{"email": "must-not-serialize@example.com"}]},
    }
    result = server.public_sync_run_ledger_item(run)
    assert result["id"] == "shopify-sync:run-1"
    assert result["provider"] == "shopify"
    assert result["kind"] == "run"
    assert result["duration_seconds"] == 4.0
    assert result["counts"] == {"orders": 3, "products": 2}
    assert "shpat_sensitive" not in result["error_summary"]
    assert "private-value" not in result["error_summary"]
    assert "snapshot" not in result


def test_public_integration_ledger_item_preserves_safe_control_metadata_only():
    event = {
        "id": "audit-2",
        "connection_id": "gmail-local",
        "actor": "Local operator",
        "action": "resume",
        "reason": "Resume after local review",
        "prior_state": "paused",
        "next_state": "setup_required",
        "outcome": "recorded",
        "created_at": "2026-08-16T12:00:00Z",
        "provider_payload": "must-not-serialize",
    }
    result = server.public_integration_ledger_item(event, sample_connection())
    assert result["id"] == "integration-audit:audit-2"
    assert result["provider"] == "gmail"
    assert result["kind"] == "control_action"
    assert result["actor"] == "Local operator"
    assert result["duration_seconds"] == 0
    assert "provider_payload" not in result
    assert "secret_reference" not in result
