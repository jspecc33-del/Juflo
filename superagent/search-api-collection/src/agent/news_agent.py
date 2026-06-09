"""
News Agent - Specialized for current events and news gathering

Provides comprehensive news search capabilities with source verification,
trending topics detection, and event analysis.
"""

import asyncio
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta

from .base import BaseAgent, AgentConfig, AgentResponse, QueryType
from .intelligence import IntelligenceProcessor, SourceAnalysis, SourceCredibility
from ..base import SearchResponse, SearchResult, SearchType


class NewsCategory(Enum):
    POLITICS = "politics"
    TECHNOLOGY = "technology"
    BUSINESS = "business"
    SCIENCE = "science"
    HEALTH = "health"
    SPORTS = "sports"
    ENTERTAINMENT = "entertainment"
    WORLD = "world"
    LOCAL = "local"
    BREAKING = "breaking"


@dataclass
class NewsArticle:
    """Enhanced news article representation"""
    title: str
    url: str
    content: str
    source: str
    author: Optional[str]
    publish_date: Optional[datetime]
    category: NewsCategory
    credibility_score: float
    bias_score: float
    key_entities: List[str]
    summary: str


@dataclass
class TrendingTopic:
    """Information about a trending news topic"""
    topic: str
    mention_count: int
    sources_covering: List[str]
    time_period: str
    related_keywords: List[str]
    sentiment_score: float  # -1 to 1
    geographic_focus: Optional[str]


@dataclass
class NewsAnalysis:
    """Comprehensive news analysis"""
    main_articles: List[NewsArticle]
    trending_topics: List[TrendingTopic]
    source_diversity: Dict[str, int]
    time_distribution: Dict[str, int]
    geographic_distribution: Dict[str, int]
    sentiment_analysis: Dict[str, float]
    credibility_assessment: float


class NewsAgent(BaseAgent):
    """Specialized agent for news and current events"""
    
    def __init__(self, search_config: Dict[str, Any], agent_config: AgentConfig):
        super().__init__(search_config, agent_config)
        self.intelligence_processor = IntelligenceProcessor()
        self.news_sources = self._load_news_sources()
        self.news_keywords = self._load_news_keywords()
        self.regional_indicators = self._load_regional_indicators()
        
    def _load_news_sources(self) -> Dict[str, Dict[str, Any]]:
        """Load reputable news sources with their characteristics"""
        return {
            "reuters.com": {
                "credibility": 0.9,
                "bias": 0.1,  # Low bias
                "categories": ["world", "business", "politics", "technology"],
                "international": True
            },
            "ap.org": {
                "credibility": 0.9,
                "bias": 0.1,
                "categories": ["world", "politics", "breaking"],
                "international": True
            },
            "bbc.com": {
                "credibility": 0.85,
                "bias": 0.15,
                "categories": ["world", "politics", "technology", "health"],
                "international": True
            },
            "npr.org": {
                "credibility": 0.85,
                "bias": 0.2,
                "categories": ["politics", "health", "science", "local"],
                "international": False
            },
            "wsj.com": {
                "credibility": 0.8,
                "bias": 0.3,
                "categories": ["business", "politics", "technology"],
                "international": True
            },
            "nytimes.com": {
                "credibility": 0.8,
                "bias": 0.25,
                "categories": ["world", "politics", "business", "technology"],
                "international": True
            },
            "washingtonpost.com": {
                "credibility": 0.8,
                "bias": 0.3,
                "categories": ["politics", "world", "technology"],
                "international": True
            },
            "cnn.com": {
                "credibility": 0.75,
                "bias": 0.35,
                "categories": ["politics", "world", "breaking"],
                "international": True
            },
            "foxnews.com": {
                "credibility": 0.7,
                "bias": 0.5,
                "categories": ["politics", "world", "breaking"],
                "international": False
            }
        }
    
    def _load_news_keywords(self) -> Dict[NewsCategory, List[str]]:
        """Load keywords for news categorization"""
        return {
            NewsCategory.POLITICS: [
                "election", "government", "president", "congress", "senate",
                "policy", "political", "vote", "campaign", "democrat", "republican"
            ],
            NewsCategory.TECHNOLOGY: [
                "tech", "technology", "software", "hardware", "ai", "artificial intelligence",
                "startup", "innovation", "digital", "cybersecurity", "data breach"
            ],
            NewsCategory.BUSINESS: [
                "economy", "market", "stocks", "finance", "economic", "business",
                "company", "corporation", "investment", "trade", "commerce"
            ],
            NewsCategory.SCIENCE: [
                "research", "study", "scientific", "science", "discovery",
                "experiment", "breakthrough", "innovation", "space", "climate"
            ],
            NewsCategory.HEALTH: [
                "health", "medical", "medicine", "disease", "treatment",
                "hospital", "patient", "healthcare", "vaccine", "pandemic"
            ],
            NewsCategory.SPORTS: [
                "sport", "game", "team", "player", "match", "championship",
                "league", "athlete", "coach", "victory", "defeat"
            ],
            NewsCategory.ENTERTAINMENT: [
                "movie", "film", "music", "celebrity", "entertainment",
                "actor", "actress", "director", "album", "concert", "show"
            ],
            NewsCategory.WORLD: [
                "international", "global", "world", "foreign", "country",
                "nation", "diplomatic", "treaty", "conflict", "agreement"
            ],
            NewsCategory.BREAKING: [
                "breaking", "urgent", "developing", "just in", "alert",
                "emergency", "crisis", "disaster", "accident", "incident"
            ]
        }
    
    def _load_regional_indicators(self) -> Dict[str, List[str]]:
        """Load indicators for geographic regions"""
        return {
            "us": ["united states", "america", "u.s.", "usa", "washington", "new york", "california"],
            "uk": ["united kingdom", "britain", "england", "london", "uk"],
            "europe": ["european", "europe", "eu", "brussels", "paris", "berlin"],
            "asia": ["asia", "china", "japan", "india", "beijing", "tokyo", "new delhi"],
            "middle_east": ["middle east", "israel", "palestine", "iran", "iraq", "saudi arabia"],
            "africa": ["africa", "nigeria", "south africa", "kenya", "egypt"],
            "latin_america": ["latin america", "brazil", "mexico", "argentina", "chile"]
        }
    
    async def _synthesize_answer(
        self, 
        query: str, 
        search_results: SearchResponse, 
        query_type: QueryType
    ) -> Tuple[str, float]:
        """Synthesize comprehensive news answer"""
        
        # Analyze sources for news credibility
        source_analyses = await self.intelligence_processor.analyze_sources(search_results)
        
        # Extract news articles
        news_articles = await self._extract_news_articles(source_analyses)
        
        if not news_articles:
            return "I couldn't find current news articles related to your query.", 0.3
        
        # Analyze news trends and patterns
        news_analysis = await self._analyze_news_patterns(news_articles, query)
        
        # Generate comprehensive news response
        response = self._format_news_response(news_analysis, query)
        
        # Calculate confidence based on source quality and recency
        confidence = self._calculate_news_confidence(news_analysis)
        
        return response, confidence
    
    async def _extract_news_articles(self, sources: List[SourceAnalysis]) -> List[NewsArticle]:
        """Extract structured news articles from sources"""
        articles = []
        
        for analysis in sources:
            source = analysis.source
            
            # Extract article information
            article = NewsArticle(
                title=source.title,
                url=source.url,
                content=source.snippet,
                source=self._extract_source_name(source.url),
                author=self._extract_author(source),
                publish_date=self._extract_publish_date(source),
                category=self._categorize_article(source),
                credibility_score=self._calculate_article_credibility(source, analysis),
                bias_score=analysis.bias_score,
                key_entities=self._extract_key_entities(source),
                summary=self._generate_article_summary(source)
            )
            
            articles.append(article)
        
        # Sort by credibility and recency
        articles.sort(
            key=lambda a: (a.credibility_score * 0.6 + self._recency_score(a.publish_date) * 0.4),
            reverse=True
        )
        
        return articles[:20]  # Top 20 articles
    
    def _extract_source_name(self, url: str) -> str:
        """Extract source name from URL"""
        from urllib.parse import urlparse
        domain = urlparse(url).netloc.lower()
        
        # Map common domains to source names
        domain_mapping = {
            "reuters.com": "Reuters",
            "ap.org": "Associated Press",
            "bbc.com": "BBC",
            "npr.org": "NPR",
            "wsj.com": "Wall Street Journal",
            "nytimes.com": "New York Times",
            "washingtonpost.com": "Washington Post",
            "cnn.com": "CNN",
            "foxnews.com": "Fox News"
        }
        
        for domain_key, name in domain_mapping.items():
            if domain_key in domain:
                return name
        
        return domain.split('.')[-2].title() if '.' in domain else domain
    
    def _extract_author(self, source: SearchResult) -> Optional[str]:
        """Extract author information from source"""
        # Simplified author extraction
        text = source.title + " " + source.snippet
        
        # Look for "by" patterns
        by_patterns = [
            r"by\s+([A-Z][a-z]+\s+[A-Z][a-z]+)",
            r"([A-Z]\.\s*[A-Z][a-z]+)",
            r"([A-Z][a-z]+\s+[A-Z]\.\s*[A-Z][a-z]+)"
        ]
        
        for pattern in by_patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        
        return None
    
    def _extract_publish_date(self, source: SearchResult) -> Optional[datetime]:
        """Extract publication date from source"""
        text = source.title + " " + source.snippet
        
        # Look for date patterns
        date_patterns = [
            r"(\w+\s+\d{1,2},\s+2024)",
            r"(\d{1,2}/\d{1,2}/2024)",
            r"(\d{4}-\d{2}-\d{2})",
            r"(\w+\s+\d{1,2},\s+2023)"
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, text)
            if match:
                try:
                    # Simplified date parsing
                    date_str = match.group(1)
                    # In a real implementation, use proper date parsing
                    return datetime.now()  # Placeholder
                except:
                    continue
        
        return None
    
    def _categorize_article(self, source: SearchResult) -> NewsCategory:
        """Categorize news article"""
        text = (source.title + " " + source.snippet).lower()
        
        # Check for breaking news indicators
        breaking_indicators = ["breaking", "urgent", "developing", "just in"]
        if any(indicator in text for indicator in breaking_indicators):
            return NewsCategory.BREAKING
        
        # Check category keywords
        category_scores = {}
        for category, keywords in self.news_keywords.items():
            score = sum(1 for keyword in keywords if keyword in text)
            category_scores[category] = score
        
        # Return category with highest score
        if category_scores:
            best_category = max(category_scores, key=category_scores.get)
            if category_scores[best_category] > 0:
                return best_category
        
        return NewsCategory.WORLD  # Default category
    
    def _calculate_article_credibility(self, source: SearchResult, analysis: SourceAnalysis) -> float:
        """Calculate credibility score for news article"""
        base_credibility = 0.5
        
        # Boost for known news sources
        source_name = self._extract_source_name(source.url).lower()
        for domain, info in self.news_sources.items():
            if domain in source.url.lower():
                base_credibility = info["credibility"]
                break
        
        # Adjust based on analysis credibility
        if analysis.credibility == SourceCredibility.HIGH:
            base_credibility += 0.1
        elif analysis.credibility == SourceCredibility.LOW:
            base_credibility -= 0.2
        
        # Check for sensationalism indicators
        sensational_words = ["shocking", "unbelievable", "incredible", "amazing", "terrifying"]
        text = (source.title + " " + source.snippet).lower()
        sensational_count = sum(1 for word in sensational_words if word in text)
        base_credibility -= min(sensational_count * 0.05, 0.2)
        
        return max(0.0, min(1.0, base_credibility))
    
    def _extract_key_entities(self, source: SearchResult) -> List[str]:
        """Extract key entities from article"""
        text = source.title + " " + source.snippet
        
        # Simple entity extraction (capitalized words)
        entities = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text)
        
        # Filter out common words
        common_words = {"The", "This", "That", "These", "Those", "What", "When", "Where", "Why", "How"}
        entities = [entity for entity in entities if entity not in common_words and len(entity) > 2]
        
        # Return unique entities
        return list(set(entities))[:10]  # Top 10 entities
    
    def _generate_article_summary(self, source: SearchResult) -> str:
        """Generate article summary"""
        # Use the snippet as summary, truncating if needed
        summary = source.snippet
        if len(summary) > 200:
            summary = summary[:200] + "..."
        return summary
    
    def _recency_score(self, publish_date: Optional[datetime]) -> float:
        """Calculate recency score"""
        if not publish_date:
            return 0.5  # Default for unknown dates
        
        now = datetime.now()
        age_hours = (now - publish_date).total_seconds() / 3600
        
        if age_hours < 1:
            return 1.0
        elif age_hours < 24:
            return 0.8
        elif age_hours < 168:  # 1 week
            return 0.6
        elif age_hours < 720:  # 1 month
            return 0.4
        else:
            return 0.2
    
    async def _analyze_news_patterns(self, articles: List[NewsArticle], query: str) -> NewsAnalysis:
        """Analyze patterns in news articles"""
        
        # Identify trending topics
        trending_topics = self._identify_trending_topics(articles)
        
        # Analyze source diversity
        source_diversity = self._analyze_source_diversity(articles)
        
        # Analyze time distribution
        time_distribution = self._analyze_time_distribution(articles)
        
        # Analyze geographic distribution
        geographic_distribution = self._analyze_geographic_distribution(articles)
        
        # Analyze sentiment
        sentiment_analysis = self._analyze_sentiment(articles)
        
        # Overall credibility assessment
        credibility_assessment = self._assess_overall_credibility(articles)
        
        return NewsAnalysis(
            main_articles=articles[:10],  # Top 10 articles
            trending_topics=trending_topics,
            source_diversity=source_diversity,
            time_distribution=time_distribution,
            geographic_distribution=geographic_distribution,
            sentiment_analysis=sentiment_analysis,
            credibility_assessment=credibility_assessment
        )
    
    def _identify_trending_topics(self, articles: List[NewsArticle]) -> List[TrendingTopic]:
        """Identify trending topics from articles"""
        # Count entity mentions
        entity_counts = defaultdict(int)
        source_coverage = defaultdict(set)
        
        for article in articles:
            for entity in article.key_entities:
                entity_counts[entity] += 1
                source_coverage[entity].add(article.source)
        
        # Create trending topics
        trending = []
        for entity, count in entity_counts.items():
            if count >= 2:  # Mentioned in at least 2 articles
                topic = TrendingTopic(
                    topic=entity,
                    mention_count=count,
                    sources_covering=list(source_coverage[entity]),
                    time_period="recent",
                    related_keywords=self._find_related_keywords(entity, articles),
                    sentiment_score=self._calculate_entity_sentiment(entity, articles),
                    geographic_focus=self._identify_entity_geography(entity, articles)
                )
                trending.append(topic)
        
        # Sort by mention count
        trending.sort(key=lambda t: t.mention_count, reverse=True)
        return trending[:10]  # Top 10 trending topics
    
    def _find_related_keywords(self, entity: str, articles: List[NewsArticle]) -> List[str]:
        """Find keywords related to an entity"""
        related = set()
        
        for article in articles:
            if entity in article.key_entities:
                # Add other entities from the same article
                for other_entity in article.key_entities:
                    if other_entity != entity:
                        related.add(other_entity)
        
        return list(related)[:5]  # Top 5 related keywords
    
    def _calculate_entity_sentiment(self, entity: str, articles: List[NewsArticle]) -> float:
        """Calculate sentiment for an entity"""
        # Simplified sentiment analysis
        positive_words = ["good", "great", "excellent", "positive", "success", "win", "achieve"]
        negative_words = ["bad", "terrible", "negative", "fail", "loss", "crisis", "disaster"]
        
        positive_count = 0
        negative_count = 0
        
        for article in articles:
            if entity in article.key_entities:
                text = (article.title + " " + article.content).lower()
                positive_count += sum(1 for word in positive_words if word in text)
                negative_count += sum(1 for word in negative_words if word in text)
        
        if positive_count + negative_count == 0:
            return 0.0
        
        return (positive_count - negative_count) / (positive_count + negative_count)
    
    def _identify_entity_geography(self, entity: str, articles: List[NewsArticle]) -> Optional[str]:
        """Identify geographic focus for an entity"""
        region_counts = defaultdict(int)
        
        for article in articles:
            if entity in article.key_entities:
                text = (article.title + " " + article.content).lower()
                
                for region, indicators in self.regional_indicators.items():
                    if any(indicator in text for indicator in indicators):
                        region_counts[region] += 1
        
        if region_counts:
            return max(region_counts, key=region_counts.get)
        
        return None
    
    def _analyze_source_diversity(self, articles: List[NewsArticle]) -> Dict[str, int]:
        """Analyze diversity of news sources"""
        source_counts = defaultdict(int)
        
        for article in articles:
            source_counts[article.source] += 1
        
        return dict(source_counts)
    
    def _analyze_time_distribution(self, articles: List[NewsArticle]) -> Dict[str, int]:
        """Analyze time distribution of articles"""
        time_counts = {
            "last_hour": 0,
            "last_24h": 0,
            "last_week": 0,
            "older": 0
        }
        
        now = datetime.now()
        
        for article in articles:
            if not article.publish_date:
                time_counts["older"] += 1
                continue
            
            age_hours = (now - article.publish_date).total_seconds() / 3600
            
            if age_hours < 1:
                time_counts["last_hour"] += 1
            elif age_hours < 24:
                time_counts["last_24h"] += 1
            elif age_hours < 168:
                time_counts["last_week"] += 1
            else:
                time_counts["older"] += 1
        
        return time_counts
    
    def _analyze_geographic_distribution(self, articles: List[NewsArticle]) -> Dict[str, int]:
        """Analyze geographic distribution of news"""
        geo_counts = defaultdict(int)
        
        for article in articles:
            text = (article.title + " " + article.content).lower()
            
            for region, indicators in self.regional_indicators.items():
                if any(indicator in text for indicator in indicators):
                    geo_counts[region] += 1
                    break
        
        return dict(geo_counts)
    
    def _analyze_sentiment(self, articles: List[NewsArticle]) -> Dict[str, float]:
        """Analyze overall sentiment of news coverage"""
        positive_words = ["good", "great", "excellent", "positive", "success", "win", "achieve", "growth"]
        negative_words = ["bad", "terrible", "negative", "fail", "loss", "crisis", "disaster", "decline"]
        
        total_positive = 0
        total_negative = 0
        
        for article in articles:
            text = (article.title + " " + article.content).lower()
            total_positive += sum(1 for word in positive_words if word in text)
            total_negative += sum(1 for word in negative_words if word in text)
        
        if total_positive + total_negative == 0:
            return {"overall": 0.0, "positive": 0, "negative": 0}
        
        overall_sentiment = (total_positive - total_negative) / (total_positive + total_negative)
        
        return {
            "overall": overall_sentiment,
            "positive": total_positive,
            "negative": total_negative
        }
    
    def _assess_overall_credibility(self, articles: List[NewsArticle]) -> float:
        """Assess overall credibility of news coverage"""
        if not articles:
            return 0.0
        
        credibility_scores = [article.credibility_score for article in articles]
        return sum(credibility_scores) / len(credibility_scores)
    
    def _format_news_response(self, analysis: NewsAnalysis, query: str) -> str:
        """Format comprehensive news response"""
        response = f"# News Report: {query}\n\n"
        
        # Top articles
        response += "## Top News Articles\n\n"
        for i, article in enumerate(analysis.main_articles, 1):
            response += f"### {i}. {article.title}\n\n"
            response += f"**Source:** {article.source} | "
            response += f"**Credibility:** {article.credibility_score:.2f} | "
            response += f"**Category:** {article.category.value}\n\n"
            
            if article.author:
                response += f"**Author:** {article.author}\n"
            
            if article.publish_date:
                response += f"**Published:** {article.publish_date.strftime('%Y-%m-%d %H:%M')}\n"
            
            response += f"\n{article.summary}\n\n"
            
            if article.key_entities:
                response += f"**Key Entities:** {', '.join(article.key_entities[:5])}\n\n"
            
            response += f"[Read more]({article.url})\n\n"
        
        # Trending topics
        if analysis.trending_topics:
            response += "## Trending Topics\n\n"
            for i, topic in enumerate(analysis.trending_topics[:5], 1):
                response += f"{i}. **{topic.topic}**\n"
                response += f"   - Mentions: {topic.mention_count}\n"
                response += f"   - Sources: {', '.join(topic.sources_covering[:3])}\n"
                response += f"   - Sentiment: {topic.sentiment_score:.2f}\n\n"
        
        # Source diversity
        response += "## Source Diversity\n\n"
        total_articles = sum(analysis.source_diversity.values())
        for source, count in sorted(analysis.source_diversity.items(), key=lambda x: x[1], reverse=True):
            percentage = (count / total_articles) * 100
            response += f"• {source}: {count} articles ({percentage:.1f}%)\n"
        response += "\n"
        
        # Time distribution
        response += "## Time Distribution\n\n"
        for period, count in analysis.time_distribution.items():
            response += f"• {period.replace('_', ' ').title()}: {count} articles\n"
        response += "\n"
        
        # Geographic distribution
        if analysis.geographic_distribution:
            response += "## Geographic Distribution\n\n"
            for region, count in analysis.geographic_distribution.items():
                response += f"• {region.replace('_', ' ').title()}: {count} articles\n"
            response += "\n"
        
        # Sentiment analysis
        response += "## Sentiment Analysis\n\n"
        sentiment = analysis.sentiment_analysis
        response += f"• Overall Sentiment: {sentiment['overall']:.2f}\n"
        response += f"• Positive Mentions: {sentiment['positive']}\n"
        response += f"• Negative Mentions: {sentiment['negative']}\n\n"
        
        # Credibility assessment
        response += f"## Overall Credibility Assessment\n\n"
        response += f"**Average Credibility Score:** {analysis.credibility_assessment:.2f}/1.0\n\n"
        
        if analysis.credibility_assessment >= 0.8:
            response += "The news coverage is based on highly credible sources."
        elif analysis.credibility_assessment >= 0.6:
            response += "The news coverage is based on moderately credible sources."
        else:
            response += "The news coverage includes sources with varying credibility levels."
        
        return response
    
    def _calculate_news_confidence(self, analysis: NewsAnalysis) -> float:
        """Calculate confidence score for news response"""
        # Base confidence from credibility
        base_confidence = analysis.credibility_assessment
        
        # Boost for diverse sources
        source_diversity_score = len(analysis.source_diversity) / 10.0  # Normalized
        base_confidence = base_confidence * 0.7 + source_diversity_score * 0.3
        
        # Adjust for recency
        recent_articles = analysis.time_distribution["last_24h"] + analysis.time_distribution["last_hour"]
        total_articles = sum(analysis.time_distribution.values())
        
        if total_articles > 0:
            recency_score = recent_articles / total_articles
            base_confidence = base_confidence * 0.8 + recency_score * 0.2
        
        return max(0.1, min(1.0, base_confidence))
