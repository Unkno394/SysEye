from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from syseye_agent.executor import CommandExecutor  # noqa: E402,F401
