"""Service-independent health-contract tests."""

import asyncio
import os
from pathlib import Path
import sys

import pytest
from fastapi import HTTPException
from pymongo.errors import ServerSelectionTimeoutError

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "erydez_health_test")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server  # noqa: E402


class UnavailableDatabase:
    async def command(self, _command):
        raise ServerSelectionTimeoutError("test database unavailable")


def test_readiness_returns_503_when_mongodb_is_unavailable(monkeypatch):
    monkeypatch.setattr(server, "db", UnavailableDatabase())

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(server.health_ready())

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "MongoDB is unavailable"
