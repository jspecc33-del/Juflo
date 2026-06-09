"""
Intelligence Layer for AI Search Agent System

Provides query processing, result analysis, and answer synthesis capabilities
for intelligent search responses.
"""

import asyncio
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import re
import time
from collections import Counter
from urllib.parse import urlparse

from ..base import SearchResponse, SearchResult, SearchType
from .base import QueryType, AgentResponse


class SourceCredibility(Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"


@dataclass
class SourceAnalysis:
    """Analysis of a source's credibility and relevance"""
    source: SearchResult
    credibility: SourceCredibility
    relevance_score: float
    freshness_score: float
    authority_score: float
    bias_score: float  # 0 = neutral, 1 = highly biased


@dataclass
class AnswerSynthesis:
    """Synthesized answer with confidence and reasoning"""
    answer: str
    confidence: float
    key_points: List[str]
    supporting_sources: List[SourceAnalysis]
    contradictory_sources: List[SourceAnalysis]
    knowledge_gaps: List[str]
    reasoning: str


class IntelligenceProcessor:
    """Intelligence layer for query processing and answer synthesis"""
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.credibility_domains = self._load_credibility_domains()
        self.authority_keywords = self._load_authority_keywords()
        
    def _load_credibility_domains(self) -> Dict[str, SourceCredibility]:
        """Load domain credibility ratings"""
        return {
            # High credibility sources
            "nature.com": SourceCredibility.HIGH,
            "science.org": SourceCredibility.HIGH,
            "cell.com": SourceCredibility.HIGH,
            "nejm.org": SourceCredibility.HIGH,
            "thelancet.com": SourceCredibility.HIGH,
            "bmj.com": SourceCredibility.HIGH,
            "pubmed.ncbi.nlm.nih.gov": SourceCredibility.HIGH,
            "arxiv.org": SourceCredibility.HIGH,
            "scholar.google.com": SourceCredibility.HIGH,
            
            # Government sources
            "gov": SourceCredibility.HIGH,
            "edu": SourceCredibility.HIGH,
            "nasa.gov": SourceCredibility.HIGH,
            "cdc.gov": SourceCredibility.HIGH,
            "who.int": SourceCredibility.HIGH,
            "un.org": SourceCredibility.HIGH,
            
            # Reputable news
            "reuters.com": SourceCredibility.HIGH,
            "ap.org": SourceCredibility.HIGH,
            "bbc.com": SourceCredibility.HIGH,
            "npr.org": SourceCredibility.HIGH,
            "pbs.org": SourceCredibility.HIGH,
            
            # Medium credibility
            "wikipedia.org": SourceCredibility.MEDIUM,
            "medium.com": SourceCredibility.MEDIUM,
            "forbes.com": SourceCredibility.MEDIUM,
            "techcrunch.com": SourceCredibility.MEDIUM,
            "wired.com": SourceCredibility.MEDIUM,
            
            # Lower credibility
            "blog": SourceCredibility.LOW,
            "forum": SourceCredibility.LOW,
            "social media": SourceCredibility.LOW,
        }
    
    def _load_authority_keywords(self) -> Dict[str, List[str]]:
        """Load keywords that indicate authority on different topics"""
        return {
            "academic": [
                "study", "research", "journal", "paper", "peer-reviewed",
                "university", "institute", "laboratory", "clinical trial"
            ],
            "medical": [
                "doctor", "medical", "health", "clinical", "hospital",
                "treatment", "diagnosis", "therapy", "medicine"
            ],
            "technical": [
                "engineering", "technical", "specification", "manual",
                "documentation", "api", "algorithm", "protocol"
            ],
            "news": [
                "breaking", "report", "journalist", "news", "press",
                "announcement", "update", "developing story"
            ]
        }
    
    async def analyze_sources(self, search_results: SearchResponse) -> List[SourceAnalysis]:
        """Analyze credibility and relevance of search sources"""
        analyses = []
        
        for result in search_results.results:
            analysis = await self._analyze_single_source(result)
            analyses.append(analysis)
        
        # Sort by overall relevance score
        analyses.sort(key=lambda x: x.relevance_score, reverse=True)
        return analyses
    
    async def _analyze_single_source(self, source: SearchResult) -> SourceAnalysis:
        """Analyze a single source for credibility and relevance"""
        # Extract domain
        try:
            domain = urlparse(source.url).netloc.lower()
        except:
            domain = ""
        
        # Determine credibility
        credibility = self._assess_credibility(domain, source)
        
        # Calculate relevance score
        relevance_score = self._calculate_relevance(source)
        
        # Calculate freshness score
        freshness_score = self._calculate_freshness(source)
        
        # Calculate authority score
        authority_score = self._calculate_authority(source, domain)
        
        # Calculate bias score
        bias_score = self._calculate_bias(source, domain)
        
        return SourceAnalysis(
            source=source,
            credibility=credibility,
            relevance_score=relevance_score,
            freshness_score=freshness_score,
            authority_score=authority_score,
            bias_score=bias_score
        )
    
    def _assess_credibility(self, domain: str, source: SearchResult) -> SourceCredibility:
        """Assess source credibility based on domain and content"""
        # Check against known credible domains
        for known_domain, credibility in self.credibility_domains.items():
            if known_domain in domain:
                return credibility
        
        # Check for educational/government domains
        if domain.endswith(".edu") or domain.endswith(".gov"):
            return SourceCredibility.HIGH
        
        # Check for suspicious indicators
        suspicious_indicators = ["blog", "forum", "social", "opinion", "commentary"]
        if any(indicator in domain or indicator in source.title.lower() for indicator in suspicious_indicators):
            return SourceCredibility.LOW
        
        return SourceCredibility.MEDIUM
    
    def _calculate_relevance(self, source: SearchResult) -> float:
        """Calculate relevance score based on title and snippet"""
        # Simple relevance scoring based on title length and snippet quality
        title_score = min(len(source.title.split()) / 10.0, 1.0)
        snippet_score = min(len(source.snippet.split()) / 20.0, 1.0)
        
        # Penalize very short or very long content
        if len(source.snippet) < 50:
            snippet_score *= 0.5
        elif len(source.snippet) > 500:
            snippet_score *= 0.8
        
        return (title_score + snippet_score) / 2.0
    
    def _calculate_freshness(self, source: SearchResult) -> float:
        """Calculate freshness score based on publication date"""
        # This is a simplified implementation
        # In practice, you'd extract actual dates from metadata
        metadata = source.metadata or {}
        
        # Check for date indicators in metadata
        if "published_date" in metadata:
            # Parse date and calculate recency
            return 0.8  # Placeholder
        
        # Check for date in snippet
        date_patterns = [
            r"\b2024\b", r"\b2023\b", r"\b2022\b",
            r"\bJanuary\b", r"\bFebruary\b", r"\bMarch\b",
            r"\bApril\b", r"\bMay\b", r"\bJune\b"
        ]
        
        if any(re.search(pattern, source.snippet) for pattern in date_patterns):
            return 0.6
        
        return 0.3  # Default for undated content
    
    def _calculate_authority(self, source: SearchResult, domain: str) -> float:
        """Calculate authority score based on source indicators"""
        score = 0.5  # Base score
        
        # Check for authority keywords
        text = (source.title + " " + source.snippet).lower()
        for category, keywords in self.authority_keywords.items():
            if any(keyword in text for keyword in keywords):
                score += 0.2
        
        # Domain-based authority
        if any(cred_domain in domain for cred_domain in ["edu", "gov", "org"]):
            score += 0.3
        
        # Title indicators
        if any(indicator in source.title.lower() for indicator in ["official", "expert", "research"]):
            score += 0.2
        
        return min(score, 1.0)
    
    def _calculate_bias(self, source: SearchResult, domain: str) -> float:
        """Calculate bias score (0 = neutral, 1 = highly biased)"""
        # This is a simplified implementation
        # In practice, you'd use more sophisticated bias detection
        
        bias_indicators = [
            "opinion", "editorial", "commentary", "perspective",
            "viewpoint", "stance", "position", "argument"
        ]
        
        text = (source.title + " " + source.snippet).lower()
        bias_count = sum(1 for indicator in bias_indicators if indicator in text)
        
        # Check for domain-based bias
        known_biased_domains = ["opinion", "editorial", "commentary"]
        if any(biased in domain for biased in known_biased_domains):
            bias_count += 2
        
        return min(bias_count / 5.0, 1.0)
    
    async def synthesize_answer(
        self, 
        query: str, 
        search_results: SearchResponse, 
        query_type: QueryType,
        style: str = "detailed"
    ) -> Tuple[str, float]:
        """Synthesize answer from search results"""
        if not search_results.results:
            return "I couldn't find relevant information for your query.", 0.0
        
        # Analyze sources
        source_analyses = await self.analyze_sources(search_results)
        
        # Filter high-quality sources
        quality_sources = [
            analysis for analysis in source_analyses
            if analysis.credibility in [SourceCredibility.HIGH, SourceCredibility.MEDIUM]
            and analysis.relevance_score > 0.3
        ]
        
        if not quality_sources:
            quality_sources = source_analyses[:3]  # Fallback to top 3
        
        # Extract key information
        key_points = self._extract_key_points(quality_sources, query)
        
        # Identify contradictions
        contradictions = self._identify_contradictions(quality_sources)
        
        # Generate answer based on query type
        answer = self._generate_answer(query, key_points, contradictions, query_type, style)
        
        # Calculate confidence
        confidence = self._calculate_confidence(quality_sources, contradictions)
        
        return answer, confidence
    
    def _extract_key_points(self, sources: List[SourceAnalysis], query: str) -> List[str]:
        """Extract key points from quality sources"""
        key_points = []
        query_terms = query.lower().split()
        
        for analysis in sources[:5]:  # Top 5 sources
            source = analysis.source
            
            # Extract sentences containing query terms
            sentences = re.split(r'[.!?]+', source.snippet)
            relevant_sentences = []
            
            for sentence in sentences:
                sentence = sentence.strip()
                if len(sentence) > 20:  # Minimum length
                    # Check if sentence contains query terms
                    if any(term in sentence.lower() for term in query_terms):
                        relevant_sentences.append(sentence)
            
            # Add most relevant sentence
            if relevant_sentences:
                key_points.append(relevant_sentences[0])
        
        # Remove duplicates and limit
        unique_points = []
        for point in key_points:
            if not any(point.lower() == existing.lower() for existing in unique_points):
                unique_points.append(point)
        
        return unique_points[:3]  # Top 3 key points
    
    def _identify_contradictions(self, sources: List[SourceAnalysis]) -> List[str]:
        """Identify contradictory information in sources"""
        contradictions = []
        
        if len(sources) < 2:
            return contradictions
        
        # Simple contradiction detection based on opposing keywords
        opposing_pairs = [
            ("effective", "ineffective"),
            ("safe", "dangerous"),
            ("beneficial", "harmful"),
            ("true", "false"),
            ("increase", "decrease"),
            ("support", "oppose")
        ]
        
        for i, source1 in enumerate(sources[:3]):
            for source2 in sources[i+1:4]:
                text1 = (source1.source.title + " " + source1.source.snippet).lower()
                text2 = (source2.source.title + " " + source2.source.snippet).lower()
                
                for positive, negative in opposing_pairs:
                    if positive in text1 and negative in text2:
                        contradictions.append(
                            f"Source {i+1} suggests '{positive}' while source {i+2} suggests '{negative}'"
                        )
                    elif negative in text1 and positive in text2:
                        contradictions.append(
                            f"Source {i+1} suggests '{negative}' while source {i+2} suggests '{positive}'"
                        )
        
        return contradictions[:2]  # Top 2 contradictions
    
    def _generate_answer(
        self, 
        query: str, 
        key_points: List[str], 
        contradictions: List[str],
        query_type: QueryType,
        style: str
    ) -> str:
        """Generate answer based on extracted information"""
        
        if style == "concise":
            return self._generate_concise_answer(query, key_points)
        elif style == "academic":
            return self._generate_academic_answer(query, key_points, contradictions)
        else:  # detailed
            return self._generate_detailed_answer(query, key_points, contradictions)
    
    def _generate_concise_answer(self, query: str, key_points: List[str]) -> str:
        """Generate a concise answer"""
        if not key_points:
            return "I couldn't find specific information to answer your question."
        
        # Combine key points into a concise response
        answer = f"Based on the search results, {key_points[0].lower()}"
        
        if len(key_points) > 1:
            answer += f" Additionally, {key_points[1].lower()}"
        
        return answer + "."
    
    def _generate_detailed_answer(
        self, 
        query: str, 
        key_points: List[str], 
        contradictions: List[str]
    ) -> str:
        """Generate a detailed answer"""
        if not key_points:
            return "I couldn't find relevant information to answer your question."
        
        answer = f"Based on my search, here's what I found about '{query}':\n\n"
        
        # Add key points
        for i, point in enumerate(key_points, 1):
            answer += f"{i}. {point}\n"
        
        # Add contradictions if any
        if contradictions:
            answer += "\nNote: I found some conflicting information:\n"
            for contradiction in contradictions:
                answer += f"- {contradiction}\n"
        
        return answer
    
    def _generate_academic_answer(
        self, 
        query: str, 
        key_points: List[str], 
        contradictions: List[str]
    ) -> str:
        """Generate an academic-style answer"""
        if not key_points:
            return "Insufficient scholarly sources were found to address this query."
        
        answer = f"Academic Analysis of '{query}':\n\n"
        
        # Add key points with academic framing
        for i, point in enumerate(key_points, 1):
            answer += f"Finding {i}: {point}\n"
        
        # Add contradictions as limitations
        if contradictions:
            answer += "\nLimitations and Conflicting Evidence:\n"
            for contradiction in contradictions:
                answer += f"- {contradiction}\n"
        
        answer += "\nFurther research may be needed to resolve these discrepancies."
        
        return answer
    
    def _calculate_confidence(
        self, 
        sources: List[SourceAnalysis], 
        contradictions: List[str]
    ) -> float:
        """Calculate confidence score for the answer"""
        if not sources:
            return 0.0
        
        # Base confidence from source quality
        avg_credibility = sum(
            1.0 if s.credibility == SourceCredibility.HIGH else
            0.7 if s.credibility == SourceCredibility.MEDIUM else
            0.3 if s.credibility == SourceCredibility.LOW else 0.5
            for s in sources
        ) / len(sources)
        
        # Average relevance
        avg_relevance = sum(s.relevance_score for s in sources) / len(sources)
        
        # Penalty for contradictions
        contradiction_penalty = min(len(contradictions) * 0.1, 0.3)
        
        # Calculate final confidence
        confidence = (avg_credibility * 0.6 + avg_relevance * 0.4) - contradiction_penalty
        
        return max(0.0, min(1.0, confidence))
