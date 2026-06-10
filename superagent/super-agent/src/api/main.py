"""
Main FastAPI Application

Entry point for the Super-Agent REST API.
"""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ..orchestrator.engine import SuperAgentOrchestrator
from .routes import chat_router, tasks_router, health_router, search_router
from .middleware.auth import AuthMiddleware
from .middleware.logging import LoggingMiddleware

# LlamaIndex Instrumentation
from llama_index.core.instrumentation import get_dispatcher
from llama_index.core.instrumentation.span_handlers import SimpleSpanHandler

dispatcher = get_dispatcher("super-agent")
dispatcher.add_span_handler(SimpleSpanHandler())



# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global orchestrator instance
orchestrator = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    global orchestrator
    
    # Startup
    logger.info("Starting Super-Agent API with LlamaIndex Instrumentation...")
    
    # Configuration loaded from environment variables
    config = {
        "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
        "scraperapi_key": os.getenv("SCRAPERAPI_KEY", ""),
        "apify_token": os.getenv("APIFY_TOKEN", ""),
        "filesystem": {"base_url": os.getenv("MCP_FILESYSTEM_URL", "http://localhost:3000")},
        "playwright": {"base_url": os.getenv("MCP_PLAYWRIGHT_URL", "http://localhost:3001")},
        "memory": {"base_url": os.getenv("MCP_MEMORY_URL", "http://localhost:3002")},
        "postman": {
            "base_url": os.getenv("MCP_POSTMAN_URL", "http://localhost:3003"),
            "api_key": os.getenv("POSTMAN_API_KEY", ""),
        },
        "snyk": {
            "base_url": os.getenv("MCP_SNYK_URL", "http://localhost:3004"),
            "api_token": os.getenv("SNYK_TOKEN", ""),
        },
        "terraform": {
            "base_url": os.getenv("MCP_TERRAFORM_URL", "http://localhost:3005"),
            "workspace_path": os.getenv("TERRAFORM_WORKSPACE", "./terraform_workspace"),
        },
    }
    
    # Initialize orchestrator
    orchestrator = SuperAgentOrchestrator(config)
    await orchestrator.initialize()
    
    # Store in app state
    app.state.orchestrator = orchestrator
    
    logger.info("Super-Agent API started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Super-Agent API...")
    if orchestrator:
        await orchestrator.shutdown()
    
    logger.info("Super-Agent API shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="Super-Agent API",
    description="Unified AI agent orchestrator for MCP servers and external integrations",
    version="1.0.0",
    lifespan=lifespan
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(LoggingMiddleware)
app.add_middleware(AuthMiddleware)

# Include routers
app.include_router(health_router, prefix="/api/v1", tags=["Health"])
app.include_router(chat_router, prefix="/api/v1", tags=["Chat"])
app.include_router(tasks_router, prefix="/api/v1", tags=["Tasks"])
app.include_router(search_router, prefix="/api/v1", tags=["Search"])


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc) if len(str(exc)) < 100 else "An error occurred"
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """HTTP exception handler"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code
        }
    )


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Super-Agent API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/api/v1/health",
            "chat": "/api/v1/chat",
            "tasks": "/api/v1/tasks",
            "docs": "/docs"
        }
    }


@app.get("/info")
async def info():
    """Application information"""
    return {
        "name": "Super-Agent",
        "description": "Unified AI agent orchestrator for MCP servers and external integrations",
        "version": "1.0.0",
        "features": [
            "Natural language task routing",
            "MCP server integration",
            "External service integrations",
            "Memory management",
            "Task orchestration"
        ],
        "mcp_servers": [
            "filesystem",
            "playwright",
            "puppeteer",
            "memory",
            "postman",
            "snyk",
            "terraform"
        ],
        "integrations": [
            "ScraperAPI",
            "Apify",
            "Anthropic AI"
        ]
    }


def get_orchestrator():
    """Get orchestrator from app state"""
    return app.state.orchestrator


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "src.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
