"""Convenience launcher for NEXGI SigLIP 2 Backend Server."""
import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))

from app import main

if __name__ == "__main__":
    main()
