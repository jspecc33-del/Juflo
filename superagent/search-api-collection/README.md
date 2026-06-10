# Search API Collection

A comprehensive Python library for integrating multiple legitimate search APIs including Brave Search, SerpAPI, Tavily, and ScraperAPI, with intelligent AI agents for research, conversation, fact-checking, and news analysis. This collection provides a unified interface for searching across different providers with various strategies for reliability and performance.

## Features

### Search API Integration

- **Multiple API Support**: Brave Search, SerpAPI, Tavily, and ScraperAPI
- **Flexible Search Strategies**: Primary, Fallback, Round Robin, Parallel, and Best Result
- **Unified Interface**: Consistent API across all search providers
- **Async Support**: Full async/await support for high-performance applications
- **Search Types**: Web, News, Images, and Videos
- **Advanced Filtering**: Domain inclusion/exclusion, location-based search, and more
- **Error Handling**: Robust error handling with automatic fallbacks
- **Rate Limiting**: Built-in rate limiting to respect API limits
- **Result Deduplication**: Automatic duplicate removal when using multiple APIs

### 🤖 AI Agent System

- **Intelligent Query Processing**: Automatic query classification and optimization
- **Source Credibility Assessment**: Advanced analysis of source reliability and bias
- **Answer Synthesis**: Multi-source information consolidation with confidence scoring
- **Conversation Memory**: Context-aware interactions with session persistence
- **Specialized Agents**: Research, Conversational, Fact-Checking, and News agents
- **Personality System**: Configurable agent personalities and response styles
- **CLI Interface**: Rich command-line interface for interactive agent usage

## Supported APIs

### 🦁 Brave Search API

- **Pricing**: Free tier (2,000 requests/month), Pro ($9.99/month), Business ($49.99/month)
- **Features**: Web search, news search, image search, video search
- **Rate Limits**: 100 requests/second
- **Get API Key**: [Brave Search API](https://brave.com/search/api/)

### 🔍 SerpAPI

- **Pricing**: Free tier (100 requests/month), Starter ($50/month), Pro ($250/month), Business ($500/month)
- **Features**: Google search, news, images, videos, shopping, and more
- **Rate Limits**: 5 requests/second
- **Get API Key**: [SerpAPI](https://serpapi.com/)

### 🤖 Tavily AI Search

- **Pricing**: Free tier (1,000 requests/month), Standard ($20/month), Pro ($100/month), Enterprise (custom)
- **Features**: AI-powered search, answer generation, content extraction
- **Rate Limits**: 20 requests/second
- **Get API Key**: [Tavily](https://tavily.com/)

### 🕷️ ScraperAPI

- **Pricing**: Free tier (1,000 requests/month), Hobby ($29/month), Startup ($99/month), Business ($249/month)
- **Features**: Web scraping, proxy rotation, JavaScript rendering
- **Rate Limits**: 5 requests/second
- **Get API Key**: [ScraperAPI](https://www.scraperapi.com/)

### 🎭 Apify

- **Pricing**: Free tier (5 compute units/month), Starter ($49/month), Professional ($149/month), Business ($499/month)
- **Features**: Web scraping actors, custom scrapers, proxy rotation, JavaScript rendering
- **Rate Limits**: 10 requests/second
- **Get API Key**: [Apify](https://apify.com/)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd search-api-collection
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set up your API keys:

```bash
cp .env.example .env
# Edit .env with your actual API keys
```

## Quick Start

### Basic Usage

```python
import asyncio
from src.manager import SearchAPICollection, SearchStrategy
from src.base import SearchType

async def main():
    config = {
        "strategy": "primary",
        "primary_api": "tavily",
        "apis": {
            "tavily": {
                "api_key": "your_tavily_api_key",
                "config": {"search_depth": "basic"}
            }
        }
    }
    
    async with SearchAPICollection(config) as search:
        results = await search.search(
            query="Python async programming",
            search_type=SearchType.WEB,
            num_results=5
        )
        
        for result in results.results:
            print(f"{result.title}")
            print(f"{result.url}")
            print(f"{result.snippet}")
            print()

asyncio.run(main())
```

### Using Multiple APIs with Fallback

```python
config = {
    "strategy": "fallback",
    "primary_api": "tavily",
    "apis": {
        "tavily": {"api_key": "your_tavily_key"},
        "brave": {"api_key": "your_brave_key"},
        "serpapi": {"api_key": "your_serpapi_key"}
    }
}

# If Tavily fails, it will automatically try Brave, then SerpAPI
```

### Parallel Search for Best Results

```python
config = {
    "strategy": "parallel",
    "apis": {
        "tavily": {"api_key": "your_tavily_key"},
        "brave": {"api_key": "your_brave_key"}
    }
}

# Searches both APIs simultaneously and merges results
```

## 🤖 AI Agent System

The Search API Collection now includes intelligent AI agents that leverage the search APIs to provide specialized, context-aware responses for different use cases.

### Available Agents

#### 🔬 Research Agent
Specialized for academic and scholarly research with comprehensive analysis and source verification.

```python
from src.agent import ResearchAgent, AgentConfigurationManager, AgentType

# Configure research agent
config_manager = AgentConfigurationManager()
agent_config = config_manager.get_agent_config(AgentType.RESEARCH)

async with ResearchAgent(search_config, agent_config) as agent:
    response = await agent.process_query("quantum computing applications in medicine")
    print(response.answer)  # Comprehensive research report
```

#### 💬 Conversational Agent
Memory-aware agent for natural conversations with context persistence.

```python
from src.agent import ConversationalAgent, ConversationMemory

# Initialize memory and conversational agent
memory = ConversationMemory()
session_id = memory.create_session("conversational")

async with ConversationalAgent(search_config, agent_config, memory) as agent:
    agent.set_session_id(session_id)
    
    # Multi-turn conversation
    response1 = await agent.process_query("Tell me about renewable energy")
    response2 = await agent.process_query("What about solar panels specifically?")
    # Agent maintains context across turns
```

#### 🔍 Fact-Checking Agent
Specialized for verifying claims and detecting misinformation with source credibility assessment.

```python
from src.agent import FactCheckAgent

async with FactCheckAgent(search_config, agent_config) as agent:
    response = await agent.process_query("fact check vaccines cause autism")
    # Returns detailed fact-check report with verdict and evidence
```

#### 📰 News Agent
Current events and news analysis with trending topics detection and source diversity analysis.

```python
from src.agent import NewsAgent

async with NewsAgent(search_config, agent_config) as agent:
    response = await agent.process_query("artificial intelligence latest developments")
    # Returns comprehensive news analysis with trending topics
```

### Agent Personalities

Configure agent behavior with different personalities:

```python
from src.agent import AgentConfigurationManager

config_manager = AgentConfigurationManager()

# Available personalities
personalities = config_manager.list_personalities()
# ['researcher', 'assistant', 'expert', 'concise', 'creative']

# Use custom personality
agent_config = config_manager.get_agent_config(
    AgentType.CONVERSATIONAL, 
    personality_name="researcher"
)
```

### CLI Interface

Interactive command-line interface for all agent types:

```bash
# Interactive conversational mode
python -m src.agent.cli --mode interactive --agent conversational

# Batch processing
python -m src.agent.cli --mode batch --agent research --queries "climate change" "AI ethics" --output results.json

# Configuration management
python -m src.agent.cli --mode config --config-action show
```

### Agent Features

- **Intelligent Query Classification**: Automatically detects query type (research, news, fact-check, etc.)
- **Source Credibility Assessment**: Analyzes source reliability, bias, and expertise
- **Answer Synthesis**: Consolidates information from multiple sources with confidence scoring
- **Conversation Memory**: Maintains context across multiple interactions
- **Personalization**: Adapts responses based on user preferences and feedback
- **Multi-language Support**: Configurable language and region preferences
- **Export Capabilities**: Save results in various formats (JSON, Markdown)

## Configuration

### Configuration File (config.yaml)

```yaml
strategy: "fallback"
primary_api: "tavily"

apis:
  tavily:
    api_key: "YOUR_TAVILY_API_KEY"
    config:
      search_depth: "basic"
      include_answer: true
  
  brave:
    api_key: "YOUR_BRAVE_API_KEY"
    config:
      country: "US"
      search_lang: "en"
```

### Environment Variables (.env)

```env
TAVILY_API_KEY=your_tavily_api_key_here
BRAVE_API_KEY=your_brave_api_key_here
SERPAPI_KEY=your_serpapi_key_here
SCRAPERAPI_KEY=your_scraperapi_key_here
```

## Search Strategies

### Primary
Uses only the configured primary API. Fastest but no redundancy.

### Fallback
Tries primary API first, then falls back to backup APIs if it fails.

### Round Robin
Rotates through available APIs to distribute load.

### Parallel
Queries multiple APIs simultaneously and merges results.

### Best Result
Uses all APIs and selects the best results based on relevance.

## Search Types

- **WEB**: Standard web search
- **NEWS**: News article search
- **IMAGES**: Image search
- **VIDEOS**: Video search

## Advanced Features

### Custom Filters

```python
# Include only specific domains
async def search_with_domain_filter():
    results = await search.search(
        query="machine learning",
        include_domains=["arxiv.org", "openai.com"]
    )
    return results

# Exclude specific domains
async def search_with_domain_exclusion():
    results = await search.search(
        query="climate change",
        exclude_domains=["facebook.com", "twitter.com"]
    )
    return results
```

### Location-based Search

```python
# Brave Search
config = {
    "apis": {
        "brave": {
            "api_key": "your_key",
            "config": {
                "country": "GB",
                "search_lang": "en"
            }
        }
    }
}

# SerpAPI
config = {
    "apis": {
        "serpapi": {
            "api_key": "your_key",
            "config": {
                "gl": "gb",  # Country code
                "hl": "en"   # Language code
            }
        }
    }
}
```

### Content Extraction (Tavily)

```python
# Get direct answers
async def get_tavily_answer():
    tavily_api = TavilyAPIIntegration(api_key="your_key")
    answer = await tavily_api.get_answer("What is quantum computing?")
    return answer

# Extract content from URLs
async def extract_tavily_content():
    tavily_api = TavilyAPIIntegration(api_key="your_key")
    content = await tavily_api.extract_content([
        "https://example.com/article1",
        "https://example.com/article2"
    ])
    return content
```

### Web Scraping (ScraperAPI)

```python
# Scrape specific URLs
async def scrape_with_scraperapi():
    scraper_api = ScraperAPIIntegration(api_key="your_key")
    html = await scraper_api.scrape_url("https://example.com")
    return html

# Get account info
async def get_scraperapi_account():
    scraper_api = ScraperAPIIntegration(api_key="your_key")
    account_info = await scraper_api.get_account_info()
    return account_info
```

### Custom Actors (Apify)

```python
# Run a custom Apify actor
async def run_custom_apify_actor():
    apify_api = ApifyAPIIntegration(api_key="your_key")
    
    # Get available actor versions
    versions = await apify_api.get_actor_versions("apify/web-scraper")
    
    # Run custom actor with specific input
    custom_input = {
        "startUrls": [{"url": "https://example.com"}],
        "maxCrawledPages": 10
    }
    
    result = await apify_api.run_custom_actor(
        actor_id="apify/web-scraper",
        input_data=custom_input,
        wait_for_completion=True
    )
    return result

# Get actor versions
async def get_actor_versions():
    apify_api = ApifyAPIIntegration(api_key="your_key")
    versions = await apify_api.get_actor_versions("apify/web-scraper")
    return versions
```

## Examples

### Basic Usage Example
```bash
python examples/basic_usage.py
```

### Advanced Features Example
```bash
python examples/advanced_usage.py
```

## API Reference

### SearchAPICollection

Main class for managing multiple search APIs.

#### Methods

- `search(query, search_type=SearchType.WEB, num_results=10, **kwargs)`: Perform search
- `get_available_apis()`: Get list of configured APIs
- `get_api_info(provider)`: Get information about specific API
- `get_all_api_info()`: Get information about all APIs
- `close_all()`: Close all API connections

### BaseSearchAPI

Abstract base class for all search API implementations.

#### Methods

- `search(query, search_type, num_results, **kwargs)`: Abstract search method
- `get_rate_limits()`: Get rate limit information
- `get_pricing_info()`: Get pricing information
- `validate_api_key()`: Validate API key format

### SearchResult

Data class representing a single search result.

#### Fields

- `title`: Result title
- `url`: Result URL
- `snippet`: Result snippet/description
- `position`: Result position in results
- `metadata`: Additional metadata

### SearchResponse

Data class representing search response.

#### Fields

- `query`: Original search query
- `results`: List of SearchResult objects
- `total_results`: Total number of results
- `search_time`: Time taken for search
- `metadata`: Additional response metadata

## Error Handling

The library includes comprehensive error handling:

- **API Key Errors**: Validates API keys before making requests
- **Rate Limiting**: Respects API rate limits and implements backoff
- **Network Errors**: Automatic retries with exponential backoff
- **Fallback Logic**: Automatically tries backup APIs when primary fails

## Performance Considerations

- Use **parallel** strategy for best result quality
- Use **primary** strategy for fastest performance
- Configure appropriate **rate limits** to avoid being throttled
- Enable **caching** for repeated queries (planned feature)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the examples directory for usage patterns
- Review the API documentation for each provider

## Changelog

### v1.0.0
- Initial release
- Support for Brave Search, SerpAPI, Tavily, and ScraperAPI
- Multiple search strategies
- Async support
- Comprehensive error handling
- Example implementations
