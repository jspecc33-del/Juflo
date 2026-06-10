"""
Memory System for AI Search Agent

Provides conversation context management, search history, and preference learning
for maintaining state across interactions.
"""

import asyncio
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import time
import json
from collections import defaultdict, deque
import hashlib

from .base import AgentResponse, QueryType


class MemoryType(Enum):
    CONVERSATION = "conversation"
    SEARCH_HISTORY = "search_history"
    PREFERENCES = "preferences"
    CONTEXT = "context"
    SESSION = "session"


@dataclass
class ConversationTurn:
    """Represents a single turn in a conversation"""
    query: str
    response: AgentResponse
    timestamp: float
    session_id: str
    turn_number: int
    context_before: List[str] = field(default_factory=list)
    context_after: List[str] = field(default_factory=list)


@dataclass
class SearchMemory:
    """Memory of a search query and its results"""
    query: str
    query_type: QueryType
    results_count: int
    confidence: float
    processing_time: float
    timestamp: float
    session_id: str
    follow_up_queries: List[str] = field(default_factory=list)
    user_satisfaction: Optional[float] = None  # 0-1 scale


@dataclass
class UserPreferences:
    """User preferences and learned behaviors"""
    preferred_response_style: str = "detailed"  # "concise", "detailed", "academic"
    preferred_search_strategy: str = "fallback"
    preferred_sources: List[str] = field(default_factory=list)
    avoided_sources: List[str] = field(default_factory=list)
    topic_interests: Dict[str, float] = field(default_factory=dict)  # topic -> interest score
    query_patterns: Dict[str, str] = field(default_factory=dict)  # pattern -> optimization
    language: str = "en"
    region: str = "us"
    confidence_threshold: float = 0.7


@dataclass
class SessionContext:
    """Context for the current session"""
    session_id: str
    start_time: float
    last_activity: float
    total_queries: int = 0
    session_type: str = "general"  # "research", "casual", "fact_checking"
    current_topic: Optional[str] = None
    related_queries: List[str] = field(default_factory=list)
    key_entities: List[str] = field(default_factory=list)
    user_goals: List[str] = field(default_factory=list)


class ConversationMemory:
    """Manages conversation context and history"""
    
    def __init__(self, max_conversation_length: int = 50, max_sessions: int = 100):
        self.max_conversation_length = max_conversation_length
        self.max_sessions = max_sessions
        
        # Storage
        self.conversations: Dict[str, List[ConversationTurn]] = defaultdict(list)
        self.search_history: List[SearchMemory] = []
        self.preferences = UserPreferences()
        self.active_sessions: Dict[str, SessionContext] = {}
        self.archived_sessions: List[SessionContext] = []
        
        # Context windows
        self.short_term_context = deque(maxlen=10)  # Last 10 interactions
        self.long_term_context = deque(maxlen=100)  # Last 100 interactions
        
        # Learning data
        self.query_success_rate: Dict[str, float] = defaultdict(float)
        self.topic_frequency: Dict[str, int] defaultdict(int)
        
    def create_session(self, session_type: str = "general") -> str:
        """Create a new conversation session"""
        session_id = self._generate_session_id()
        
        session = SessionContext(
            session_id=session_id,
            start_time=time.time(),
            last_activity=time.time(),
            session_type=session_type
        )
        
        self.active_sessions[session_id] = session
        return session_id
    
    def add_conversation_turn(
        self, 
        session_id: str, 
        query: str, 
        response: AgentResponse
    ) -> ConversationTurn:
        """Add a conversation turn to memory"""
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        session = self.active_sessions[session_id]
        turn_number = len(self.conversations[session_id]) + 1
        
        # Get context before this turn
        context_before = self._get_context_before(session_id, turn_number)
        
        turn = ConversationTurn(
            query=query,
            response=response,
            timestamp=time.time(),
            session_id=session_id,
            turn_number=turn_number,
            context_before=context_before
        )
        
        # Add to conversation
        self.conversations[session_id].append(turn)
        
        # Update session
        session.last_activity = time.time()
        session.total_queries += 1
        
        # Update context
        self._update_context(turn)
        
        # Clean up old conversations if needed
        self._cleanup_old_conversations()
        
        return turn
    
    def add_search_memory(self, search_memory: SearchMemory):
        """Add a search memory entry"""
        self.search_history.append(search_memory)
        
        # Update learning data
        self._update_learning_data(search_memory)
        
        # Clean up old history
        if len(self.search_history) > 1000:
            self.search_history = self.search_history[-1000:]
    
    def get_conversation_context(
        self, 
        session_id: str, 
        context_length: int = 5
    ) -> List[str]:
        """Get recent conversation context"""
        if session_id not in self.conversations:
            return []
        
        conversation = self.conversations[session_id]
        recent_turns = conversation[-context_length:]
        
        context = []
        for turn in recent_turns:
            context.append(f"Q: {turn.query}")
            context.append(f"A: {turn.response.answer[:200]}...")
        
        return context
    
    def get_related_queries(self, query: str, limit: int = 5) -> List[str]:
        """Get queries related to the current query"""
        related = []
        
        # Find similar queries in history
        query_lower = query.lower()
        query_words = set(query_lower.split())
        
        for memory in self.search_history[-50:]:  # Last 50 searches
            memory_words = set(memory.query.lower().split())
            
            # Calculate similarity
            intersection = query_words.intersection(memory_words)
            if len(intersection) >= 2:  # At least 2 words in common
                similarity = len(intersection) / len(query_words.union(memory_words))
                if similarity > 0.3:  # 30% similarity threshold
                    related.append((memory.query, similarity))
        
        # Sort by similarity and return top results
        related.sort(key=lambda x: x[1], reverse=True)
        return [query for query, _ in related[:limit]]
    
    def update_preferences(self, **kwargs):
        """Update user preferences based on interactions"""
        for key, value in kwargs.items():
            if hasattr(self.preferences, key):
                setattr(self.preferences, key, value)
    
    def learn_from_feedback(self, session_id: str, turn_number: int, satisfaction: float):
        """Learn from user feedback"""
        if session_id not in self.conversations:
            return
        
        conversation = self.conversations[session_id]
        if turn_number > len(conversation):
            return
        
        turn = conversation[turn_number - 1]
        turn.response.metadata = turn.response.metadata or {}
        turn.response.metadata["user_satisfaction"] = satisfaction
        
        # Update query success rate
        query_pattern = self._extract_query_pattern(turn.query)
        current_rate = self.query_success_rate[query_pattern]
        self.query_success_rate[query_pattern] = (current_rate + satisfaction) / 2
        
        # Update search memory if exists
        for memory in self.search_history:
            if memory.query == turn.query and memory.session_id == session_id:
                memory.user_satisfaction = satisfaction
                break
    
    def get_session_summary(self, session_id: str) -> Dict[str, Any]:
        """Get a summary of a session"""
        if session_id not in self.active_sessions:
            return {"error": "Session not found"}
        
        session = self.active_sessions[session_id]
        conversation = self.conversations[session_id]
        
        # Calculate statistics
        total_time = session.last_activity - session.start_time
        avg_confidence = sum(turn.response.confidence for turn in conversation) / len(conversation) if conversation else 0
        avg_processing_time = sum(turn.response.processing_time for turn in conversation) / len(conversation) if conversation else 0
        
        # Extract topics
        topics = self._extract_topics_from_conversation(conversation)
        
        return {
            "session_id": session_id,
            "session_type": session.session_type,
            "duration": total_time,
            "total_queries": session.total_queries,
            "avg_confidence": avg_confidence,
            "avg_processing_time": avg_processing_time,
            "topics": topics,
            "key_entities": session.key_entities,
            "current_topic": session.current_topic
        }
    
    def archive_session(self, session_id: str):
        """Archive an inactive session"""
        if session_id not in self.active_sessions:
            return
        
        session = self.active_sessions.pop(session_id)
        self.archived_sessions.append(session)
        
        # Clean up old archived sessions
        if len(self.archived_sessions) > self.max_sessions:
            self.archived_sessions = self.archived_sessions[-self.max_sessions:]
    
    def cleanup_inactive_sessions(self, inactive_threshold: float = 3600):
        """Clean up sessions inactive for more than threshold seconds"""
        current_time = time.time()
        inactive_sessions = []
        
        for session_id, session in self.active_sessions.items():
            if current_time - session.last_activity > inactive_threshold:
                inactive_sessions.append(session_id)
        
        for session_id in inactive_sessions:
            self.archive_session(session_id)
    
    def export_memory(self, format: str = "json") -> str:
        """Export memory data for backup or analysis"""
        data = {
            "preferences": {
                "preferred_response_style": self.preferences.preferred_response_style,
                "preferred_search_strategy": self.preferences.preferred_search_strategy,
                "preferred_sources": self.preferences.preferred_sources,
                "language": self.preferences.language,
                "region": self.preferences.region,
                "confidence_threshold": self.preferences.confidence_threshold
            },
            "query_success_rate": dict(self.query_success_rate),
            "topic_frequency": dict(self.topic_frequency),
            "active_sessions": len(self.active_sessions),
            "archived_sessions": len(self.archived_sessions),
            "total_conversations": len(self.conversations),
            "total_searches": len(self.search_history)
        }
        
        if format == "json":
            return json.dumps(data, indent=2)
        else:
            return str(data)
    
    def _generate_session_id(self) -> str:
        """Generate a unique session ID"""
        timestamp = str(time.time())
        hash_input = f"{timestamp}_{len(self.active_sessions)}"
        return hashlib.md5(hash_input.encode()).hexdigest()[:12]
    
    def _get_context_before(self, session_id: str, turn_number: int) -> List[str]:
        """Get context before a specific turn"""
        conversation = self.conversations[session_id]
        context_turns = conversation[max(0, turn_number - 3):turn_number]
        
        context = []
        for turn in context_turns:
            context.append(f"Q: {turn.query}")
            context.append(f"A: {turn.response.answer[:100]}...")
        
        return context
    
    def _update_context(self, turn: ConversationTurn):
        """Update context windows"""
        # Add to short-term context
        self.short_term_context.append({
            "query": turn.query,
            "answer": turn.response.answer,
            "timestamp": turn.timestamp
        })
        
        # Add to long-term context
        self.long_term_context.append({
            "query": turn.query,
            "query_type": turn.response.query_type.value,
            "confidence": turn.response.confidence,
            "timestamp": turn.timestamp
        })
    
    def _cleanup_old_conversations(self):
        """Clean up old conversations to prevent memory bloat"""
        for session_id, conversation in list(self.conversations.items()):
            if len(conversation) > self.max_conversation_length:
                # Keep only the most recent turns
                self.conversations[session_id] = conversation[-self.max_conversation_length:]
    
    def _update_learning_data(self, search_memory: SearchMemory):
        """Update learning data from search memory"""
        # Update topic frequency
        topics = self._extract_topics(search_memory.query)
        for topic in topics:
            self.topic_frequency[topic] += 1
    
    def _extract_topics(self, text: str) -> List[str]:
        """Extract topics from text (simplified implementation)"""
        # This is a simplified topic extraction
        # In practice, you'd use NLP techniques
        words = text.lower().split()
        
        # Filter out common words
        stop_words = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
            "of", "with", "by", "is", "are", "was", "were", "be", "been", "have",
            "has", "had", "do", "does", "did", "will", "would", "could", "should"
        }
        
        topics = [word for word in words if len(word) > 3 and word not in stop_words]
        return topics[:5]  # Top 5 topics
    
    def _extract_topics_from_conversation(self, conversation: List[ConversationTurn]) -> List[str]:
        """Extract topics from entire conversation"""
        all_text = " ".join([turn.query + " " + turn.response.answer for turn in conversation])
        return self._extract_topics(all_text)
    
    def _extract_query_pattern(self, query: str) -> str:
        """Extract a pattern from the query for learning"""
        # Simplified pattern extraction
        words = query.lower().split()
        if len(words) <= 2:
            return query.lower()
        
        # Remove stop words and keep first few meaningful words
        stop_words = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for"
        }
        
        meaningful_words = [word for word in words[:4] if word not in stop_words]
        return " ".join(meaningful_words)
