# SysEye CLI agent

Installable Python CLI for SysEye agents.

What it does now:
- registers itself on the local backend using an API key
- stores the server `agentId` in `~/.syseye-agent/agent_id`
- sends heartbeat in the background loop
- is ready for task polling when internal task endpoints appear
- can generate autostart service templates for Linux and Windows

Install from PyPI from any directory:

```bash
pipx install syseye-agent
```

If `pipx` is not installed yet:

```bash
sudo pacman -S python-pipx
```

Alternative install from GitHub:

```bash
pipx install "git+https://github.com/Unkno394/SysEye.git#subdirectory=cli-agent"
```

Alternative via virtualenv:

```bash
git clone https://github.com/Unkno394/SysEye.git
cd SysEye/cli-agent
python -m venv .venv
source .venv/bin/activate
pip install setuptools wheel requests
pip install --no-build-isolation .
```

Run from any console:

```bash
syseye-agent connect --server http://localhost:5000 --token YOUR_CONNECTION_TOKEN
```

Version check:

```bash
syseye-agent version
```

Linux autostart via systemd user service:

```bash
mkdir -p ~/.config/systemd/user
syseye-agent service linux --server http://localhost:5000 --token YOUR_CONNECTION_TOKEN > ~/.config/systemd/user/syseye-agent.service
systemctl --user daemon-reload
systemctl --user enable --now syseye-agent.service
```

Windows autostart via Task Scheduler:

```powershell
syseye-agent service windows --server http://localhost:5000 --token YOUR_CONNECTION_TOKEN > install-syseye-agent.ps1
powershell -ExecutionPolicy Bypass -File .\install-syseye-agent.ps1
```

PyPI publication notes:
- package metadata lives in [`pyproject.toml`](./pyproject.toml)
- publishing guide lives in [`PUBLISHING.md`](./PUBLISHING.md)
