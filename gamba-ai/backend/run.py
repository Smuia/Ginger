# ──────────────────────────────────────────────────────────────────────────────
# blueprawn_ai_sim — Runner
# ──────────────────────────────────────────────────────────────────────────────
"""
Entry point for running the FastAPI server via `python run.py`.
Equivalent to: uvicorn blueprawn_ai_sim.app:app --host 0.0.0.0 --port 8000 --reload
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "blueprawn_ai_sim.app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["blueprawn_ai_sim"],
        log_level="info",
    )
