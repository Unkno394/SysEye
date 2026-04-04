from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from pathlib import Path


APP_DIR = Path.home() / ".syseye-agent"
DEFAULT_STATE_FILE = APP_DIR / "agent_id"
DEFAULT_LOG_FILE = APP_DIR / "agent.log"
DEFAULT_INSTANCE_LOCK_FILE = APP_DIR / "agent.lock"


@dataclass
class ResolvedAgentToken:
    api_key: str
    agent_id: str | None = None


@dataclass
class AgentConfig:
    server_url: str
    token: str
    poll_interval: int = 3
    heartbeat_interval: int = 10
    request_timeout: int = 15
    command_timeout: int = 60
    state_file: str = field(default_factory=lambda: str(DEFAULT_STATE_FILE))
    instance_lock_file: str = field(default_factory=lambda: str(DEFAULT_INSTANCE_LOCK_FILE))


def ensure_app_dir() -> Path:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    return APP_DIR


def resolve_agent_token(raw_token: str) -> ResolvedAgentToken:
    token = raw_token.strip()

    try:
        padded = token + "=" * (-len(token) % 4)
        decoded = base64.b64decode(padded).decode("utf-8")
        payload = json.loads(decoded)

        api_key = payload.get("apiKey")
        agent_id = payload.get("agentId")

        if isinstance(api_key, str) and api_key.strip():
            return ResolvedAgentToken(api_key=api_key.strip(), agent_id=agent_id)
    except Exception:
        pass

    return ResolvedAgentToken(api_key=token)
