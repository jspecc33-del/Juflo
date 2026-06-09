"""
Search API Collection Integration

Integration with the existing Search API Collection library
to provide unified search capabilities across multiple providers.
"""

import sys
import os
import logging
from typing import Dict, List, Any, Optional
import asyncio

# Add the search-api-collection to the path
search_api_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "search-api-collection", "src")
if search_api_path not in sys.path:
    sys.path.append(search_api_path)

try:
    from manager import SearchAPICollection, SearchStrategy, APIProvider
    from agent.conversational_agent import ConversationalAgent, ConversationResponse
    from agent.research_agent import ResearchAgent, ResearchSynthesis
    from agent.factcheck_agent import FactCheckAgent, FactCheckReport
    from agent.news_agent import NewsAgent, NewsAnalysis
    from agent.config import AgentConfigurationManager, ResponseStyle, PersonalityProfile
    SEARCH_API_AVAILABLE = True
except ImportError as e:
    logging.warning(f"Search API Collection not available: {e}")
    SEARCH_API_AVAILABLE = False


class SearchAPIIntegration:
    """Integration with Search API Collection"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.search_collection = None
        self.conversational_agent = None
        self.research_agent = None
        self.factcheck_agent = None
        self.news_agent = None
        self.initialized = False
    
    async def initialize(self):
        """Initialize the Search API Collection integration"""
        if not SEARCH_API_AVAILABLE:
            self.logger.warning("Search API Collection not available, skipping initialization")
            return False
        
        try:
            # Initialize search collection
            self.search_collection = SearchAPICollection(
                brave_api_key=self.config.get("brave_api_key"),
                serpapi_key=self.config.get("serpapi_key"),
                tavily_api_key=self.config.get("tavily_api_key"),
                scraperapi_key=self.config.get("scraperapi_key"),
                default_strategy=SearchStrategy.FALLBACK
            )
            
            # Initialize agents
            agent_config = AgentConfigurationManager()
            
            self.conversational_agent = ConversationalAgent(
                config=agent_config.get_agent_config("conversational"),
                search_collection=self.search_collection
            )
            
            self.research_agent = ResearchAgent(
                config=agent_config.get_agent_config("research"),
                search_collection=self.search_collection
            )
            
            self.factcheck_agent = FactCheckAgent(
                config=agent_config.get_agent_config("factcheck"),
                search_collection=self.search_collection
            )
            
            self.news_agent = NewsAgent(
                config=agent_config.get_agent_config("news"),
                search_collection=self.search_collection
            )
            
            self.initialized = True
            self.logger.info("Search API Collection integration initialized successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to initialize Search API Collection: {e}")
            return False
    
    async def search(self, query: str, strategy: str = "fallback", 
                    max_results: int = 10) -> Dict[str, Any]:
        """Perform search using the Search API Collection"""
        if not self.initialized:
            return {"error": "Search API Collection not initialized"}
        
        try:
            # Convert strategy string to enum
            strategy_map = {
                "brave": SearchStrategy.BRAVE_FIRST,
                "serpapi": SearchStrategy.SERPAPI_FIRST,
                "tavily": SearchStrategy.TAVILY_FIRST,
                "scraperapi": SearchStrategy.SCRAPERAPI_FIRST,
                "fallback": SearchStrategy.FALLBACK,
                "quality": SearchStrategy.QUALITY_FIRST,
                "speed": SearchStrategy.SPEED_FIRST
            }
            
            search_strategy = strategy_map.get(strategy.lower(), SearchStrategy.FALLBACK)
            
            # Perform search
            response = await self.search_collection.search(
                query=query,
                strategy=search_strategy,
                max_results=max_results
            )
            
            return {
                "success": True,
                "query": query,
                "strategy": strategy,
                "results": [result.__dict__ for result in response.results],
                "total_results": len(response.results),
                "response_time": getattr(response, 'response_time', 0),
                "api_used": getattr(response, 'api_used', 'unknown')
            }
            
        except Exception as e:
            self.logger.error(f"Search failed: {e}")
            return {"error": str(e), "success": False}
    
    async def conversational_search(self, query: str, session_id: str = None,
                                  context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Perform conversational search with memory"""
        if not self.initialized:
            return {"error": "Search API Collection not initialized"}
        
        try:
            # Create session context if provided
            session_context = None
            if session_id or context:
                from agent.memory import SessionContext
                session_context = SessionContext(
                    session_id=session_id or "default",
                    user_context=context or {}
                )
            
            # Perform conversational search
            response = await self.conversational_agent.conversational_search(
                query=query,
                session_context=session_context
            )
            
            return {
                "success": True,
                "query": query,
                "response": response.agent_response.__dict__,
                "conversational_elements": response.conversational_elements,
                "follow_up_questions": response.follow_up_questions,
                "personalization_level": response.personalization_level,
                "session_id": session_id
            }
            
        except Exception as e:
            self.logger.error(f"Conversational search failed: {e}")
            return {"error": str(e), "success": False}
    
    async def research_synthesis(self, topic: str, depth: str = "standard",
                              sources: List[str] = None) -> Dict[str, Any]:
        """Perform research synthesis on a topic"""
        if not self.initialized:
            return {"error": "Search API Collection not initialized"}
        
        try:
            # Map depth to research configuration
            depth_map = {
                "quick": {"max_sources": 3, "max_depth": 1},
                "standard": {"max_sources": 5, "max_depth": 2},
                "comprehensive": {"max_sources": 10, "max_depth": 3}
            }
            
            research_config = depth_map.get(depth.lower(), depth_map["standard"])
            
            # Perform research synthesis
            synthesis = await self.research_agent.research_synthesis(
                topic=topic,
                max_sources=research_config["max_sources"],
                max_depth=research_config["max_depth"],
                preferred_sources=sources
            )
            
            return {
                "success": True,
                "topic": topic,
                "depth": depth,
                "synthesis": synthesis.__dict__,
                "sources_used": len(synthesis.sources) if hasattr(synthesis, 'sources') else 0,
                "confidence_score": getattr(synthesis, 'confidence_score', 0.0)
            }
            
        except Exception as e:
            self.logger.error(f"Research synthesis failed: {e}")
            return {"error": str(e), "success": False}
    
    async def fact_check(self, claim: str, sources: List[str] = None) -> Dict[str, Any]:
        """Fact check a claim"""
        if not self.initialized:
            return {"error": "Search API Collection not initialized"}
        
        try:
            # Perform fact check
            report = await self.factcheck_agent.fact_check_claim(
                claim=claim,
                additional_sources=sources
            )
            
            return {
                "success": True,
                "claim": claim,
                "status": report.claim_status.value,
                "confidence": report.confidence_score,
                "evidence": [e.__dict__ for e in report.evidence] if hasattr(report, 'evidence') else [],
                "sources": [s.__dict__ for s in report.sources] if hasattr(report, 'sources') else [],
                "explanation": report.explanation
            }
            
        except Exception as e:
            self.logger.error(f"Fact check failed: {e}")
            return {"error": str(e), "success": False}
    
    async def news_analysis(self, query: str, category: str = "general",
                          time_range: str = "24h") -> Dict[str, Any]:
        """Analyze news on a topic"""
        if not self.initialized:
            return {"error": "Search API Collection not initialized"}
        
        try:
            # Map category
            from agent.news_agent import NewsCategory
            category_map = {
                "general": NewsCategory.GENERAL,
                "politics": NewsCategory.POLITICS,
                "technology": NewsCategory.TECHNOLOGY,
                "business": NewsCategory.BUSINESS,
                "science": NewsCategory.SCIENCE,
                "health": NewsCategory.HEALTH,
                "sports": NewsCategory.SPORTS,
                "entertainment": NewsCategory.ENTERTAINMENT
            }
            
            news_category = category_map.get(category.lower(), NewsCategory.GENERAL)
            
            # Perform news analysis
            analysis = await self.news_agent.analyze_news(
                query=query,
                category=news_category,
                time_range=time_range
            )
            
            return {
                "success": True,
                "query": query,
                "category": category,
                "time_range": time_range,
                "analysis": analysis.__dict__,
                "article_count": len(analysis.articles) if hasattr(analysis, 'articles') else 0,
                "sentiment": getattr(analysis, 'overall_sentiment', 'neutral')
            }
            
        except Exception as e:
            self.logger.error(f"News analysis failed: {e}")
            return {"error": str(e), "success": False}
    
    async def get_search_statistics(self) -> Dict[str, Any]:
        """Get search statistics and performance metrics"""
        if not self.initialized:
            return {"error": "Search API Collection not initialized"}
        
        try:
            # Get statistics from search collection
            stats = self.search_collection.get_statistics()
            
            return {
                "success": True,
                "statistics": stats.__dict__ if hasattr(stats, '__dict__') else stats,
                "available_apis": self.search_collection.get_available_apis(),
                "default_strategy": self.search_collection.default_strategy.value
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get search statistics: {e}")
            return {"error": str(e), "success": False}
    
    async def configure_agent(self, agent_type: str, config: Dict[str, Any]) -> bool:
        """Configure a specific agent"""
        if not self.initialized:
            return False
        
        try:
            agent_map = {
                "conversational": self.conversational_agent,
                "research": self.research_agent,
                "factcheck": self.factcheck_agent,
                "news": self.news_agent
            }
            
            agent = agent_map.get(agent_type.lower())
            if not agent:
                self.logger.error(f"Unknown agent type: {agent_type}")
                return False
            
            # Apply configuration (simplified)
            for key, value in config.items():
                if hasattr(agent, key):
                    setattr(agent, key, value)
            
            self.logger.info(f"Configured {agent_type} agent successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to configure {agent_type} agent: {e}")
            return False
    
    def is_available(self) -> bool:
        """Check if Search API Collection is available"""
        return SEARCH_API_AVAILABLE and self.initialized
    
    def get_available_agents(self) -> List[str]:
        """Get list of available agents"""
        if not self.initialized:
            return []
        
        agents = []
        if self.conversational_agent:
            agents.append("conversational")
        if self.research_agent:
            agents.append("research")
        if self.factcheck_agent:
            agents.append("factcheck")
        if self.news_agent:
            agents.append("news")
        
        return agents
