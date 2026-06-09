"""
Fact-Checking Agent - Specialized for verifying claims and detecting misinformation

Provides comprehensive fact-checking capabilities with source verification,
claim analysis, and credibility assessment.
"""

import asyncio
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import re
import time
from collections import defaultdict

from .base import BaseAgent, AgentConfig, AgentResponse, QueryType
from .intelligence import IntelligenceProcessor, SourceAnalysis, SourceCredibility
from ..base import SearchResponse, SearchResult, SearchType


class ClaimStatus(Enum):
    TRUE = "true"
    MOSTLY_TRUE = "mostly_true"
    HALF_TRUE = "half_true"
    MOSTLY_FALSE = "mostly_false"
    FALSE = "false"
    UNVERIFIABLE = "unverifiable"
    MISLEADING = "misleading"


@dataclass
class ClaimAnalysis:
    """Analysis of a specific claim"""
    claim: str
    status: ClaimStatus
    confidence: float
    supporting_evidence: List[str]
    contradicting_evidence: List[str]
    context: str
    sources: List[SearchResult]
    explanation: str


@dataclass
class SourceCredibilityAssessment:
    """Detailed assessment of source credibility"""
    source: SearchResult
    overall_credibility: SourceCredibility
    factual_accuracy: float  # 0-1
    bias_score: float  # 0-1 (0=unbiased, 1=highly biased)
    expertise_level: float  # 0-1
    fact_checking_history: float  # 0-1
    verification_methods: List[str]


@dataclass
class FactCheckReport:
    """Comprehensive fact-checking report"""
    original_claim: str
    claim_analysis: ClaimAnalysis
    source_assessments: List[SourceCredibilityAssessment]
    methodology: str
    limitations: List[str]
    additional_context: str
    verification_confidence: float


class FactCheckAgent(BaseAgent):
    """Specialized agent for fact-checking and claim verification"""
    
    def __init__(self, search_config: Dict[str, Any], agent_config: AgentConfig):
        super().__init__(search_config, agent_config)
        self.intelligence_processor = IntelligenceProcessor()
        self.fact_checking_sources = self._load_fact_checking_sources()
        self.misinformation_patterns = self._load_misinformation_patterns()
        self.verification_keywords = self._load_verification_keywords()
        
    def _load_fact_checking_sources(self) -> List[str]:
        """Load list of reputable fact-checking organizations"""
        return [
            "snopes.com",
            "factcheck.org",
            "politifact.com",
            "washingtonpost.com/fact-checker",
            "apnews.com/hub/fact-checking",
            "reuters.com/fact-check",
            "bbc.com/news/reality_check",
            "fullfact.org",
            "factcheck.afp.com",
            "checkyourfact.com",
            "sciencemag.org",
            "nature.com",
            "cdc.gov",
            "who.int",
            "nih.gov"
        ]
    
    def _load_misinformation_patterns(self) -> Dict[str, List[str]]:
        """Load patterns commonly found in misinformation"""
        return {
            "emotional_language": [
                "shocking", "unbelievable", "incredible", "amazing",
                "terrifying", "horrifying", "outrageous", "disgusting"
            ],
            "absolute_claims": [
                "always", "never", "everyone", "nobody", "all", "none",
                "impossible", "certain", "guaranteed", "proven"
            ],
            "conspiracy_indicators": [
                "they don't want you to know", "the truth is", "wake up",
                "sheeple", "mainstream media", "cover up", "hidden"
            ],
            "sources_attacks": [
                "fake news", "mainstream media", "liberal media",
                "conservative media", "biased", "propaganda"
            ],
            "urgency_tactics": [
                "breaking", "urgent", "immediate", "right now",
                "don't wait", "act now", "limited time"
            ]
        }
    
    def _load_verification_keywords(self) -> List[str]:
        """Load keywords that indicate verifiable claims"""
        return [
            "study shows", "research indicates", "according to",
            "data reveals", "evidence suggests", "statistics show",
            "survey found", "analysis demonstrates", "report states",
            "experts say", "scientists confirm", "researchers found"
        ]
    
    async def _synthesize_answer(
        self, 
        query: str, 
        search_results: SearchResponse, 
        query_type: QueryType
    ) -> Tuple[str, float]:
        """Synthesize comprehensive fact-checking answer"""
        
        # Extract claim from query
        claim = self._extract_claim(query)
        
        # Analyze sources for credibility
        source_analyses = await self.intelligence_processor.analyze_sources(search_results)
        
        # Assess source credibility for fact-checking
        credibility_assessments = await self._assess_source_credibility(source_analyses)
        
        # Analyze the claim
        claim_analysis = await self._analyze_claim(claim, credibility_assessments)
        
        # Create comprehensive fact-check report
        report = await self._create_fact_check_report(claim, claim_analysis, credibility_assessments)
        
        # Format fact-check response
        response = self._format_fact_check_response(report)
        
        # Calculate overall confidence
        confidence = self._calculate_fact_check_confidence(report)
        
        return response, confidence
    
    def _extract_claim(self, query: str) -> str:
        """Extract the claim to be fact-checked from the query"""
        # Remove fact-checking prefixes
        prefixes = [
            "fact check", "verify", "is it true that", "is it really",
            "claim that", "statement that", "assertion that"
        ]
        
        claim = query.lower()
        for prefix in prefixes:
            if claim.startswith(prefix):
                claim = claim[len(prefix):].strip()
                break
        
        # Remove question words
        question_words = ["is", "are", "was", "were", "do", "does", "did", "will", "would", "could", "should"]
        for word in question_words:
            if claim.startswith(word + " "):
                claim = claim[len(word):].strip()
                break
        
        # Clean up
        claim = claim.strip("?!. ")
        
        return claim if claim else query
    
    async def _assess_source_credibility(self, sources: List[SourceAnalysis]) -> List[SourceCredibilityAssessment]:
        """Assess sources specifically for fact-checking purposes"""
        assessments = []
        
        for analysis in sources:
            assessment = await self._create_credibility_assessment(analysis)
            assessments.append(assessment)
        
        # Sort by overall credibility
        assessments.sort(
            key=lambda a: (
                1.0 if a.overall_credibility == SourceCredibility.HIGH else
                0.7 if a.overall_credibility == SourceCredibility.MEDIUM else
                0.3
            ),
            reverse=True
        )
        
        return assessments
    
    async def _create_credibility_assessment(self, analysis: SourceAnalysis) -> SourceCredibilityAssessment:
        """Create detailed credibility assessment for a source"""
        source = analysis.source
        
        # Check if it's a known fact-checking source
        is_fact_checking_source = any(
            domain in source.url.lower() 
            for domain in self.fact_checking_sources
        )
        
        # Assess factual accuracy
        factual_accuracy = self._assess_factual_accuracy(source, analysis)
        
        # Assess bias
        bias_score = analysis.bias_score
        
        # Assess expertise level
        expertise_level = self._assess_expertise_level(source, analysis)
        
        # Assess fact-checking history
        fact_checking_history = self._assess_fact_checking_history(source)
        
        # Determine verification methods
        verification_methods = self._identify_verification_methods(source)
        
        # Overall credibility
        if is_fact_checking_source and analysis.credibility == SourceCredibility.HIGH:
            overall_credibility = SourceCredibility.HIGH
        elif analysis.credibility == SourceCredibility.MEDIUM and expertise_level > 0.6:
            overall_credibility = SourceCredibility.MEDIUM
        else:
            overall_credibility = analysis.credibility
        
        return SourceCredibilityAssessment(
            source=source,
            overall_credibility=overall_credibility,
            factual_accuracy=factual_accuracy,
            bias_score=bias_score,
            expertise_level=expertise_level,
            fact_checking_history=fact_checking_history,
            verification_methods=verification_methods
        )
    
    def _assess_factual_accuracy(self, source: SearchResult, analysis: SourceAnalysis) -> float:
        """Assess the factual accuracy of a source"""
        accuracy_score = 0.5  # Base score
        
        # Boost for fact-checking sources
        if any(domain in source.url.lower() for domain in self.fact_checking_sources):
            accuracy_score += 0.3
        
        # Boost for academic/government sources
        if any(domain in source.url.lower() for domain in ["edu", "gov", "org"]):
            accuracy_score += 0.2
        
        # Check for verification keywords
        text = (source.title + " " + source.snippet).lower()
        verification_count = sum(1 for keyword in self.verification_keywords if keyword in text)
        accuracy_score += min(verification_count * 0.05, 0.2)
        
        # Check for misinformation patterns
        misinformation_count = sum(
            1 for patterns in self.misinformation_patterns.values()
            for pattern in patterns if pattern in text
        )
        accuracy_score -= min(misinformation_count * 0.1, 0.3)
        
        return max(0.0, min(1.0, accuracy_score))
    
    def _assess_expertise_level(self, source: SearchResult, analysis: SourceAnalysis) -> float:
        """Assess the expertise level of a source"""
        expertise_score = 0.5  # Base score
        
        # Check for expertise indicators
        text = (source.title + " " + source.snippet).lower()
        expertise_indicators = [
            "expert", "specialist", "researcher", "scientist", "doctor",
            "professor", "phd", "md", "study", "research", "analysis",
            "peer-reviewed", "journal", "academic", "institution"
        ]
        
        expertise_count = sum(1 for indicator in expertise_indicators if indicator in text)
        expertise_score += min(expertise_count * 0.1, 0.4)
        
        # Boost for academic domains
        if any(domain in source.url.lower() for domain in ["edu", "nature.com", "science.org"]):
            expertise_score += 0.2
        
        return max(0.0, min(1.0, expertise_score))
    
    def _assess_fact_checking_history(self, source: SearchResult) -> float:
        """Assess the source's fact-checking history"""
        # Simplified assessment based on source type
        if any(domain in source.url.lower() for domain in self.fact_checking_sources):
            return 0.9  # High fact-checking history
        
        if any(domain in source.url.lower() for domain in ["reuters.com", "ap.org", "bbc.com"]):
            return 0.7  # Good fact-checking history
        
        if any(domain in source.url.lower() for domain in ["edu", "gov", "nature.com"]):
            return 0.6  # Moderate fact-checking history
        
        return 0.3  # Unknown or low fact-checking history
    
    def _identify_verification_methods(self, source: SearchResult) -> List[str]:
        """Identify verification methods used by the source"""
        methods = []
        text = (source.title + " " + source.snippet).lower()
        
        method_keywords = {
            "data_analysis": ["data", "statistics", "analysis", "numbers"],
            "expert_review": ["expert", "specialist", "review", "panel"],
            "scientific_study": ["study", "research", "experiment", "clinical"],
            "fact_checking": ["fact check", "verify", "investigate", "examine"],
            "source_documentation": ["sources", "citations", "references", "documents"],
            "eyewitness_accounts": ["eyewitness", "testimony", "witness", "saw"]
        }
        
        for method, keywords in method_keywords.items():
            if any(keyword in text for keyword in keywords):
                methods.append(method)
        
        return methods if methods else ["unspecified"]
    
    async def _analyze_claim(
        self, 
        claim: str, 
        credibility_assessments: List[SourceCredibilityAssessment]
    ) -> ClaimAnalysis:
        """Analyze the claim based on source assessments"""
        
        # Separate supporting and contradicting evidence
        supporting_evidence = []
        contradicting_evidence = []
        supporting_sources = []
        contradicting_sources = []
        
        for assessment in credibility_assessments:
            source_text = assessment.source.snippet.lower()
            
            # Simple sentiment analysis for supporting/contradicting
            if self._is_supporting_evidence(claim, source_text):
                supporting_evidence.append(assessment.source.snippet)
                supporting_sources.append(assessment.source)
            elif self._is_contradicting_evidence(claim, source_text):
                contradicting_evidence.append(assessment.source.snippet)
                contradicting_sources.append(assessment.source)
        
        # Determine claim status
        status = self._determine_claim_status(
            supporting_sources, contradicting_sources, credibility_assessments
        )
        
        # Calculate confidence
        confidence = self._calculate_claim_confidence(
            status, supporting_sources, contradicting_sources, credibility_assessments
        )
        
        # Generate explanation
        explanation = self._generate_claim_explanation(
            claim, status, supporting_evidence, contradicting_evidence
        )
        
        # Extract context
        context = self._extract_claim_context(claim, credibility_assessments)
        
        return ClaimAnalysis(
            claim=claim,
            status=status,
            confidence=confidence,
            supporting_evidence=supporting_evidence,
            contradicting_evidence=contradicting_evidence,
            context=context,
            sources=supporting_sources + contradicting_sources,
            explanation=explanation
        )
    
    def _is_supporting_evidence(self, claim: str, source_text: str) -> bool:
        """Determine if source text supports the claim"""
        claim_words = set(claim.lower().split())
        source_words = set(source_text.split())
        
        # Check for agreement indicators
        agreement_indicators = [
            "confirms", "supports", "agrees", "validates", "proves",
            "shows", "demonstrates", "indicates", "reveals", "finds"
        ]
        
        # Check for disagreement indicators
        disagreement_indicators = [
            "disproves", "contradicts", "refutes", "debunks", "false",
            "incorrect", "wrong", "myth", "misinformation", "untrue"
        ]
        
        has_agreement = any(indicator in source_text for indicator in agreement_indicators)
        has_disagreement = any(indicator in source_text for indicator in disagreement_indicators)
        
        if has_disagreement:
            return False
        elif has_agreement:
            return True
        
        # Default: check word overlap
        overlap = len(claim_words.intersection(source_words))
        return overlap >= len(claim_words) * 0.5  # At least 50% word overlap
    
    def _is_contradicting_evidence(self, claim: str, source_text: str) -> bool:
        """Determine if source text contradicts the claim"""
        disagreement_indicators = [
            "disproves", "contradicts", "refutes", "debunks", "false",
            "incorrect", "wrong", "myth", "misinformation", "untrue",
            "not true", "never happened", "fabricated", "hoax"
        ]
        
        return any(indicator in source_text for indicator in disagreement_indicators)
    
    def _determine_claim_status(
        self, 
        supporting_sources: List[SearchResult], 
        contradicting_sources: List[SearchResult],
        all_assessments: List[SourceCredibilityAssessment]
    ) -> ClaimStatus:
        """Determine the status of the claim"""
        
        # Count high-credibility sources
        high_cred_supporting = sum(
            1 for s in supporting_sources
            if any(a.source.url == s.url and a.overall_credibility == SourceCredibility.HIGH 
                  for a in all_assessments)
        )
        
        high_cred_contradicting = sum(
            1 for s in contradicting_sources
            if any(a.source.url == s.url and a.overall_credibility == SourceCredibility.HIGH 
                  for a in all_assessments)
        )
        
        # Determine status based on evidence balance
        if high_cred_supporting > high_cred_contradicting + 1:
            if len(supporting_sources) >= 3:
                return ClaimStatus.TRUE
            else:
                return ClaimStatus.MOSTLY_TRUE
        elif high_cred_contradicting > high_cred_supporting + 1:
            if len(contradicting_sources) >= 3:
                return ClaimStatus.FALSE
            else:
                return ClaimStatus.MOSTLY_FALSE
        elif high_cred_supporting == high_cred_contradicting:
            if high_cred_supporting > 0:
                return ClaimStatus.HALF_TRUE
            else:
                return ClaimStatus.UNVERIFIABLE
        else:
            # Mixed evidence with some credibility
            return ClaimStatus.MISLEADING
    
    def _calculate_claim_confidence(
        self, 
        status: ClaimStatus, 
        supporting_sources: List[SearchResult], 
        contradicting_sources: List[SearchResult],
        all_assessments: List[SourceCredibilityAssessment]
    ) -> float:
        """Calculate confidence in the claim assessment"""
        
        # Base confidence by status
        status_confidence = {
            ClaimStatus.TRUE: 0.9,
            ClaimStatus.MOSTLY_TRUE: 0.7,
            ClaimStatus.HALF_TRUE: 0.5,
            ClaimStatus.MOSTLY_FALSE: 0.7,
            ClaimStatus.FALSE: 0.9,
            ClaimStatus.MISLEADING: 0.6,
            ClaimStatus.UNVERIFIABLE: 0.3
        }
        
        base_confidence = status_confidence.get(status, 0.5)
        
        # Adjust based on source quality
        high_cred_count = sum(1 for a in all_assessments if a.overall_credibility == SourceCredibility.HIGH)
        total_sources = len(all_assessments)
        
        if total_sources > 0:
            quality_boost = (high_cred_count / total_sources) * 0.2
            base_confidence += quality_boost
        
        # Adjust based on evidence volume
        total_evidence = len(supporting_sources) + len(contradicting_sources)
        if total_evidence >= 5:
            base_confidence += 0.1
        elif total_evidence < 2:
            base_confidence -= 0.2
        
        return max(0.1, min(1.0, base_confidence))
    
    def _generate_claim_explanation(
        self, 
        claim: str, 
        status: ClaimStatus, 
        supporting_evidence: List[str], 
        contradicting_evidence: List[str]
    ) -> str:
        """Generate explanation for the claim assessment"""
        
        status_explanations = {
            ClaimStatus.TRUE: "Multiple credible sources confirm this claim as accurate.",
            ClaimStatus.MOSTLY_TRUE: "This claim is largely accurate, though some details may be nuanced.",
            ClaimStatus.HALF_TRUE: "This claim contains elements of truth but is incomplete or misleading.",
            ClaimStatus.MOSTLY_FALSE: "This claim is mostly inaccurate with limited factual basis.",
            ClaimStatus.FALSE: "Multiple credible sources contradict this claim.",
            ClaimStatus.MISLEADING: "This claim uses elements of truth but presents them in a misleading way.",
            ClaimStatus.UNVERIFIABLE: "Insufficient credible evidence was found to verify this claim."
        }
        
        explanation = status_explanations.get(status, "Unable to determine claim status.")
        
        # Add evidence summary
        if supporting_evidence:
            explanation += f" Found {len(supporting_evidence)} supporting sources."
        
        if contradicting_evidence:
            explanation += f" Found {len(contradicting_evidence)} contradicting sources."
        
        return explanation
    
    def _extract_claim_context(self, claim: str, assessments: List[SourceCredibilityAssessment]) -> str:
        """Extract relevant context for the claim"""
        contexts = []
        
        for assessment in assessments[:5]:  # Top 5 sources
            # Extract relevant context from source
            context_snippet = assessment.source.snippet
            if len(context_snippet) > 100:
                context_snippet = context_snippet[:100] + "..."
            contexts.append(context_snippet)
        
        return " | ".join(contexts) if contexts else "No additional context available."
    
    async def _create_fact_check_report(
        self, 
        claim: str, 
        claim_analysis: ClaimAnalysis, 
        credibility_assessments: List[SourceCredibilityAssessment]
    ) -> FactCheckReport:
        """Create comprehensive fact-check report"""
        
        # Methodology
        methodology = self._generate_methodology(credibility_assessments)
        
        # Limitations
        limitations = self._identify_limitations(credibility_assessments, claim_analysis)
        
        # Additional context
        additional_context = self._generate_additional_context(claim, credibility_assessments)
        
        # Verification confidence
        verification_confidence = self._calculate_verification_confidence(
            claim_analysis, credibility_assessments
        )
        
        return FactCheckReport(
            original_claim=claim,
            claim_analysis=claim_analysis,
            source_assessments=credibility_assessments,
            methodology=methodology,
            limitations=limitations,
            additional_context=additional_context,
            verification_confidence=verification_confidence
        )
    
    def _generate_methodology(self, assessments: List[SourceCredibilityAssessment]) -> str:
        """Generate description of fact-checking methodology"""
        methodology = "This fact-check was conducted by:\n"
        
        # Count source types
        fact_checking_sources = sum(1 for a in assessments if "fact check" in a.verification_methods)
        academic_sources = sum(1 for a in assessments if a.expertise_level > 0.7)
        expert_sources = sum(1 for a in assessments if "expert_review" in a.verification_methods)
        
        if fact_checking_sources > 0:
            methodology += f"• Analyzing {fact_checking_sources} dedicated fact-checking sources\n"
        
        if academic_sources > 0:
            methodology += f"• Reviewing {academic_sources} academic and research sources\n"
        
        if expert_sources > 0:
            methodology += f"• Consulting {expert_sources} expert-reviewed sources\n"
        
        methodology += "• Assessing source credibility and potential bias\n"
        methodology += "• Cross-referencing claims across multiple independent sources"
        
        return methodology
    
    def _identify_limitations(
        self, 
        assessments: List[SourceCredibilityAssessment], 
        claim_analysis: ClaimAnalysis
    ) -> List[str]:
        """Identify limitations in the fact-check"""
        limitations = []
        
        # Source limitations
        if len(assessments) < 3:
            limitations.append("Limited number of sources available for verification")
        
        high_credibility_count = sum(1 for a in assessments if a.overall_credibility == SourceCredibility.HIGH)
        if high_credibility_count < 2:
            limitations.append("Few high-credibility sources found")
        
        # Evidence limitations
        if not claim_analysis.supporting_evidence and not claim_analysis.contradicting_evidence:
            limitations.append("No direct evidence found to support or contradict the claim")
        
        # Recency limitations
        # Simplified - would check publication dates in real implementation
        limitations.append("Source recency was not fully analyzed")
        
        if not limitations:
            limitations.append("No significant limitations identified")
        
        return limitations
    
    def _generate_additional_context(
        self, 
        claim: str, 
        assessments: List[SourceCredibilityAssessment]
    ) -> str:
        """Generate additional context for the claim"""
        context = f"Additional context regarding '{claim}':\n\n"
        
        # Look for common themes
        themes = defaultdict(int)
        for assessment in assessments:
            for method in assessment.verification_methods:
                themes[method] += 1
        
        if themes:
            context += "Verification methods used by sources include:\n"
            for method, count in themes.items():
                context += f"• {method.replace('_', ' ').title()}: {count} sources\n"
        
        return context
    
    def _calculate_verification_confidence(
        self, 
        claim_analysis: ClaimAnalysis, 
        assessments: List[SourceCredibilityAssessment]
    ) -> float:
        """Calculate overall confidence in the verification"""
        
        # Base confidence from claim analysis
        base_confidence = claim_analysis.confidence
        
        # Adjust based on source quality distribution
        high_cred_count = sum(1 for a in assessments if a.overall_credibility == SourceCredibility.HIGH)
        total_count = len(assessments)
        
        if total_count > 0:
            quality_factor = high_cred_count / total_count
            base_confidence = base_confidence * 0.7 + quality_factor * 0.3
        
        return max(0.1, min(1.0, base_confidence))
    
    def _format_fact_check_response(self, report: FactCheckReport) -> str:
        """Format comprehensive fact-check response"""
        response = f"# Fact-Check Report\n\n"
        
        # Original claim
        response += f"## Claim to Verify\n\n"
        response += f"**{report.original_claim}**\n\n"
        
        # Verdict
        status_display = report.claim_analysis.status.value.replace("_", " ").title()
        response += f"## Verdict: {status_display}\n\n"
        response += f"**Confidence: {report.claim_analysis.confidence:.2f}/1.0**\n\n"
        response += f"{report.claim_analysis.explanation}\n\n"
        
        # Evidence
        response += "## Evidence Analysis\n\n"
        
        if report.claim_analysis.supporting_evidence:
            response += "### Supporting Evidence\n\n"
            for i, evidence in enumerate(report.claim_analysis.supporting_evidence[:3], 1):
                response += f"{i}. {evidence}\n"
            response += "\n"
        
        if report.claim_analysis.contradicting_evidence:
            response += "### Contradicting Evidence\n\n"
            for i, evidence in enumerate(report.claim_analysis.contradicting_evidence[:3], 1):
                response += f"{i}. {evidence}\n"
            response += "\n"
        
        # Source credibility
        response += "## Source Credibility Assessment\n\n"
        for assessment in report.source_assessments[:5]:  # Top 5 sources
            response += f"**{assessment.source.title}**\n"
            response += f"- Credibility: {assessment.overall_credibility.value}\n"
            response += f"- Factual Accuracy: {assessment.factual_accuracy:.2f}\n"
            response += f"- Expertise Level: {assessment.expertise_level:.2f}\n"
            response += f"- Verification Methods: {', '.join(assessment.verification_methods)}\n\n"
        
        # Methodology
        response += "## Methodology\n\n"
        response += f"{report.methodology}\n\n"
        
        # Limitations
        response += "## Limitations\n\n"
        for limitation in report.limitations:
            response += f"• {limitation}\n"
        response += "\n"
        
        # Additional context
        response += "## Additional Context\n\n"
        response += f"{report.additional_context}\n\n"
        
        # Overall confidence
        response += f"## Overall Verification Confidence\n\n"
        response += f"**{report.verification_confidence:.2f}/1.0**\n"
        
        return response
    
    def _calculate_fact_check_confidence(self, report: FactCheckReport) -> float:
        """Calculate final confidence score for fact-check response"""
        return report.verification_confidence
