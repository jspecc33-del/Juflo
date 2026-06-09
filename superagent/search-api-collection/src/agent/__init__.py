"""
AI Search Agent System

Provides intelligent agents for research, conversation, fact-checking,
and news analysis with advanced memory and configuration capabilities.
"""

# Base Components
from .base import BaseAgent, AgentConfig, AgentResponse, QueryType, AgentType

# Intelligence and Analysis
from .intelligence import IntelligenceProcessor, SourceCredibility, SourceAnalysis

# Memory and Context
from .memory import (
    ConversationMemory, 
    UserPreferences, 
    SessionContext,
    ConversationTurn,
    SearchMemory
)

# Configuration System
from .config import (
    AgentConfigurationManager,
    ResponseStyle,
    PersonalityProfile,
    SearchPreferences,
    LearningPreferences
)

# CLI Interface
from .cli import AgentCLI

# Specialized Agents
from .research_agent import ResearchAgent, ResearchSynthesis, ResearchFinding
from .conversational_agent import ConversationalAgent, ConversationResponse, ConversationContext
from .factcheck_agent import FactCheckAgent, ClaimStatus, FactCheckReport, ClaimAnalysis
from .news_agent import NewsAgent, NewsCategory, NewsAnalysis, NewsArticle, TrendingTopic

__version__ = "1.0.0"

__all__ = [
    # Base Components
    "BaseAgent",
    "AgentConfig", 
    "AgentResponse",
    "QueryType",
    "AgentType",
    
    # Intelligence and Analysis
    "IntelligenceProcessor",
    "SourceCredibility",
    "SourceAnalysis",
    
    # Memory and Context
    "ConversationMemory",
    "UserPreferences",
    "SessionContext",
    "ConversationTurn",
    "SearchMemory",
    
    # Configuration System
    "AgentConfigurationManager",
    "ResponseStyle",
    "PersonalityProfile",
    "SearchPreferences",
    "LearningPreferences",
    
    # CLI Interface
    "AgentCLI",
    
    # Specialized Agents
    "ResearchAgent",
    "ResearchSynthesis",
    "ResearchFinding",
    "ConversationalAgent",
    "ConversationResponse",
    "ConversationContext",
    "FactCheckAgent",
    "ClaimStatus",
    "FactCheckReport",
    "ClaimAnalysis",
    "NewsAgent",
    "NewsCategory",
    "NewsAnalysis",
    "NewsArticle",
    "TrendingTopic",
]
