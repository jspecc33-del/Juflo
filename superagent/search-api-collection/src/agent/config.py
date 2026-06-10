"""
Agent Configuration System

Provides configuration management for AI agents including personalities,
search preferences, and behavioral settings.
"""

import json
import os
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass, asdict
from enum import Enum
from pathlib import Path

from .base import AgentType, AgentConfig


class ResponseStyle(Enum):
    CONCISE = "concise"
    DETAILED = "detailed"
    ACADEMIC = "academic"
    CONVERSATIONAL = "conversational"


class SearchStrategy(Enum):
    PRIMARY = "primary"
    FALLBACK = "fallback"
    PARALLEL = "parallel"
    ROUND_ROBIN = "round_robin"


@dataclass
class PersonalityProfile:
    """Personality profile for agent behavior"""
    name: str
    description: str
    tone: str  # "formal", "casual", "friendly", "professional"
    response_style: ResponseStyle
    verbosity: float  # 0.0 (concise) to 1.0 (verbose)
    helpfulness: float  # 0.0 to 1.0
    creativity: float  # 0.0 to 1.0
    formality: float  # 0.0 to 1.0


@dataclass
class SearchPreferences:
    """Search-related preferences"""
    preferred_strategy: SearchStrategy
    max_results: int
    include_sources: bool
    confidence_threshold: float
    timeout: int
    preferred_domains: List[str]
    excluded_domains: List[str]
    language: str
    region: str


@dataclass
class LearningPreferences:
    """Learning and adaptation preferences"""
    enable_learning: bool
    save_conversations: bool
    adapt_response_style: bool
    learn_user_preferences: bool
    feedback_weight: float  # How much to weight user feedback


class AgentConfigurationManager:
    """Manages agent configurations and personalities"""
    
    def __init__(self, config_dir: Optional[str] = None):
        self.config_dir = Path(config_dir) if config_dir else Path.home() / ".search_agent"
        self.config_dir.mkdir(exist_ok=True)
        
        self.personalities = self._load_personalities()
        self.default_configs = self._create_default_configs()
        
    def _load_personalities(self) -> Dict[str, PersonalityProfile]:
        """Load predefined personality profiles"""
        return {
            "researcher": PersonalityProfile(
                name="Researcher",
                description="Academic and thorough, focuses on comprehensive analysis",
                tone="formal",
                response_style=ResponseStyle.ACADEMIC,
                verbosity=0.8,
                helpfulness=0.9,
                creativity=0.3,
                formality=0.9
            ),
            "assistant": PersonalityProfile(
                name="Assistant",
                description="Helpful and friendly, provides clear and practical answers",
                tone="casual",
                response_style=ResponseStyle.DETAILED,
                verbosity=0.6,
                helpfulness=0.9,
                creativity=0.5,
                formality=0.4
            ),
            "expert": PersonalityProfile(
                name="Expert",
                description="Professional and authoritative, provides expert insights",
                tone="professional",
                response_style=ResponseStyle.DETAILED,
                verbosity=0.7,
                helpfulness=0.8,
                creativity=0.4,
                formality=0.8
            ),
            "concise": PersonalityProfile(
                name="Concise",
                description="Brief and to the point, focuses on essential information",
                tone="formal",
                response_style=ResponseStyle.CONCISE,
                verbosity=0.2,
                helpfulness=0.7,
                creativity=0.2,
                formality=0.6
            ),
            "creative": PersonalityProfile(
                name="Creative",
                description="Innovative and imaginative, provides creative perspectives",
                tone="casual",
                response_style=ResponseStyle.CONVERSATIONAL,
                verbosity=0.8,
                helpfulness=0.8,
                creativity=0.9,
                formality=0.3
            )
        }
    
    def _create_default_configs(self) -> Dict[AgentType, Dict[str, Any]]:
        """Create default configurations for each agent type"""
        return {
            AgentType.BASE: {
                "personality": "assistant",
                "search": {
                    "preferred_strategy": SearchStrategy.FALLBACK,
                    "max_results": 10,
                    "include_sources": True,
                    "confidence_threshold": 0.7,
                    "timeout": 30,
                    "preferred_domains": [],
                    "excluded_domains": [],
                    "language": "en",
                    "region": "us"
                },
                "learning": {
                    "enable_learning": True,
                    "save_conversations": True,
                    "adapt_response_style": True,
                    "learn_user_preferences": True,
                    "feedback_weight": 0.5
                }
            },
            AgentType.RESEARCH: {
                "personality": "researcher",
                "search": {
                    "preferred_strategy": SearchStrategy.PARALLEL,
                    "max_results": 15,
                    "include_sources": True,
                    "confidence_threshold": 0.8,
                    "timeout": 45,
                    "preferred_domains": ["edu", "gov", "nature.com", "science.org"],
                    "excluded_domains": [],
                    "language": "en",
                    "region": "us"
                },
                "learning": {
                    "enable_learning": True,
                    "save_conversations": True,
                    "adapt_response_style": False,
                    "learn_user_preferences": True,
                    "feedback_weight": 0.3
                }
            },
            AgentType.CONVERSATIONAL: {
                "personality": "assistant",
                "search": {
                    "preferred_strategy": SearchStrategy.FALLBACK,
                    "max_results": 8,
                    "include_sources": True,
                    "confidence_threshold": 0.6,
                    "timeout": 25,
                    "preferred_domains": [],
                    "excluded_domains": [],
                    "language": "en",
                    "region": "us"
                },
                "learning": {
                    "enable_learning": True,
                    "save_conversations": True,
                    "adapt_response_style": True,
                    "learn_user_preferences": True,
                    "feedback_weight": 0.7
                }
            },
            AgentType.FACT_CHECK: {
                "personality": "expert",
                "search": {
                    "preferred_strategy": SearchStrategy.PARALLEL,
                    "max_results": 12,
                    "include_sources": True,
                    "confidence_threshold": 0.8,
                    "timeout": 35,
                    "preferred_domains": ["factcheck.org", "snopes.com", "politifact.com", "reuters.com"],
                    "excluded_domains": [],
                    "language": "en",
                    "region": "us"
                },
                "learning": {
                    "enable_learning": True,
                    "save_conversations": True,
                    "adapt_response_style": False,
                    "learn_user_preferences": False,
                    "feedback_weight": 0.2
                }
            },
            AgentType.NEWS: {
                "personality": "assistant",
                "search": {
                    "preferred_strategy": SearchStrategy.PARALLEL,
                    "max_results": 10,
                    "include_sources": True,
                    "confidence_threshold": 0.6,
                    "timeout": 30,
                    "preferred_domains": ["reuters.com", "ap.org", "bbc.com", "cnn.com"],
                    "excluded_domains": [],
                    "language": "en",
                    "region": "us"
                },
                "learning": {
                    "enable_learning": True,
                    "save_conversations": True,
                    "adapt_response_style": True,
                    "learn_user_preferences": True,
                    "feedback_weight": 0.4
                }
            }
        }
    
    def get_agent_config(self, agent_type: AgentType, personality_name: Optional[str] = None) -> AgentConfig:
        """Get configuration for a specific agent type"""
        default_config = self.default_configs.get(agent_type, self.default_configs[AgentType.BASE])
        
        # Override personality if specified
        if personality_name and personality_name in self.personalities:
            personality = self.personalities[personality_name]
        else:
            personality_name = default_config["personality"]
            personality = self.personalities[personality_name]
        
        # Create search preferences
        search_config = default_config["search"]
        search_preferences = SearchPreferences(
            preferred_strategy=SearchStrategy(search_config["preferred_strategy"]),
            max_results=search_config["max_results"],
            include_sources=search_config["include_sources"],
            confidence_threshold=search_config["confidence_threshold"],
            timeout=search_config["timeout"],
            preferred_domains=search_config["preferred_domains"],
            excluded_domains=search_config["excluded_domains"],
            language=search_config["language"],
            region=search_config["region"]
        )
        
        # Create learning preferences
        learning_config = default_config["learning"]
        learning_preferences = LearningPreferences(
            enable_learning=learning_config["enable_learning"],
            save_conversations=learning_config["save_conversations"],
            adapt_response_style=learning_config["adapt_response_style"],
            learn_user_preferences=learning_config["learn_user_preferences"],
            feedback_weight=learning_config["feedback_weight"]
        )
        
        # Create agent config
        agent_config = AgentConfig(
            agent_type=agent_type,
            personality=personality.name,
            response_style=personality.response_style.value,
            max_results=search_preferences.max_results,
            search_strategy=search_preferences.preferred_strategy.value,
            include_sources=search_preferences.include_sources,
            confidence_threshold=search_preferences.confidence_threshold,
            custom_instructions=self._generate_custom_instructions(personality, search_preferences, learning_preferences)
        )
        
        return agent_config
    
    def _generate_custom_instructions(
        self, 
        personality: PersonalityProfile, 
        search: SearchPreferences, 
        learning: LearningPreferences
    ) -> str:
        """Generate custom instructions based on personality and preferences"""
        instructions = []
        
        # Personality-based instructions
        instructions.append(f"Adopt a {personality.tone} tone in responses.")
        instructions.append(f"Maintain a helpfulness level of {personality.helpfulness:.1f}.")
        instructions.append(f"Use a formality level of {personality.formality:.1f}.")
        
        if personality.verbosity > 0.7:
            instructions.append("Provide detailed and comprehensive responses.")
        elif personality.verbosity < 0.4:
            instructions.append("Be concise and to the point.")
        
        if personality.creativity > 0.7:
            instructions.append("Offer creative and innovative perspectives when appropriate.")
        
        # Search-based instructions
        if search.preferred_strategy == SearchStrategy.PARALLEL:
            instructions.append("Use multiple search sources for comprehensive coverage.")
        elif search.preferred_strategy == SearchStrategy.PRIMARY:
            instructions.append("Use the most efficient search strategy for quick responses.")
        
        if search.confidence_threshold > 0.8:
            instructions.append("Only provide answers with high confidence levels.")
        elif search.confidence_threshold < 0.5:
            instructions.append("Provide answers even with lower confidence, but indicate uncertainty.")
        
        # Learning-based instructions
        if learning.adapt_response_style:
            instructions.append("Adapt response style based on user feedback and preferences.")
        
        if learning.learn_user_preferences:
            instructions.append("Learn and remember user preferences for future interactions.")
        
        return " ".join(instructions)
    
    def create_custom_personality(
        self, 
        name: str, 
        description: str,
        tone: str,
        response_style: ResponseStyle,
        verbosity: float,
        helpfulness: float,
        creativity: float,
        formality: float
    ) -> PersonalityProfile:
        """Create a custom personality profile"""
        personality = PersonalityProfile(
            name=name,
            description=description,
            tone=tone,
            response_style=response_style,
            verbosity=max(0.0, min(1.0, verbosity)),
            helpfulness=max(0.0, min(1.0, helpfulness)),
            creativity=max(0.0, min(1.0, creativity)),
            formality=max(0.0, min(1.0, formality))
        )
        
        self.personalities[name] = personality
        return personality
    
    def save_personality(self, personality: PersonalityProfile):
        """Save a personality profile to file"""
        personality_file = self.config_dir / f"personality_{personality.name.lower()}.json"
        
        with open(personality_file, 'w') as f:
            json.dump(asdict(personality), f, indent=2)
    
    def load_personality(self, name: str) -> Optional[PersonalityProfile]:
        """Load a personality profile from file"""
        personality_file = self.config_dir / f"personality_{name.lower()}.json"
        
        if not personality_file.exists():
            return None
        
        try:
            with open(personality_file, 'r') as f:
                data = json.load(f)
            
            return PersonalityProfile(**data)
        except Exception:
            return None
    
    def list_personalities(self) -> List[str]:
        """List all available personality profiles"""
        return list(self.personalities.keys())
    
    def get_personality(self, name: str) -> Optional[PersonalityProfile]:
        """Get a specific personality profile"""
        return self.personalities.get(name)
    
    def save_user_config(self, user_id: str, config: Dict[str, Any]):
        """Save user-specific configuration"""
        config_file = self.config_dir / f"user_{user_id}.json"
        
        with open(config_file, 'w') as f:
            json.dump(config, f, indent=2)
    
    def load_user_config(self, user_id: str) -> Dict[str, Any]:
        """Load user-specific configuration"""
        config_file = self.config_dir / f"user_{user_id}.json"
        
        if not config_file.exists():
            return {}
        
        try:
            with open(config_file, 'r') as f:
                return json.load(f)
        except Exception:
            return {}
    
    def export_config(self, agent_type: AgentType, personality_name: str) -> str:
        """Export configuration as JSON string"""
        config = self.get_agent_config(agent_type, personality_name)
        return json.dumps(asdict(config), indent=2)
    
    def import_config(self, config_json: str) -> AgentConfig:
        """Import configuration from JSON string"""
        data = json.loads(config_json)
        return AgentConfig(**data)
    
    def validate_config(self, config: AgentConfig) -> List[str]:
        """Validate agent configuration and return any issues"""
        issues = []
        
        # Validate confidence threshold
        if not 0.0 <= config.confidence_threshold <= 1.0:
            issues.append("Confidence threshold must be between 0.0 and 1.0")
        
        # Validate max_results
        if not 1 <= config.max_results <= 50:
            issues.append("Max results must be between 1 and 50")
        
        # Validate search strategy
        valid_strategies = ["primary", "fallback", "parallel", "round_robin"]
        if config.search_strategy not in valid_strategies:
            issues.append(f"Search strategy must be one of: {valid_strategies}")
        
        # Validate response style
        valid_styles = ["concise", "detailed", "academic", "conversational"]
        if config.response_style not in valid_styles:
            issues.append(f"Response style must be one of: {valid_styles}")
        
        return issues
    
    def get_config_summary(self, agent_type: AgentType) -> Dict[str, Any]:
        """Get a summary of configuration for an agent type"""
        config = self.default_configs.get(agent_type, self.default_configs[AgentType.BASE])
        personality_name = config["personality"]
        personality = self.personalities[personality_name]
        
        return {
            "agent_type": agent_type.value,
            "personality": {
                "name": personality.name,
                "description": personality.description,
                "tone": personality.tone,
                "response_style": personality.response_style.value
            },
            "search_strategy": config["search"]["preferred_strategy"],
            "max_results": config["search"]["max_results"],
            "confidence_threshold": config["search"]["confidence_threshold"],
            "learning_enabled": config["learning"]["enable_learning"]
        }
