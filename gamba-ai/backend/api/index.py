import os
import sys
from pathlib import Path

# Add the parent directory of this file to sys.path to ensure blueprawn_ai_sim can be imported on Vercel
sys.path.append(str(Path(__file__).parent.parent))

from blueprawn_ai_sim.app import app
