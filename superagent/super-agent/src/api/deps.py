"""
FastAPI dependency providers — avoids circular imports with main.py.
"""

from fastapi import Request
from ..orchestrator.engine import SuperAgentOrchestrator


def get_orchestrator(request: Request) -> SuperAgentOrchestrator:
    """Return the orchestrator instance stored on app state during lifespan startup."""
    return request.app.state.orchestrator
