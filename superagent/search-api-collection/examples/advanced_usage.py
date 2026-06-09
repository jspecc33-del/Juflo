#!/usr/bin/env python3
"""
Advanced usage example for the Search API Collection
Demonstrates advanced features like parallel search, custom configurations, and result processing
"""

import asyncio
import os
import json
from dotenv import load_dotenv

# Add the src directory to the path
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from manager import SearchAPICollection, SearchStrategy
from base import SearchType


async def parallel_search_demo():
    """Demonstrate parallel search across multiple APIs"""
    load_dotenv()
    
    config = {
        "strategy": "parallel",
        "apis": {
            "tavily": {
                "api_key": os.getenv("TAVILY_API_KEY"),
                "config": {"search_depth": "basic"}
            },
            "brave": {
                "api_key": os.getenv("BRAVE_API_KEY"),
                "config": {"country": "US"}
            }
        }
    }
    
    async with SearchAPICollection(config) as search_collection:
        print("=== Parallel Search Demo ===")
        
        results = await search_collection.search(
            query="climate change solutions 2024",
            search_type=SearchType.WEB,
            num_results=10
        )
        
        print(f"Query: {results.query}")
        print(f"Total unique results: {len(results.results)}")
        print(f"Providers used: {results.metadata.get('providers_used', [])}")
        print(f"Failed providers: {len(results.metadata.get('failed_providers', []))}")
        print()
        
        # Show results with provider info if available
        for i, result in enumerate(results.results[:5], 1):
            print(f"{i}. {result.title}")
            print(f"   URL: {result.url}")
            print(f"   Snippet: {result.snippet[:150]}...")
            print()


async def custom_search_with_filters():
    """Demonstrate search with custom filters and parameters"""
    load_dotenv()
    
    config = {
        "strategy": "primary",
        "primary_api": "tavily",
        "apis": {
            "tavily": {
                "api_key": os.getenv("TAVILY_API_KEY"),
                "config": {"search_depth": "advanced"}
            }
        }
    }
    
    async with SearchAPICollection(config) as search_collection:
        print("=== Custom Search with Filters ===")
        
        # Search with domain inclusion/exclusion
        results = await search_collection.search(
            query="machine learning research papers",
            search_type=SearchType.WEB,
            num_results=5,
            include_domains=["arxiv.org", "openai.com", "deepmind.com"],
            exclude_domains=["facebook.com", "twitter.com"]
        )
        
        print(f"Filtered search results: {len(results.results)}")
        for i, result in enumerate(results.results, 1):
            print(f"{i}. {result.title}")
            print(f"   URL: {result.url}")
            print(f"   Domain: {result.url.split('/')[2] if '/' in result.url else 'N/A'}")
            print()


async def image_and_video_search():
    """Demonstrate image and video search capabilities"""
    load_dotenv()
    
    config = {
        "strategy": "primary",
        "primary_api": "serpapi",
        "apis": {
            "serpapi": {
                "api_key": os.getenv("SERPAPI_KEY"),
                "config": {"engine": "google"}
            }
        }
    }
    
    async with SearchAPICollection(config) as search_collection:
        print("=== Image and Video Search ===")
        
        # Image search
        print("Image Search Results:")
        try:
            image_results = await search_collection.search(
                query="cute cats",
                search_type=SearchType.IMAGES,
                num_results=3
            )
            
            for i, result in enumerate(image_results.results, 1):
                print(f"{i}. {result.title}")
                print(f"   URL: {result.url}")
                if result.metadata:
                    print(f"   Type: {result.metadata.get('type', 'N/A')}")
                    print(f"   Source: {result.metadata.get('source', 'N/A')}")
                print()
        except Exception as e:
            print(f"Image search failed: {e}")
        
        # Video search
        print("Video Search Results:")
        try:
            video_results = await search_collection.search(
                query="python tutorials",
                search_type=SearchType.VIDEOS,
                num_results=3
            )
            
            for i, result in enumerate(video_results.results, 1):
                print(f"{i}. {result.title}")
                print(f"   URL: {result.url}")
                if result.metadata:
                    print(f"   Duration: {result.metadata.get('duration', 'N/A')}")
                    print(f"   Channel: {result.metadata.get('channel', 'N/A')}")
                print()
        except Exception as e:
            print(f"Video search failed: {e}")


async def result_analysis():
    """Demonstrate advanced result analysis and processing"""
    load_dotenv()
    
    config = {
        "strategy": "parallel",
        "apis": {
            "tavily": {
                "api_key": os.getenv("TAVILY_API_KEY"),
                "config": {"include_answer": True}
            },
            "brave": {
                "api_key": os.getenv("BRAVE_API_KEY"),
                "config": {}
            }
        }
    }
    
    async with SearchAPICollection(config) as search_collection:
        print("=== Result Analysis ===")
        
        query = "renewable energy trends 2024"
        results = await search_collection.search(query, num_results=10)
        
        # Analyze results
        print(f"Query: {query}")
        print(f"Total results: {len(results.results)}")
        print(f"Providers used: {results.metadata.get('providers_used', [])}")
        print()
        
        # Domain analysis
        domains = {}
        for result in results.results:
            try:
                domain = result.url.split('/')[2]
                domains[domain] = domains.get(domain, 0) + 1
            except:
                pass
        
        print("Top domains:")
        for domain, count in sorted(domains.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"  {domain}: {count} results")
        print()
        
        # Check for special features (like Tavily's answer)
        if results.metadata and results.metadata.get("answer"):
            print("AI-Generated Answer:")
            print(f"  {results.metadata['answer']}")
            print()
        
        # Show sample results
        print("Sample Results:")
        for i, result in enumerate(results.results[:3], 1):
            print(f"{i}. {result.title}")
            print(f"   {result.snippet[:200]}...")
            print()


async def performance_comparison():
    """Compare performance of different APIs"""
    load_dotenv()
    
    apis_to_test = {}
    
    # Add APIs that have keys
    if os.getenv("TAVILY_API_KEY"):
        apis_to_test["tavily"] = {"api_key": os.getenv("TAVILY_API_KEY")}
    if os.getenv("BRAVE_API_KEY"):
        apis_to_test["brave"] = {"api_key": os.getenv("BRAVE_API_KEY")}
    if os.getenv("SERPAPI_KEY"):
        apis_to_test["serpapi"] = {"api_key": os.getenv("SERPAPI_KEY")}
    
    if not apis_to_test:
        print("No API keys found for performance comparison")
        return
    
    print("=== Performance Comparison ===")
    
    query = "artificial intelligence ethics"
    num_results = 5
    
    for api_name, api_config in apis_to_test.items():
        config = {
            "strategy": "primary",
            "primary_api": api_name,
            "apis": {api_name: api_config}
        }
        
        try:
            async with SearchAPICollection(config) as search_collection:
                start_time = asyncio.get_event_loop().time()
                results = await search_collection.search(query, num_results=num_results)
                end_time = asyncio.get_event_loop().time()
                
                actual_time = end_time - start_time
                reported_time = results.search_time or 0
                
                print(f"\n{api_name.upper()}:")
                print(f"  Results: {len(results.results)}")
                print(f"  Reported time: {reported_time:.3f}s")
                print(f"  Actual time: {actual_time:.3f}s")
                print(f"  Rate limits: {search_collection.get_api_info(api_name)['rate_limits']}")
                
        except Exception as e:
            print(f"\n{api_name.upper()}: Failed - {e}")


async def main():
    """Run all advanced demos"""
    print("Advanced Search API Collection Demo\n")
    
    await parallel_search_demo()
    print("\n" + "="*50 + "\n")
    
    await custom_search_with_filters()
    print("\n" + "="*50 + "\n")
    
    await image_and_video_search()
    print("\n" + "="*50 + "\n")
    
    await result_analysis()
    print("\n" + "="*50 + "\n")
    
    await performance_comparison()


if __name__ == "__main__":
    print("Starting Advanced Search API Collection Demo...")
    print("Make sure to set your API keys in environment variables or .env file\n")
    
    asyncio.run(main())
