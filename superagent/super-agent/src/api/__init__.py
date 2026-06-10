"""
API Layer

REST API endpoints and middleware for the Super-Agent system.
"""

from .main import app
from .routes.chat import router as chat_router
from .routes.tasks import router as tasks_router
from .routes.health import router as health_router
from .routes.search import router as search_router

__all__ = [
    "app",
    "chat_router",
    "tasks_router", 
    "health_router",
    "search_router"
]
