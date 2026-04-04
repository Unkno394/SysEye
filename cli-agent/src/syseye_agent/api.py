from __future__ import annotations

from typing import Any

import requests


class ApiError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class ApiClient:
    def __init__(self, server_url: str, token: str, timeout: int = 15, api_key_header: str = "X-Api-Key"):
        self.base_url = server_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                api_key_header: token,
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )

    def _request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        try:
            response = self.session.request(method, f"{self.base_url}{path}", timeout=self.timeout, **kwargs)
        except requests.RequestException as exc:
            raise ApiError(f"request failed: {exc}") from exc

        if response.status_code >= 400:
            detail = response.text.strip() or response.reason
            raise ApiError(detail, response.status_code)

        return response

    def register(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self._request("POST", "/internal/agent/register", json=payload)
        return response.json()

    def heartbeat(self, agent_id: str, payload: dict[str, Any] | None = None) -> str | None:
        response = self._request("POST", f"/internal/agent/{agent_id}/heartbeat", json=payload or {})
        if not response.content:
            return None
        return response.text.strip().strip('"')

    def get_task(self, agent_id: str) -> dict[str, Any] | None:
        response = self.session.get(f"{self.base_url}/internal/agent/{agent_id}/tasks/next", timeout=self.timeout)

        if response.status_code == 204:
            return None

        if response.status_code >= 400:
            detail = response.text.strip() or response.reason
            raise ApiError(detail, response.status_code)

        if not response.content:
            return None

        return response.json()

    def send_output(self, payload: dict[str, Any]) -> None:
        response = self.session.post(f"{self.base_url}/internal/task/output", json=payload, timeout=self.timeout)

        if response.status_code >= 400:
            detail = response.text.strip() or response.reason
            raise ApiError(detail, response.status_code)

    def send_result(self, payload: dict[str, Any]) -> None:
        response = self.session.post(f"{self.base_url}/internal/task/result", json=payload, timeout=self.timeout)

        if response.status_code >= 400:
            detail = response.text.strip() or response.reason
            raise ApiError(detail, response.status_code)
