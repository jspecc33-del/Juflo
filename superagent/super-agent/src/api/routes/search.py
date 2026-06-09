"""
Search API Routes

Endpoints for Search API Collection integration.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, Any, Optional, List

from ...orchestrator.engine import SuperAgentOrchestrator
from ..deps import get_orchestrator


logger = logging.getLogger(__name__)
router = APIRouter()


class SearchRequest(BaseModel):
    """Search request model"""
    query: str
    strategy: str = "fallback"
    max_results: int = 10


class SemanticSearchRequest(BaseModel):
    """Semantic search request model"""
    query: str
    limit: int = 5


class ConversationalSearchRequest(BaseModel):
    """Conversational search request model"""
    query: str
    session_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


class ResearchSynthesisRequest(BaseModel):
    """Research synthesis request model"""
    topic: str
    depth: str = "standard"
    sources: Optional[List[str]] = None


class FactCheckRequest(BaseModel):
    """Fact check request model"""
    claim: str
    sources: Optional[List[str]] = None


class NewsAnalysisRequest(BaseModel):
    """News analysis request model"""
    query: str
    category: str = "general"
    time_range: str = "24h"


@router.post("/search")
async def search(
    request: SearchRequest,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Perform web search using Search API Collection"""
    try:
        # Check if Search API Collection is available
        search_integration = orchestrator.integrations.get('search_api_collection')
        if not search_integration:
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not available"
            )
        
        if not search_integration.is_available():
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not initialized"
            )
        
        logger.info(f"Performing search: {request.query}")
        
        result = await search_integration.search(
            query=request.query,
            strategy=request.strategy,
            max_results=request.max_results
        )
        
        if result.get("success"):
            return result
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Search failed: {result.get('error', 'Unknown error')}"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in search endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during search"
        )


@router.post("/search/semantic")
async def semantic_search(
    request: SemanticSearchRequest,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Perform semantic search using Skill Layer memory (Chroma/Qwen)"""
    try:
        logger.info(f"Performing semantic search: {request.query}")
        
        # Access the SkillLayer through the orchestrator
        results = await orchestrator.skill_layer.memory.retrieve(
            query=request.query,
            limit=request.limit
        )
        
        return {
            "query": request.query,
            "results": results,
            "success": True
        }
    except Exception as e:
        logger.error(f"Error in semantic search: {e}")
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@router.post("/search/conversational")
async def conversational_search(
    request: ConversationalSearchRequest,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Perform conversational search with memory"""
    try:
        # Check if Search API Collection is available
        search_integration = orchestrator.integrations.get('search_api_collection')
        if not search_integration:
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not available"
            )
        
        if not search_integration.is_available():
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not initialized"
            )
        
        logger.info(f"Performing conversational search: {request.query}")
        
        result = await search_integration.conversational_search(
            query=request.query,
            session_id=request.session_id,
            context=request.context
        )
        
        if result.get("success"):
            return result
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Conversational search failed: {result.get('error', 'Unknown error')}"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in conversational search endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during conversational search"
        )


@router.post("/search/research")
async def research_synthesis(
    request: ResearchSynthesisRequest,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Perform research synthesis on a topic"""
    try:
        # Check if Search API Collection is available
        search_integration = orchestrator.integrations.get('search_api_collection')
        if not search_integration:
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not available"
            )
        
        if not search_integration.is_available():
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not initialized"
            )
        
        logger.info(f"Performing research synthesis: {request.topic}")
        
        result = await search_integration.research_synthesis(
            topic=request.topic,
            depth=request.depth,
            sources=request.sources
        )
        
        if result.get("success"):
            return result
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Research synthesis failed: {result.get('error', 'Unknown error')}"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in research synthesis endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during research synthesis"
        )


@router.post("/search/factcheck")
async def fact_check(
    request: FactCheckRequest,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Fact check a claim"""
    try:
        # Check if Search API Collection is available
        search_integration = orchestrator.integrations.get('search_api_collection')
        if not search_integration:
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not available"
            )
        
        if not search_integration.is_available():
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not initialized"
            )
        
        logger.info(f"Fact checking claim: {request.claim}")
        
        result = await search_integration.fact_check(
            claim=request.claim,
            sources=request.sources
        )
        
        if result.get("success"):
            return result
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Fact check failed: {result.get('error', 'Unknown error')}"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in fact check endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during fact check"
        )


@router.post("/search/news")
async def news_analysis(
    request: NewsAnalysisRequest,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Analyze news on a topic"""
    try:
        # Check if Search API Collection is available
        search_integration = orchestrator.integrations.get('search_api_collection')
        if not search_integration:
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not available"
            )
        
        if not search_integration.is_available():
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not initialized"
            )
        
        logger.info(f"Analyzing news: {request.query}")
        
        result = await search_integration.news_analysis(
            query=request.query,
            category=request.category,
            time_range=request.time_range
        )
        
        if result.get("success"):
            return result
        else:
            raise HTTPException(
                status_code=500,
                detail=f"News analysis failed: {result.get('error', 'Unknown error')}"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in news analysis endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during news analysis"
        )


@router.get("/search/statistics")
async def get_search_statistics(
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Get search statistics and performance metrics"""
    try:
        # Check if Search API Collection is available
        search_integration = orchestrator.integrations.get('search_api_collection')
        if not search_integration:
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not available"
            )
        
        if not search_integration.is_available():
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not initialized"
            )
        
        result = await search_integration.get_search_statistics()
        
        if result.get("success"):
            return result
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to get search statistics: {result.get('error', 'Unknown error')}"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting search statistics: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error while getting statistics"
        )


@router.get("/search/agents")
async def get_available_agents(
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Get list of available search agents"""
    try:
        # Check if Search API Collection is available
        search_integration = orchestrator.integrations.get('search_api_collection')
        if not search_integration:
            return {
                "available": False,
                "agents": [],
                "message": "Search API Collection not available"
            }
        
        if not search_integration.is_available():
            return {
                "available": False,
                "agents": [],
                "message": "Search API Collection not initialized"
            }
        
        agents = search_integration.get_available_agents()
        
        return {
            "available": True,
            "agents": agents,
            "total_agents": len(agents),
            "message": "Search API Collection is operational"
        }
    
    except Exception as e:
        logger.error(f"Error getting available agents: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error while getting agents"
        )


@router.post("/search/configure/{agent_type}")
async def configure_agent(
    agent_type: str,
    config: Dict[str, Any],
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Configure a specific search agent"""
    try:
        # Check if Search API Collection is available
        search_integration = orchestrator.integrations.get('search_api_collection')
        if not search_integration:
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not available"
            )
        
        if not search_integration.is_available():
            raise HTTPException(
                status_code=503,
                detail="Search API Collection not initialized"
            )
        
        logger.info(f"Configuring {agent_type} agent")
        
        success = await search_integration.configure_agent(agent_type, config)
        
        if success:
            return {
                "message": f"Successfully configured {agent_type} agent",
                "agent_type": agent_type,
                "configuration": config
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to configure {agent_type} agent"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error configuring {agent_type} agent: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during agent configuration"
        )
