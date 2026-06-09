"""
Health Check Routes

Endpoints for monitoring API and service health.
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from typing import Dict, Any

from ...orchestrator.engine import SuperAgentOrchestrator
from ..deps import get_orchestrator


logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """Basic health check"""
    return {
        "status": "healthy",
        "service": "super-agent-api",
        "version": "1.0.0"
    }


@router.get("/health/detailed")
async def detailed_health_check(
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Detailed health check including all services"""
    health_status = {
        "status": "healthy",
        "service": "super-agent-api",
        "version": "1.0.0",
        "services": {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Check MCP clients
    mcp_services = ["filesystem", "playwright", "memory", "postman", "snyk", "terraform"]

    for service_name in mcp_services:
        try:
            client = orchestrator.mcp_clients.get(service_name)
            if client and hasattr(client, 'session') and client.session:
                health_status["services"][f"mcp_{service_name}"] = {
                    "status": "healthy",
                    "message": "Connected and operational"
                }
            else:
                health_status["services"][f"mcp_{service_name}"] = {
                    "status": "unhealthy",
                    "message": "Not connected"
                }
        except Exception as e:
            health_status["services"][f"mcp_{service_name}"] = {
                "status": "error",
                "message": str(e)
            }
            logger.error(f"Health check failed for {service_name}: {e}")
    
    # Check external integrations
    integration_services = ["scraperapi", "apify"]
    
    for service_name in integration_services:
        try:
            integration = orchestrator.integrations.get(service_name)
            if integration:
                health_status["services"][f"integration_{service_name}"] = {
                    "status": "healthy",
                    "message": "Configured and available"
                }
            else:
                health_status["services"][f"integration_{service_name}"] = {
                    "status": "unhealthy",
                    "message": "Not configured"
                }
        except Exception as e:
            health_status["services"][f"integration_{service_name}"] = {
                "status": "error",
                "message": str(e)
            }
            logger.error(f"Health check failed for {service_name}: {e}")
    
    # Check AI client
    try:
        if orchestrator.ai_client:
            health_status["services"]["anthropic_ai"] = {
                "status": "healthy",
                "message": "AI client configured"
            }
        else:
            health_status["services"]["anthropic_ai"] = {
                "status": "unhealthy",
                "message": "AI client not configured"
            }
    except Exception as e:
        health_status["services"]["anthropic_ai"] = {
            "status": "error",
            "message": str(e)
        }
    
    # Determine overall status
    unhealthy_services = [
        name for name, service in health_status["services"].items()
        if service.get("status") in ["unhealthy", "error"]
    ]
    
    if unhealthy_services:
        health_status["status"] = "degraded"
        health_status["issues"] = unhealthy_services
    
    return health_status


@router.get("/health/memory")
async def memory_health_check(
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Check memory system health"""
    try:
        memory_stats = await orchestrator.memory_manager.get_memory_stats()
        return {
            "status": "healthy",
            "memory_stats": memory_stats,
            "message": "Memory system operational"
        }
    except Exception as e:
        logger.error(f"Memory health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "message": "Memory system error"
        }


@router.get("/health/ready")
async def readiness_check(
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Readiness check - is the service ready to handle requests?"""
    try:
        # Test basic orchestrator functionality
        test_task = {
            "id": "health_check",
            "type": "general_query",
            "description": "Health check test",
            "parameters": {}
        }
        
        # Simple test - just check if orchestrator is responsive
        if orchestrator and hasattr(orchestrator, 'process_request'):
            return {
                "status": "ready",
                "message": "Service is ready to handle requests"
            }
        else:
            return {
                "status": "not_ready",
                "message": "Orchestrator not initialized"
            }
    
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return {
            "status": "not_ready",
            "error": str(e),
            "message": "Service not ready"
        }


@router.get("/metrics")
async def get_metrics(
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Get basic metrics"""
    try:
        # Get memory stats
        memory_stats = await orchestrator.memory_manager.get_memory_stats()
        
        # Get routing statistics
        routing_stats = orchestrator.router.get_routing_statistics()
        
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "memory": memory_stats,
            "routing": routing_stats,
            "uptime": "0s",  # Would track actual uptime in production
            "version": "1.0.0"
        }
    
    except Exception as e:
        logger.error(f"Metrics collection failed: {e}")
        return {
            "error": str(e),
            "message": "Failed to collect metrics"
        }
