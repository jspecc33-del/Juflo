"""
Conversational Agent - Specialized for interactive, memory-aware conversations

Provides conversational search capabilities with context awareness,
memory management, and natural language interactions.
"""

import asyncio
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
import re
import time
from collections import defaultdict

from .base import BaseAgent, AgentConfig, AgentResponse, QueryType
from .intelligence import IntelligenceProcessor
from .memory import ConversationMemory, SessionContext
from ..base import SearchResponse, SearchResult, SearchType


@dataclass
class ConversationContext:
    """Context for current conversation"""
    current_topic: Optional[str] = None
    previous_queries: List[str] = None
    user_preferences: Dict[str, Any] = None
    conversation_state: str = "active"  # "active", "paused", "ended"
    follow_up_suggestions: List[str] = None
    
    def __post_init__(self):
        if self.previous_queries is None:
            self.previous_queries = []
        if self.user_preferences is None:
            self.user_preferences = {}
        if self.follow_up_suggestions is None:
            self.follow_up_suggestions = []


@dataclass
class ConversationResponse:
    """Enhanced response for conversational interactions"""
    agent_response: AgentResponse
    conversational_elements: Dict[str, Any]
    follow_up_questions: List[str]
    context_references: List[str]
    personalization_level: float  # 0-1, how personalized the response is


class ConversationalAgent(BaseAgent):
    """Specialized agent for conversational search with memory"""
    
    def __init__(self, search_config: Dict[str, Any], agent_config: AgentConfig, memory: ConversationMemory):
        super().__init__(search_config, agent_config)
        self.memory = memory
        self.intelligence_processor = IntelligenceProcessor()
        self.conversation_context = ConversationContext()
        self.personalization_patterns = self._load_personalization_patterns()
        self.conversation_templates = self._load_conversation_templates()
        
    def _load_personalization_patterns(self) -> Dict[str, List[str]]:
        """Load patterns for personalizing responses"""
        return {
            "greetings": [
                "Hello!", "Hi there!", "Hey!", "Good to see you!",
                "Welcome back!", "Great to hear from you!"
            ],
            "acknowledgments": [
                "I understand", "I see", "Got it", "That makes sense",
                "I appreciate that", "Thanks for sharing"
            ],
            "transitions": [
                "Speaking of which", "On that note", "Related to this",
                "Building on that", "Following up on this"
            ],
            "closures": [
                "Hope this helps!", "Let me know if you need more",
                "Feel free to ask anything else", "I'm here to help"
            ]
        }
    
    def _load_conversation_templates(self) -> Dict[str, List[str]]:
        """Load conversation response templates"""
        return {
            "follow_up": [
                "Would you like to know more about {topic}?",
                "Are you interested in {related_topic}?",
                "Should I look into {aspect}?",
                "Do you want details about {specific}?"
            ],
            "clarification": [
                "Could you tell me more about what specifically interests you?",
                "Are you looking for recent information or historical context?",
                "Would you prefer technical details or a general overview?",
                "Is this for academic research or general knowledge?"
            ],
            "topic_change": [
                "That's an interesting shift to {new_topic}!",
                "Moving on to {new_topic}, let me help you with that.",
                "Regarding {new_topic}, here's what I found:",
                "Let's explore {new_topic} together."
            ]
        }
    
    async def _synthesize_answer(
        self, 
        query: str, 
        search_results: SearchResponse, 
        query_type: QueryType
    ) -> Tuple[str, float]:
        """Synthesize conversational answer with context awareness"""
        
        # Get conversation context
        context = self._get_conversation_context(query)
        
        # Analyze sources with conversation awareness
        source_analyses = await self.intelligence_processor.analyze_sources(search_results)
        
        # Generate base answer
        base_answer, confidence = await self.intelligence_processor.synthesize_answer(
            query, search_results, query_type, self.agent_config.response_style
        )
        
        # Personalize the response
        personalized_answer = self._personalize_response(base_answer, context)
        
        # Add conversational elements
        conversational_answer = self._add_conversational_elements(
            personalized_answer, context, query_type
        )
        
        # Update conversation context
        self._update_conversation_context(query, conversational_answer)
        
        return conversational_answer, confidence
    
    def _get_conversation_context(self, query: str) -> ConversationContext:
        """Get current conversation context"""
        context = ConversationContext()
        
        # Get recent conversation history
        if hasattr(self, 'current_session_id') and self.current_session_id:
            recent_context = self.memory.get_conversation_context(
                self.current_session_id, 5
            )
            
            # Extract previous queries
            for line in recent_context:
                if line.startswith("Q: "):
                    context.previous_queries.append(line[3:])
        
        # Detect current topic
        context.current_topic = self._detect_current_topic(query, context.previous_queries)
        
        # Get user preferences
        context.user_preferences = {
            "response_style": self.memory.preferences.preferred_response_style,
            "preferred_sources": self.memory.preferences.preferred_sources,
            "language": self.memory.preferences.language
        }
        
        # Generate follow-up suggestions
        context.follow_up_suggestions = self._generate_follow_up_suggestions(
            query, context.current_topic
        )
        
        return context
    
    def _detect_current_topic(self, query: str, previous_queries: List[str]) -> Optional[str]:
        """Detect the current conversation topic"""
        # Simple topic detection based on query analysis
        query_words = set(query.lower().split())
        
        # Check for topic continuity
        if previous_queries:
            last_query = previous_queries[-1].lower()
            last_words = set(last_query.split())
            
            # Calculate word overlap
            overlap = query_words.intersection(last_words)
            if len(overlap) >= 2:  # At least 2 words in common
                # Extract common topic
                common_words = list(overlap)[:3]  # Top 3 common words
                return " ".join(common_words)
        
        # Extract topic from current query
        # Remove stop words
        stop_words = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
            "of", "with", "by", "is", "are", "was", "were", "be", "been", "have",
            "has", "had", "do", "does", "did", "will", "would", "could", "should",
            "what", "how", "when", "where", "why", "which", "who"
        }
        
        topic_words = [word for word in query_words if word not in stop_words and len(word) > 3]
        
        if topic_words:
            return " ".join(topic_words[:2])  # Top 2 meaningful words
        
        return None
    
    def _generate_follow_up_suggestions(self, query: str, topic: Optional[str]) -> List[str]:
        """Generate follow-up question suggestions"""
        suggestions = []
        
        # Topic-specific suggestions
        if topic:
            suggestions.extend([
                f"Tell me more about {topic}",
                f"What are the latest developments in {topic}?",
                f"How does {topic} compare to alternatives?",
                f"What are the challenges in {topic}?"
            ])
        
        # Query-type specific suggestions
        query_lower = query.lower()
        
        if any(word in query_lower for word in ["what is", "define", "explain"]):
            suggestions.extend([
                "How does this work in practice?",
                "What are some real-world examples?",
                "Are there any controversies or debates?"
            ])
        
        if any(word in query_lower for word in ["how to", "guide", "steps"]):
            suggestions.extend([
                "What are common mistakes to avoid?",
                "What tools or resources do I need?",
                "Are there alternative approaches?"
            ])
        
        if any(word in query_lower for word in ["best", "compare", "vs"]):
            suggestions.extend([
                "What are the pros and cons of each?",
                "Which one is most cost-effective?",
                "How do they differ in performance?"
            ])
        
        return suggestions[:4]  # Top 4 suggestions
    
    def _personalize_response(self, base_answer: str, context: ConversationContext) -> str:
        """Personalize response based on conversation context and user preferences"""
        personalized = base_answer
        
        # Add greeting if this seems like the start of conversation
        if len(context.previous_queries) <= 1:
            greeting = self._select_greeting()
            personalized = f"{greeting} {personalized}"
        
        # Add context references if there's conversation history
        if context.previous_queries and context.current_topic:
            context_ref = self._generate_context_reference(context)
            if context_ref:
                personalized = f"{context_ref} {personalized}"
        
        # Adapt response style based on preferences
        if context.user_preferences.get("response_style") == "concise":
            personalized = self._make_concise(personalized)
        elif context.user_preferences.get("response_style") == "academic":
            personalized = self._make_academic(personalized)
        
        return personalized
    
    def _select_greeting(self) -> str:
        """Select appropriate greeting"""
        import random
        return random.choice(self.personalization_patterns["greetings"])
    
    def _generate_context_reference(self, context: ConversationContext) -> str:
        """Generate reference to previous conversation context"""
        if not context.current_topic:
            return ""
        
        references = [
            f"Building on our discussion about {context.current_topic},",
            f"Continuing with {context.current_topic},",
            f"Regarding {context.current_topic},",
            f"To expand on {context.current_topic},"
        ]
        
        import random
        return random.choice(references)
    
    def _make_concise(self, text: str) -> str:
        """Make response more concise"""
        # Remove redundant phrases
        redundant_phrases = [
            "it is important to note that",
            "it should be mentioned that",
            "it is worth noting that",
            "as you can see"
        ]
        
        for phrase in redundant_phrases:
            text = text.replace(phrase, "")
        
        # Split into sentences and keep key ones
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        # Keep first few sentences
        if len(sentences) > 3:
            sentences = sentences[:3]
        
        return ". ".join(sentences) + "."
    
    def _make_academic(self, str) -> str:
        """Make response more academic in tone"""
        # Add academic framing
        academic_prefixes = [
            "According to current research,",
            "Based on available evidence,",
            "From an academic perspective,",
            "Research indicates that"
        ]
        
        import random
        prefix = random.choice(academic_prefixes)
        
        # Add academic qualifiers
        text = text.replace("I think", "Evidence suggests")
        text = text.replace("It seems", "Research indicates")
        text = text.replace("Probably", "Evidence suggests")
        
        return f"{prefix} {text}"
    
    def _add_conversational_elements(
        self, 
        answer: str, 
        context: ConversationContext, 
        query_type: QueryType
    ) -> str:
        """Add conversational elements to the response"""
        conversational_answer = answer
        
        # Add acknowledgment if appropriate
        if len(context.previous_queries) > 0:
            acknowledgment = self._select_acknowledgment()
            conversational_answer = f"{acknowledgment} {conversational_answer}"
        
        # Add follow-up suggestions
        if context.follow_up_suggestions:
            follow_up = self._format_follow_up_suggestions(context.follow_up_suggestions)
            conversational_answer += f"\n\n{follow_up}"
        
        # Add conversational closing
        closing = self._select_closing()
        conversational_answer += f"\n\n{closing}"
        
        return conversational_answer
    
    def _select_acknowledgment(self) -> str:
        """Select appropriate acknowledgment"""
        import random
        return random.choice(self.personalization_patterns["acknowledgments"])
    
    def _format_follow_up_suggestions(self, suggestions: List[str]) -> str:
        """Format follow-up suggestions"""
        if not suggestions:
            return ""
        
        formatted = "Would you like to explore any of these related topics?\n"
        for i, suggestion in enumerate(suggestions, 1):
            formatted += f"{i}. {suggestion}\n"
        
        return formatted
    
    def _select_closing(self) -> str:
        """Select appropriate closing"""
        import random
        return random.choice(self.personalization_patterns["closures"])
    
    def _update_conversation_context(self, query: str, answer: str):
        """Update internal conversation context"""
        self.conversation_context.previous_queries.append(query)
        
        # Keep only recent queries
        if len(self.conversation_context.previous_queries) > 10:
            self.conversation_context.previous_queries = self.conversation_context.previous_queries[-10:]
        
        # Update current topic
        self.conversation_context.current_topic = self._detect_current_topic(
            query, self.conversation_context.previous_queries[:-1]
        )
    
    async def handle_follow_up(self, follow_up_query: str, original_query: str) -> AgentResponse:
        """Handle follow-up questions with enhanced context"""
        # Combine with original query for better search results
        combined_query = f"{original_query} {follow_up_query}"
        
        # Process with enhanced context
        response = await self.process_query(combined_query)
        
        # Add follow-up context to response
        response.metadata = response.metadata or {}
        response.metadata["is_follow_up"] = True
        response.metadata["original_query"] = original_query
        response.metadata["follow_up_query"] = follow_up_query
        
        return response
    
    async def clarify_query(self, ambiguous_query: str) -> str:
        """Generate clarification questions for ambiguous queries"""
        clarification_questions = []
        
        query_lower = ambiguous_query.lower()
        
        # Check for ambiguity patterns
        if "it" in query_lower:
            clarification_questions.append("What specifically does 'it' refer to?")
        
        if "they" in query_lower:
            clarification_questions.append("Who or what are 'they'?")
        
        if "that" in query_lower:
            clarification_questions.append("What specifically are you referring to with 'that'?")
        
        if len(ambiguous_query.split()) < 4:
            clarification_questions.append("Could you provide more details about what you'd like to know?")
        
        # Check for multiple possible interpretations
        ambiguous_terms = ["bank", "apple", "python", "java", "star", "mercury"]
        for term in ambiguous_terms:
            if term in query_lower:
                clarification_questions.append(f"Are you referring to {term} in a technical, business, or general context?")
        
        if not clarification_questions:
            clarification_questions.append("Could you clarify what specific aspect you're interested in?")
        
        # Format clarification response
        response = "I want to make sure I give you the most helpful information. "
        response += "Could you clarify:\n\n"
        
        for i, question in enumerate(clarification_questions[:3], 1):
            response += f"{i}. {question}\n"
        
        response += "\nThis will help me provide you with more targeted and relevant information."
        
        return response
    
    def get_conversation_summary(self) -> Dict[str, Any]:
        """Get summary of current conversation"""
        if not hasattr(self, 'current_session_id') or not self.current_session_id:
            return {"error": "No active conversation"}
        
        session_summary = self.memory.get_session_summary(self.current_session_id)
        
        # Add conversational-specific information
        session_summary.update({
            "current_topic": self.conversation_context.current_topic,
            "total_exchanges": len(self.conversation_context.previous_queries),
            "personalization_level": self._calculate_personalization_level(),
            "conversation_state": self.conversation_context.conversation_state
        })
        
        return session_summary
    
    def _calculate_personalization_level(self) -> float:
        """Calculate how personalized the conversation has become"""
        if not self.conversation_context.previous_queries:
            return 0.0
        
        # Factors that increase personalization
        factors = {
            "conversation_length": min(len(self.conversation_context.previous_queries) / 5.0, 1.0),
            "topic_continuity": 0.8 if self.conversation_context.current_topic else 0.2,
            "context_usage": 0.7 if len(self.conversation_context.previous_queries) > 2 else 0.3
        }
        
        # Weighted average
        personalization = (
            factors["conversation_length"] * 0.4 +
            factors["topic_continuity"] * 0.4 +
            factors["context_usage"] * 0.2
        )
        
        return min(1.0, personalization)
    
    async def reset_conversation(self):
        """Reset conversation context while preserving memory"""
        self.conversation_context = ConversationContext()
        
        # Create new session
        if hasattr(self, 'current_session_id') and self.current_session_id:
            self.memory.archive_session(self.current_session_id)
        
        self.current_session_id = self.memory.create_session("conversational")
    
    def set_session_id(self, session_id: str):
        """Set the current session ID"""
        self.current_session_id = session_id
