#!/usr/bin/env python3
"""
Basic usage example for the Search API Collection
Demonstrates how to use different search APIs and strategies
"""

import asyncio
import os
from dotenv import load_dotenv

# Add the src directory to the path
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from manager import SearchAPICollection, SearchStrategy
from base import SearchType


async def main():
    # Load environment variables
    load_dotenv()
    
    # Configuration - you can also load this from a file
    config = {
        "strategy": "primary",  # Try "fallback", "parallel", "round_robin"
        "primary_api": "tavily",  # Your preferred primary API
        "apis": {
            "tavily": {
                "api_key": os.getenv("TAVILY_API_KEY", "your_tavily_key_here"),
                "config": {
                    "search_depth": "basic",
                    "include_answer": True
                }
            },
            "brave": {
                "api_key": os.getenv("BRAVE_API_KEY", "your_brave_key_here"),
                "config": {
                    "country": "US",
                    "search_lang": "en"
                }
            },
            "serpapi": {
                "api_key": os.getenv("SERPAPI_KEY", "your_serpapi_key_here"),
                "config": {
                    "engine": "google",
                    "gl": "us",
                    "hl": "en"
                }
            },
            "scraperapi": {
                "api_key": os.getenv("SCRAPERAPI_KEY", "your_scraperapi_key_here"),
                "config": {
                    "country_code": "us",
                    "device_type": "desktop"
                }
            }
        }
    }
    
    # Initialize the search collection
    async with SearchAPICollection(config) as search_collection:
        print("=== Search API Collection Demo ===\n")
        
        # Show available APIs
        print("Available APIs:", search_collection.get_available_apis())
        print()
        
        # Perform a basic web search
        print("1. Basic Web Search:")
        try:
            results = await search_collection.search(
                query="Python async programming",
                search_type=SearchType.WEB,
                num_results=5
            )
            
            print(f"Query: {results.query}")
            print(f"Total results: {len(results.results)}")
            print(f"Search time: {results.search_time:.2f}s")
            print(f"Provider: {results.metadata.get('provider', 'unknown')}")
            print()
            
            for i, result in enumerate(results.results, 1):
                print(f"{i}. {result.title}")
                print(f"   URL: {result.url}")
                print(f"   Snippet: {result.snippet[:100]}...")
                print()
        except Exception as e:
            print(f"Error: {e}")
        
        # Perform a news search
        print("\n2. News Search:")
        try:
            results = await search_collection.search(
                query="artificial intelligence news",
                search_type=SearchType.NEWS,
                num_results=3
            )
            
            print(f"Query: {results.query}")
            print(f"Total results: {len(results.results)}")
            print()
            
            for i, result in enumerate(results.results, 1):
                print(f"{i}. {result.title}")
                print(f"   URL: {result.url}")
                print(f"   Snippet: {result.snippet[:100]}...")
                print()
        except Exception as e:
            print(f"Error: {e}")
        
        # Show API information
        print("\n3. API Information:")
        api_info = search_collection.get_all_api_info()
        for provider, info in api_info.items():
            print(f"\n{provider.upper()}:")
            if "error" in info:
                print(f"  Error: {info['error']}")
            else:
                print(f"  Configured: {info['configured']}")
                print(f"  Rate limits: {info['rate_limits']}")
                print(f"  Pricing: Available")


async def demo_strategies():
    """Demonstrate different search strategies"""
    load_dotenv()
    
    # Minimal config for strategy demo
    config = {
        "strategy": "fallback",
        "primary_api": "tavily",
        "apis": {
            "tavily": {
                "api_key": os.getenv("TAVILY_API_KEY", "demo_key"),
                "config": {}
            },
            "brave": {
                "api_key": os.getenv("BRAVE_API_KEY", "demo_key"),
                "config": {}
            }
        }
    }
    
    strategies = ["primary", "fallback", "parallel", "round_robin"]
    
    for strategy in strategies:
        print(f"\n=== Testing {strategy.upper()} Strategy ===")
        config["strategy"] = strategy
        
        try:
            async with SearchAPICollection(config) as search_collection:
                results = await search_collection.search(
                    query="machine learning tutorials",
                    num_results=3
                )
                
                print(f"Strategy: {strategy}")
                print(f"Results: {len(results.results)}")
                print(f"Provider: {results.metadata.get('provider', 'unknown')}")
                if "providers_used" in results.metadata:
                    print(f"Providers used: {results.metadata['providers_used']}")
                
        except Exception as e:
            print(f"Strategy {strategy} failed: {e}")


if __name__ == "__main__":
    print("Starting Search API Collection Demo...")
    print("Make sure to set your API keys in environment variables or .env file\n")
    
    # Run basic demo
    asyncio.run(main())
    
    # Uncomment to test different strategies
    # asyncio.run(demo_strategies())
