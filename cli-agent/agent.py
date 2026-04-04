from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from syseye_agent.agent import Agent  # noqa: E402,F401
