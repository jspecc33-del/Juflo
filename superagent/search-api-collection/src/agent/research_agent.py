"""
Research Agent - Specialized for deep academic and scholarly research

Provides comprehensive research capabilities with multi-query expansion,
source verification, and academic synthesis.
"""

import asyncio
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
import re
import time
from collections import defaultdict

from .base import BaseAgent, AgentConfig, AgentResponse, QueryType
from .intelligence import IntelligenceProcessor, SourceAnalysis, SourceCredibility
from ..base import SearchResponse, SearchResult, SearchType


@dataclass
class ResearchQuery:
    """Expanded research query with variations"""
    original_query: str
    expanded_queries: List[str]
    academic_terms: List[str]
    related_topics: List[str]
    time_filter: Optional[str] = None


@dataclass
class ResearchFinding:
    """Individual research finding with source attribution"""
    finding: str
    source: SearchResult
    credibility: SourceCredibility
    relevance_score: float
    methodology: Optional[str] = None
    sample_size: Optional[str] = None
    publication_year: Optional[int] = None


@dataclass
class ResearchSynthesis:
    """Comprehensive research synthesis"""
    executive_summary: str
    key_findings: List[ResearchFinding]
    methodology_review: str
    limitations: List[str]
    future_research: List[str]
    confidence_assessment: float
    source_quality_distribution: Dict[str, int]


class ResearchAgent(BaseAgent):
    """Specialized agent for academic and scholarly research"""
    
    def __init__(self, search_config: Dict[str, Any], agent_config: AgentConfig):
        super().__init__(search_config, agent_config)
        self.intelligence_processor = IntelligenceProcessor()
        self.academic_keywords = self._load_academic_keywords()
        self.research_databases = self._load_research_databases()
        
    def _load_academic_keywords(self) -> Dict[str, List[str]]:
        """Load academic keywords for query expansion"""
        return {
            "research": [
                "study", "analysis", "investigation", "examination", "research",
                "scholarly", "academic", "peer-reviewed", "journal", "paper",
                "methodology", "findings", "results", "conclusion", "evidence"
            ],
            "medical": [
                "clinical trial", "randomized", "placebo", "treatment", "therapy",
                "diagnosis", "prognosis", "epidemiology", "pharmacology",
                "double-blind", "controlled study", "systematic review", "meta-analysis"
            ],
            "technology": [
                "algorithm", "implementation", "performance", "evaluation",
                "benchmark", "optimization", "efficiency", "scalability",
                "architecture", "framework", "prototype", "validation"
            ],
            "social_science": [
                "survey", "qualitative", "quantitative", "statistical analysis",
                "correlation", "causation", "hypothesis", "experiment",
                "sample", "population", "demographics", "ethnography"
            ]
        }
    
    def _load_research_databases(self) -> List[str]:
        """Load list of academic research databases and sources"""
        return [
            "scholar.google.com",
            "pubmed.ncbi.nlm.nih.gov",
            "arxiv.org",
            "nature.com",
            "science.org",
            "cell.com",
            "nejm.org",
            "thelancet.com",
            "bmj.com",
            "jstor.org",
            "sciencedirect.com",
            "springer.com",
            "ieee.org",
            "acm.org"
        ]
    
    async def _synthesize_answer(
        self, 
        query: str, 
        search_results: SearchResponse, 
        query_type: QueryType
    ) -> Tuple[str, float]:
        """Synthesize comprehensive research answer"""
        
        # Analyze sources for research quality
        source_analyses = await self.intelligence_processor.analyze_sources(search_results)
        
        # Filter for academic sources
        academic_sources = self._filter_academic_sources(source_analyses)
        
        if not academic_sources:
            return "I couldn't find sufficient academic sources for comprehensive research on this topic.", 0.3
        
        # Extract research findings
        findings = await self._extract_research_findings(academic_sources, query)
        
        # Synthesize comprehensive research report
        synthesis = await self._create_research_synthesis(query, findings, academic_sources)
        
        # Format research response
        response = self._format_research_response(synthesis, query)
        
        # Calculate confidence based on source quality
        confidence = self._calculate_research_confidence(academic_sources, synthesis)
        
        return response, confidence
    
    def _filter_academic_sources(self, sources: List[SourceAnalysis]) -> List[SourceAnalysis]:
        """Filter sources for academic credibility"""
        academic_sources = []
        
        for analysis in sources:
            source = analysis.source
            
            # Check for academic domains
            is_academic_domain = any(
                domain in source.url.lower() 
                for domain in self.research_databases
            )
            
            # Check for academic indicators in title/snippet
            text = (source.title + " " + source.snippet).lower()
            academic_indicators = [
                "study", "research", "journal", "paper", "analysis",
                "methodology", "findings", "results", "peer-reviewed"
            ]
            
            has_academic_indicators = any(indicator in text for indicator in academic_indicators)
            
            # Check credibility
            is_credible = analysis.credibility in [SourceCredibility.HIGH, SourceCredibility.MEDIUM]
            
            if (is_academic_domain or has_academic_indicators) and is_credible:
                academic_sources.append(analysis)
        
        return academic_sources
    
    async def _extract_research_findings(
        self, 
        sources: List[SourceAnalysis], 
        query: str
    ) -> List[ResearchFinding]:
        """Extract structured research findings from sources"""
        findings = []
        
        for analysis in sources[:10]:  # Top 10 academic sources
            source = analysis.source
            
            # Extract key findings from the source
            key_sentences = self._extract_key_sentences(source, query)
            
            for sentence in key_sentences:
                finding = ResearchFinding(
                    finding=sentence,
                    source=source,
                    credibility=analysis.credibility,
                    relevance_score=analysis.relevance_score,
                    methodology=self._extract_methodology(source),
                    sample_size=self._extract_sample_size(source),
                    publication_year=self._extract_publication_year(source)
                )
                findings.append(finding)
        
        # Rank findings by relevance and credibility
        findings.sort(
            key=lambda f: (f.relevance_score * 0.6 + (1.0 if f.credibility == SourceCredibility.HIGH else 0.7) * 0.4),
            reverse=True
        )
        
        return findings[:15]  # Top 15 findings
    
    def _extract_key_sentences(self, source: SearchResult, query: str) -> List[str]:
        """Extract key sentences relevant to the research query"""
        text = source.snippet
        if not text:
            return []
        
        # Split into sentences
        sentences = re.split(r'[.!?]+', text)
        query_terms = query.lower().split()
        
        key_sentences = []
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) > 20:  # Minimum length
                # Check relevance to query
                sentence_lower = sentence.lower()
                if any(term in sentence_lower for term in query_terms):
                    key_sentences.append(sentence)
        
        return key_sentences[:3]  # Top 3 sentences per source
    
    def _extract_methodology(self, source: SearchResult) -> Optional[str]:
        """Extract research methodology from source"""
        text = (source.title + " " + source.snippet).lower()
        
        methodologies = [
            "randomized controlled trial", "systematic review", "meta-analysis",
            "cohort study", "case-control", "cross-sectional", "longitudinal",
            "experimental", "observational", "qualitative", "quantitative",
            "survey", "interview", "focus group", "ethnographic"
        ]
        
        for method in methodologies:
            if method in text:
                return method
        
        return None
    
    def _extract_sample_size(self, source: SearchResult) -> Optional[str]:
        """Extract sample size from source"""
        text = source.snippet.lower()
        
        # Look for sample size patterns
        patterns = [
            r'n\s*=\s*(\d+)',
            r'sample\s*of\s*(\d+)',
            r'(\d+)\s*participants',
            r'(\d+)\s*subjects',
            r'(\d+)\s*patients'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(0)
        
        return None
    
    def _extract_publication_year(self, source: SearchResult) -> Optional[int]:
        """Extract publication year from source"""
        text = source.title + " " + source.snippet
        
        # Look for year patterns
        year_patterns = [
            r'\b(202[0-4])\b',  # 2020-2024
            r'\b(201[5-9])\b',  # 2015-2019
            r'\b(200[0-9])\b'   # 2000-2009
        ]
        
        for pattern in year_patterns:
            matches = re.findall(pattern, text)
            if matches:
                # Return the most recent year
                return max(int(year) for year in matches)
        
        return None
    
    async def _create_research_synthesis(
        self, 
        query: str, 
        findings: List[ResearchFinding], 
        sources: List[SourceAnalysis]
    ) -> ResearchSynthesis:
        """Create comprehensive research synthesis"""
        
        # Executive summary
        executive_summary = self._generate_executive_summary(query, findings)
        
        # Methodology review
        methodology_review = self._analyze_methodologies(findings)
        
        # Identify limitations
        limitations = self._identify_limitations(findings, sources)
        
        # Suggest future research
        future_research = self._suggest_future_research(query, findings)
        
        # Assess confidence
        confidence_assessment = self._calculate_overall_confidence(findings, sources)
        
        # Source quality distribution
        source_quality_distribution = self._analyze_source_distribution(sources)
        
        return ResearchSynthesis(
            executive_summary=executive_summary,
            key_findings=findings[:10],  # Top 10 findings
            methodology_review=methodology_review,
            limitations=limitations,
            future_research=future_research,
            confidence_assessment=confidence_assessment,
            source_quality_distribution=source_quality_distribution
        )
    
    def _generate_executive_summary(self, query: str, findings: List[ResearchFinding]) -> str:
        """Generate executive summary of research findings"""
        if not findings:
            return "No significant research findings were identified for this query."
        
        # Group findings by theme
        themes = self._group_findings_by_theme(findings)
        
        summary = f"Research on '{query}' reveals several key findings:\n\n"
        
        for theme, theme_findings in themes.items():
            summary += f"• {theme}: "
            if theme_findings:
                top_finding = theme_findings[0].finding
                summary += top_finding + "\n"
            else:
                summary += "Limited evidence found.\n"
        
        # Add overall assessment
        high_credibility_count = sum(
            1 for f in findings if f.credibility == SourceCredibility.HIGH
        )
        
        if high_credibility_count >= 3:
            summary += f"\nThe evidence is based on {high_credibility_count} high-credibility academic sources."
        else:
            summary += f"\nThe evidence is limited, with only {high_credibility_count} high-credibility sources found."
        
        return summary
    
    def _group_findings_by_theme(self, findings: List[ResearchFinding]) -> Dict[str, List[ResearchFinding]]:
        """Group findings by thematic categories"""
        themes = defaultdict(list)
        
        for finding in findings:
            text = finding.finding.lower()
            
            # Simple theme classification
            if any(word in text for word in ["effective", "efficacy", "works", "successful"]):
                themes["Effectiveness"].append(finding)
            elif any(word in text for word in ["safe", "safety", "risk", "adverse", "side effect"]):
                themes["Safety"].append(finding)
            elif any(word in text for word in ["cost", "economic", "affordable", "expensive"]):
                themes["Economic Impact"].append(finding)
            elif any(word in text for word in ["implement", "practice", "application", "use"]):
                themes["Implementation"].append(finding)
            else:
                themes["General Findings"].append(finding)
        
        return dict(themes)
    
    def _analyze_methodologies(self, findings: List[ResearchFinding]) -> str:
        """Analyze research methodologies used"""
        methodologies = [f.methodology for f in findings if f.methodology]
        
        if not methodologies:
            return "Methodology information was not available in the sources."
        
        # Count methodology types
        method_counts = defaultdict(int)
        for method in methodologies:
            method_counts[method] += 1
        
        review = "Research methodologies identified include:\n"
        for method, count in method_counts.items():
            review += f"• {method}: {count} studies\n"
        
        # Assess methodological quality
        high_quality_methods = [
            "randomized controlled trial", "systematic review", "meta-analysis"
        ]
        high_quality_count = sum(
            count for method, count in method_counts.items()
            if any(hq in method for hq in high_quality_methods)
        )
        
        if high_quality_count >= 2:
            review += f"\nThe research base includes {high_quality_count} high-quality studies."
        else:
            review += "\nThe research base relies primarily on observational or lower-quality evidence."
        
        return review
    
    def _identify_limitations(self, findings: List[ResearchFinding], sources: List[SourceAnalysis]) -> List[str]:
        """Identify research limitations"""
        limitations = []
        
        # Source limitations
        if len(sources) < 5:
            limitations.append("Limited number of academic sources identified")
        
        # Recency limitations
        recent_studies = sum(
            1 for f in findings 
            if f.publication_year and f.publication_year >= 2020
        )
        
        if recent_studies < len(findings) // 2:
            limitations.append("Many sources are not recent, may not reflect current understanding")
        
        # Methodology limitations
        high_quality_methods = ["randomized controlled trial", "systematic review", "meta-analysis"]
        high_quality_count = sum(
            1 for f in findings 
            if f.methodology and any(hq in f.methodology for hq in high_quality_methods)
        )
        
        if high_quality_count < len(findings) // 3:
            limitations.append("Limited number of high-quality research methodologies")
        
        # Sample size limitations
        small_studies = sum(
            1 for f in findings 
            if f.sample_size and any(size in f.sample_size.lower() for size in ["<", "small", "limited"])
        )
        
        if small_studies > len(findings) // 2:
            limitations.append("Many studies may have limited sample sizes")
        
        if not limitations:
            limitations.append("No significant limitations identified in the available research")
        
        return limitations
    
    def _suggest_future_research(self, query: str, findings: List[ResearchFinding]) -> List[str]:
        """Suggest directions for future research"""
        suggestions = []
        
        # Based on gaps in findings
        if len(findings) < 10:
            suggestions.append("More comprehensive research needed to establish robust evidence")
        
        # Based on methodology gaps
        methodologies = [f.methodology for f in findings if f.methodology]
        if "randomized controlled trial" not in " ".join(methodologies):
            suggestions.append("Randomized controlled trials needed to establish causality")
        
        # Based on recency
        recent_studies = sum(
            1 for f in findings 
            if f.publication_year and f.publication_year >= 2022
        )
        
        if recent_studies < 3:
            suggestions.append("More recent studies needed to reflect current developments")
        
        # General suggestions
        suggestions.extend([
            "Larger sample sizes needed to improve statistical power",
            "Long-term follow-up studies to assess sustained effects",
            "Cross-cultural research to generalize findings"
        ])
        
        return suggestions[:5]  # Top 5 suggestions
    
    def _calculate_overall_confidence(
        self, 
        findings: List[ResearchFinding], 
        sources: List[SourceAnalysis]
    ) -> float:
        """Calculate overall confidence in research synthesis"""
        if not findings:
            return 0.0
        
        # Source quality score
        high_credibility_count = sum(
            1 for s in sources if s.credibility == SourceCredibility.HIGH
        )
        source_quality_score = high_credibility_count / len(sources)
        
        # Finding consistency score
        # Simplified: check if findings are generally aligned
        consistency_score = 0.7  # Placeholder for consistency analysis
        
        # Methodology quality score
        high_quality_methods = ["randomized controlled trial", "systematic review", "meta-analysis"]
        high_quality_count = sum(
            1 for f in findings 
            if f.methodology and any(hq in f.methodology for hq in high_quality_methods)
        )
        methodology_score = high_quality_count / len(findings) if findings else 0
        
        # Recency score
        recent_count = sum(
            1 for f in findings 
            if f.publication_year and f.publication_year >= 2020
        )
        recency_score = recent_count / len(findings) if findings else 0
        
        # Weighted overall confidence
        overall_confidence = (
            source_quality_score * 0.4 +
            consistency_score * 0.2 +
            methodology_score * 0.3 +
            recency_score * 0.1
        )
        
        return min(1.0, max(0.0, overall_confidence))
    
    def _analyze_source_distribution(self, sources: List[SourceAnalysis]) -> Dict[str, int]:
        """Analyze distribution of source types"""
        distribution = defaultdict(int)
        
        for analysis in sources:
            source = analysis.source
            
            # Categorize by credibility
            distribution[f"credibility_{analysis.credibility.value}"] += 1
            
            # Categorize by source type
            if any(domain in source.url.lower() for domain in self.research_databases):
                distribution["academic_database"] += 1
            elif "edu" in source.url.lower():
                distribution["educational"] += 1
            elif "gov" in source.url.lower():
                distribution["government"] += 1
            else:
                distribution["other"] += 1
        
        return dict(distribution)
    
    def _format_research_response(self, synthesis: ResearchSynthesis, query: str) -> str:
        """Format comprehensive research response"""
        response = f"# Research Report: {query}\n\n"
        
        # Executive Summary
        response += "## Executive Summary\n\n"
        response += synthesis.executive_summary + "\n\n"
        
        # Key Findings
        response += "## Key Findings\n\n"
        for i, finding in enumerate(synthesis.key_findings, 1):
            response += f"{i}. **{finding.finding}**\n"
            response += f"   - Source: {finding.source.title}\n"
            response += f"   - Credibility: {finding.credibility.value}\n"
            if finding.methodology:
                response += f"   - Methodology: {finding.methodology}\n"
            if finding.sample_size:
                response += f"   - Sample Size: {finding.sample_size}\n"
            response += "\n"
        
        # Methodology Review
        response += "## Research Methodology Analysis\n\n"
        response += synthesis.methodology_review + "\n\n"
        
        # Limitations
        response += "## Research Limitations\n\n"
        for limitation in synthesis.limitations:
            response += f"• {limitation}\n"
        response += "\n"
        
        # Future Research
        response += "## Suggestions for Future Research\n\n"
        for suggestion in synthesis.future_research:
            response += f"• {suggestion}\n"
        response += "\n"
        
        # Confidence Assessment
        response += f"## Overall Confidence Assessment\n\n"
        response += f"Confidence in this research synthesis: {synthesis.confidence_assessment:.2f}/1.0\n\n"
        
        # Source Distribution
        response += "## Source Quality Distribution\n\n"
        for category, count in synthesis.source_quality_distribution.items():
            response += f"• {category.replace('_', ' ').title()}: {count}\n"
        
        return response
    
    def _calculate_research_confidence(
        self, 
        academic_sources: List[SourceAnalysis], 
        synthesis: ResearchSynthesis
    ) -> float:
        """Calculate final confidence score for research response"""
        if not academic_sources:
            return 0.3
        
        # Base confidence from synthesis
        base_confidence = synthesis.confidence_assessment
        
        # Boost for multiple high-quality sources
        high_quality_count = sum(
            1 for s in academic_sources if s.credibility == SourceCredibility.HIGH
        )
        
        if high_quality_count >= 5:
            boost = 0.2
        elif high_quality_count >= 3:
            boost = 0.1
        else:
            boost = 0.0
        
        return min(1.0, base_confidence + boost)
