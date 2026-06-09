"""
Base Agent Class for AI Search Agent System

Provides the foundation for all specialized agents with search capabilities,
result processing, and basic intelligence features.
"""

import asyncio
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass
from enum import Enum
import time
import re

from ..manager import SearchAPICollection, SearchStrategy
from ..base import SearchResponse, SearchResult, SearchType


class AgentType(Enum):
    BASE = "base"
    RESEARCH = "research"
    CONVERSATIONAL = "conversational"
    FACT_CHECK = "fact_check"
    NEWS = "news"


class QueryType(Enum):
    GENERAL = "general"
    RESEARCH = "research"
    NEWS = "news"
    FACT_CHECK = "fact_check"
    DEFINITION = "definition"
    COMPARISON = "comparison"
    HOW_TO = "how_to"
    CURRENT_EVENTS = "current_events"


@dataclass
class AgentResponse:
    """Structured response from agent"""
    query: str
    answer: str
    sources: List[SearchResult]
    confidence: float
    query_type: QueryType
    processing_time: float
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class AgentConfig:
    """Configuration for agent behavior"""
    agent_type: AgentType
    personality: str = "helpful"
    response_style: str = "detailed"  # "concise", "detailed", "academic"
    max_results: int = 10
    search_strategy: str = "parallel"
    include_sources: bool = True
    confidence_threshold: float = 0.7
    timeout: int = 30
    custom_instructions: Optional[str] = None


class BaseAgent(ABC):
    """Base class for all AI search agents"""
    
    def __init__(self, search_config: Dict[str, Any], agent_config: AgentConfig):
        self.search_config = search_config
        self.agent_config = agent_config
        self.search_collection: Optional[SearchAPICollection] = None
        self.query_history: List[str] = []
        self.response_history: List[AgentResponse] = []
        
    async def initialize(self):
        """Initialize the search collection"""
        self.search_collection = SearchAPICollection(self.search_config)
        
    async def close(self):
        """Close the search collection"""
        if self.search_collection:
            await self.search_collection.close_all()
    
    async def __aenter__(self):
        await self.initialize()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def process_query(self, query: str, **kwargs) -> AgentResponse:
        """Main method to process user queries"""
        start_time = time.time()
        
        # Add to query history
        self.query_history.append(query)
        
        # Analyze query type
        query_type = self._classify_query(query)
        
        # Optimize query based on type and agent
        optimized_query = self._optimize_query(query, query_type)
        
        # Determine search strategy
        search_strategy = self._select_search_strategy(query_type, kwargs)
        
        # Perform search
        search_results = await self._perform_search(
            optimized_query, 
            query_type, 
            search_strategy, 
            **kwargs
        )
        
        # Process and synthesize results
        answer, confidence = await self._synthesize_answer(
            query, 
            search_results, 
            query_type
        )
        
        processing_time = time.time() - start_time
        
        # Create response
        response = AgentResponse(
            query=query,
            answer=answer,
            sources=search_results.results[:self.agent_config.max_results],
            confidence=confidence,
            query_type=query_type,
            processing_time=processing_time,
            metadata={
                "optimized_query": optimized_query,
                "search_strategy": search_strategy,
                "total_results": len(search_results.results),
                "search_time": search_results.search_time
            }
        )
        
        # Add to response history
        self.response_history.append(response)
        
        return response
    
    def _classify_query(self, query: str) -> QueryType:
        """Classify the type of query to determine processing approach"""
        query_lower = query.lower()
        
        # Research indicators
        research_keywords = [
            "research", "study", "analysis", "investigate", "examine",
            "academic", "scholarly", "paper", "journal", "scientific"
        ]
        if any(keyword in query_lower for keyword in research_keywords):
            return QueryType.RESEARCH
        
        # News/current events indicators
        news_keywords = [
            "news", "latest", "recent", "today", "yesterday", "breaking",
            "current events", "happening now", "this week"
        ]
        if any(keyword in query_lower for keyword in news_keywords):
            return QueryType.CURRENT_EVENTS
        
        # Fact-checking indicators
        fact_check_keywords = [
            "true", "false", "fact check", "verify", "accurate", "correct",
            "myth", "debunk", "claim", "assertion"
        ]
        if any(keyword in query_lower for keyword in fact_check_keywords):
            return QueryType.FACT_CHECK
        
        # Definition indicators
        definition_patterns = [
            r"what is", r"define", r"meaning of", r"explain",
            r"what does.*mean", r"definition"
        ]
        if any(re.search(pattern, query_lower) for pattern in definition_patterns):
            return QueryType.DEFINITION
        
        # Comparison indicators
        comparison_keywords = [
            "vs", "versus", "compare", "difference", "better than",
            "pros and cons", "advantages", "disadvantages"
        ]
        if any(keyword in query_lower for keyword in comparison_keywords):
            return QueryType.COMPARISON
        
        # How-to indicators
        how_to_patterns = [
            r"how to", r"how do i", r"steps to", r"guide", r"tutorial"
        ]
        if any(re.search(pattern, query_lower) for pattern in how_to_patterns):
            return QueryType.HOW_TO
        
        return QueryType.GENERAL
    
    def _optimize_query(self, query: str, query_type: QueryType) -> str:
        """Optimize query based on type and agent configuration"""
        optimized = query.strip()
        
        # Remove unnecessary words
        filler_words = ["please", "could you", "can you", "i would like to"]
        for filler in filler_words:
            optimized = optimized.replace(filler, "").strip()
        
        # Type-specific optimizations
        if query_type == QueryType.RESEARCH:
            # Add academic context if not present
            academic_terms = ["research", "study", "analysis"]
            if not any(term in optimized.lower() for term in academic_terms):
                optimized += " research study"
        
        elif query_type == QueryType.CURRENT_EVENTS:
            # Add time context
            if "2024" not in optimized and "2023" not in optimized:
                optimized += " 2024"
        
        elif query_type == QueryType.FACT_CHECK:
            # Ensure fact-checking context
            if "fact check" not in optimized.lower():
                optimized = f"fact check {optimized}"
        
        return optimized
    
    def _select_search_strategy(self, query_type: QueryType, kwargs: Dict) -> str:
        """Select appropriate search strategy based on query type"""
        # Override with explicit strategy if provided
        if "search_strategy" in kwargs:
            return kwargs["search_strategy"]
        
        # Agent-specific strategy
        if hasattr(self.agent_config, 'search_strategy'):
            return self.agent_config.search_strategy
        
        # Type-based strategy selection
        strategy_map = {
            QueryType.RESEARCH: "parallel",
            QueryType.FACT_CHECK: "parallel",
            QueryType.CURRENT_EVENTS: "parallel",
            QueryType.NEWS: "parallel",
            QueryType.GENERAL: "fallback",
            QueryType.DEFINITION: "primary",
            QueryType.COMPARISON: "parallel",
            QueryType.HOW_TO: "fallback"
        }
        
        return strategy_map.get(query_type, "fallback")
    
    async def _perform_search(
        self, 
        query: str, 
        query_type: QueryType, 
        strategy: str, 
        **kwargs
    ) -> SearchResponse:
        """Perform search using the appropriate strategy and parameters"""
        if not self.search_collection:
            raise RuntimeError("Agent not initialized. Call await initialize() first.")
        
        # Determine search type
        search_type = self._get_search_type(query_type, kwargs)
        
        # Configure search parameters
        search_params = {
            "num_results": kwargs.get("num_results", self.agent_config.max_results),
            **kwargs
        }
        
        # Temporarily update strategy if needed
        original_strategy = self.search_collection.strategy
        self.search_collection.strategy = SearchStrategy(strategy)
        
        try:
            results = await self.search_collection.search(
                query=query,
                search_type=search_type,
                **search_params
            )
            return results
        finally:
            # Restore original strategy
            self.search_collection.strategy = original_strategy
    
    def _get_search_type(self, query_type: QueryType, kwargs: Dict) -> SearchType:
        """Determine the appropriate search type"""
        # Override with explicit search type if provided
        if "search_type" in kwargs:
            return SearchType(kwargs["search_type"])
        
        # Type-based search type selection
        type_map = {
            QueryType.NEWS: SearchType.NEWS,
            QueryType.CURRENT_EVENTS: SearchType.NEWS,
        }
        
        return type_map.get(query_type, SearchType.WEB)
    
    @abstractmethod
    async def _synthesize_answer(
        self, 
        query: str, 
        search_results: SearchResponse, 
        query_type: QueryType
    ) -> tuple[str, float]:
        """Synthesize answer from search results - must be implemented by subclasses"""
        pass
    
    def get_query_history(self) -> List[str]:
        """Get the history of queries processed"""
        return self.query_history.copy()
    
    def get_response_history(self) -> List[AgentResponse]:
        """Get the history of responses generated"""
        return self.response_history.copy()
    
    def clear_history(self):
        """Clear query and response history"""
        self.query_history.clear()
        self.response_history.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get agent statistics"""
        if not self.response_history:
            return {
                "total_queries": 0,
                "avg_processing_time": 0,
                "avg_confidence": 0,
                "query_types": {}
            }
        
        total_queries = len(self.response_history)
        avg_processing_time = sum(r.processing_time for r in self.response_history) / total_queries
        avg_confidence = sum(r.confidence for r in self.response_history) / total_queries
        
        # Count query types
        query_types = {}
        for response in self.response_history:
            qtype = response.query_type.value
            query_types[qtype] = query_types.get(qtype, 0) + 1
        
        return {
            "total_queries": total_queries,
            "avg_processing_time": avg_processing_time,
            "avg_confidence": avg_confidence,
            "query_types": query_types
        }
