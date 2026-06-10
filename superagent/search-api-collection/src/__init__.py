"""
Search API Collection

A comprehensive library for integrating multiple legitimate search APIs
including Brave Search, SerpAPI, Tavily, and ScraperAPI, with intelligent
AI agents for research, conversation, fact-checking, and news analysis.
"""

from .manager import SearchAPICollection, SearchStrategy, APIProvider
from .base import BaseSearchAPI, SearchResponse, SearchResult, SearchType
from .apis.brave_search import BraveSearchAPI
from .apis.serpapi import SerpAPIIntegration
from .apis.tavily import TavilyAPIIntegration
from .apis.scraperapi import ScraperAPIIntegration

# AI Agent Components
from .agent.base import BaseAgent, AgentConfig, AgentResponse, QueryType, AgentType
from .agent.intelligence import IntelligenceProcessor, SourceCredibility
from .agent.memory import ConversationMemory, UserPreferences, SessionContext
from .agent.config import AgentConfigurationManager, ResponseStyle, PersonalityProfile
from .agent.cli import AgentCLI

# Specialized Agents
from .agent.research_agent import ResearchAgent, ResearchSynthesis
from .agent.conversational_agent import ConversationalAgent, ConversationResponse
from .agent.factcheck_agent import FactCheckAgent, ClaimStatus, FactCheckReport
from .agent.news_agent import NewsAgent, NewsCategory, NewsAnalysis

__version__ = "1.0.0"
__author__ = "Search API Collection"
__email__ = "contact@example.com"

__all__ = [
    # Main classes
    "SearchAPICollection",
    "SearchStrategy",
    "APIProvider",
    
    # Base classes
    "BaseSearchAPI",
    "SearchResponse", 
    "SearchResult",
    "SearchType",
    
    # API implementations
    "BraveSearchAPI",
    "SerpAPIIntegration", 
    "TavilyAPIIntegration",
    "ScraperAPIIntegration",
    
    # AI Agent Base Components
    "BaseAgent",
    "AgentConfig",
    "AgentResponse",
    "QueryType",
    "AgentType",
    
    # Intelligence and Memory
    "IntelligenceProcessor",
    "SourceCredibility",
    "ConversationMemory",
    "UserPreferences",
    "SessionContext",
    
    # Configuration
    "AgentConfigurationManager",
    "ResponseStyle",
    "PersonalityProfile",
    
    # CLI Interface
    "AgentCLI",
    
    # Specialized Agents
    "ResearchAgent",
    "ResearchSynthesis",
    "ConversationalAgent",
    "ConversationResponse",
    "FactCheckAgent",
    "ClaimStatus",
    "FactCheckReport",
    "NewsAgent",
    "NewsCategory",
    "NewsAnalysis",
]
