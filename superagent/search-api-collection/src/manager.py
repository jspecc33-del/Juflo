import asyncio
from typing import Dict, List, Any, Optional, Union
from enum import Enum
import random
try:
    from .base import BaseSearchAPI, SearchResponse, SearchType
except ImportError:
    from base import BaseSearchAPI, SearchResponse, SearchType
try:
    from .apis.brave_search import BraveSearchAPI
    from .apis.serpapi import SerpAPIIntegration
    from .apis.tavily import TavilyAPIIntegration
    from .apis.scraperapi import ScraperAPIIntegration
    from .apis.apify import ApifyAPIIntegration
except ImportError:
    from apis.brave_search import BraveSearchAPI
    from apis.serpapi import SerpAPIIntegration
    from apis.tavily import TavilyAPIIntegration
    from apis.scraperapi import ScraperAPIIntegration
    from apis.apify import ApifyAPIIntegration


class APIProvider(Enum):
    BRAVE = "brave"
    SERPAPI = "serpapi"
    TAVILY = "tavily"
    SCRAPERAPI = "scraperapi"
    APIFY = "apify"


class SearchStrategy(Enum):
    PRIMARY = "primary"  # Use primary API only
    FALLBACK = "fallback"  # Try backup APIs if primary fails
    ROUND_ROBIN = "round_robin"  # Rotate through APIs
    PARALLEL = "parallel"  # Query multiple APIs and merge results
    BEST_RESULT = "best_result"  # Use all APIs and pick best results


class SearchAPICollection:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.apis: Dict[APIProvider, BaseSearchAPI] = {}
        self.primary_api: Optional[APIProvider] = None
        self.fallback_apis: List[APIProvider] = []
        self.strategy = SearchStrategy(config.get("strategy", "primary"))
        
        self._initialize_apis()
    
    def _initialize_apis(self):
        """Initialize all configured APIs"""
        api_configs = self.config.get("apis", {})
        
        # Initialize Brave Search API
        if "brave" in api_configs and api_configs["brave"].get("api_key"):
            self.apis[APIProvider.BRAVE] = BraveSearchAPI(
                api_key=api_configs["brave"]["api_key"],
                **api_configs["brave"].get("config", {})
            )
        
        # Initialize SerpAPI
        if "serpapi" in api_configs and api_configs["serpapi"].get("api_key"):
            self.apis[APIProvider.SERPAPI] = SerpAPIIntegration(
                api_key=api_configs["serpapi"]["api_key"],
                **api_configs["serpapi"].get("config", {})
            )
        
        # Initialize Tavily API
        if "tavily" in api_configs and api_configs["tavily"].get("api_key"):
            self.apis[APIProvider.TAVILY] = TavilyAPIIntegration(
                api_key=api_configs["tavily"]["api_key"],
                **api_configs["tavily"].get("config", {})
            )
        
        # Initialize ScraperAPI
        if "scraperapi" in api_configs and api_configs["scraperapi"].get("api_key"):
            self.apis[APIProvider.SCRAPERAPI] = ScraperAPIIntegration(
                api_key=api_configs["scraperapi"]["api_key"],
                **api_configs["scraperapi"].get("config", {})
            )
        
        # Set primary and fallback APIs
        primary_name = self.config.get("primary_api")
        if primary_name:
            try:
                self.primary_api = APIProvider(primary_name)
                self.fallback_apis = [
                    provider for provider in self.apis.keys() 
                    if provider != self.primary_api
                ]
            except ValueError:
                raise ValueError(f"Invalid primary API: {primary_name}")
        else:
            # Use first available API as primary
            if self.apis:
                self.primary_api = list(self.apis.keys())[0]
                self.fallback_apis = list(self.apis.keys())[1:]
    
    async def search(
        self,
        query: str,
        search_type: SearchType = SearchType.WEB,
        num_results: int = 10,
        **kwargs
    ) -> SearchResponse:
        """Perform search using configured strategy"""
        
        if not self.apis:
            raise ValueError("No APIs configured")
        
        if self.strategy == SearchStrategy.PRIMARY:
            return await self._search_primary(query, search_type, num_results, **kwargs)
        
        elif self.strategy == SearchStrategy.FALLBACK:
            return await self._search_fallback(query, search_type, num_results, **kwargs)
        
        elif self.strategy == SearchStrategy.ROUND_ROBIN:
            return await self._search_round_robin(query, search_type, num_results, **kwargs)
        
        elif self.strategy == SearchStrategy.PARALLEL:
            return await self._search_parallel(query, search_type, num_results, **kwargs)
        
        elif self.strategy == SearchStrategy.BEST_RESULT:
            return await self._search_best_result(query, search_type, num_results, **kwargs)
        
        else:
            raise ValueError(f"Unknown search strategy: {self.strategy}")
    
    async def _search_primary(
        self, 
        query: str, 
        search_type: SearchType, 
        num_results: int, 
        **kwargs
    ) -> SearchResponse:
        """Search using primary API only"""
        if not self.primary_api or self.primary_api not in self.apis:
            raise ValueError("Primary API not configured")
        
        api = self.apis[self.primary_api]
        return await api.search(query, search_type, num_results, **kwargs)
    
    async def _search_fallback(
        self, 
        query: str, 
        search_type: SearchType, 
        num_results: int, 
        **kwargs
    ) -> SearchResponse:
        """Search with fallback to backup APIs"""
        apis_to_try = [self.primary_api] + self.fallback_apis if self.primary_api else list(self.apis.keys())
        
        last_error = None
        for provider in apis_to_try:
            if provider not in self.apis:
                continue
                
            try:
                api = self.apis[provider]
                result = await api.search(query, search_type, num_results, **kwargs)
                result.metadata = result.metadata or {}
                result.metadata["provider"] = provider.value
                return result
            except Exception as e:
                last_error = e
                continue
        
        raise Exception(f"All APIs failed. Last error: {str(last_error)}")
    
    async def _search_round_robin(
        self, 
        query: str, 
        search_type: SearchType, 
        num_results: int, 
        **kwargs
    ) -> SearchResponse:
        """Rotate through APIs"""
        available_apis = list(self.apis.keys())
        if not available_apis:
            raise ValueError("No APIs available")
        
        # Simple round-robin: pick next API in sequence
        # In a real implementation, you'd track state
        provider = random.choice(available_apis)
        
        try:
            api = self.apis[provider]
            result = await api.search(query, search_type, num_results, **kwargs)
            result.metadata = result.metadata or {}
            result.metadata["provider"] = provider.value
            return result
        except Exception as e:
            # Try other APIs if the randomly selected one fails
            return await self._search_fallback(query, search_type, num_results, **kwargs)
    
    async def _search_parallel(
        self, 
        query: str, 
        search_type: SearchType, 
        num_results: int, 
        **kwargs
    ) -> SearchResponse:
        """Search multiple APIs in parallel and merge results"""
        available_apis = list(self.apis.keys())
        if not available_apis:
            raise ValueError("No APIs available")
        
        # Run searches in parallel
        tasks = []
        for provider in available_apis:
            api = self.apis[provider]
            task = asyncio.create_task(
                self._safe_search(api, query, search_type, num_results, provider, **kwargs)
            )
            tasks.append(task)
        
        # Wait for all tasks to complete
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Merge successful results
        all_results = []
        metadata = {"providers_used": [], "failed_providers": []}
        
        for result in results:
            if isinstance(result, Exception):
                metadata["failed_providers"].append(str(result))
                continue
            
            if isinstance(result, SearchResponse):
                all_results.extend(result.results)
                metadata["providers_used"].append(result.metadata.get("provider", "unknown"))
        
        # Deduplicate and rank results
        unique_results = self._deduplicate_results(all_results)
        unique_results = unique_results[:num_results]  # Limit to requested number
        
        return SearchResponse(
            query=query,
            results=unique_results,
            total_results=len(unique_results),
            metadata=metadata
        )
    
    async def _search_best_result(
        self, 
        query: str, 
        search_type: SearchType, 
        num_results: int, 
        **kwargs
    ) -> SearchResponse:
        """Search all APIs and select best results"""
        # Similar to parallel but with better ranking logic
        return await self._search_parallel(query, search_type, num_results, **kwargs)
    
    async def _safe_search(
        self, 
        api: BaseSearchAPI, 
        query: str, 
        search_type: SearchType, 
        num_results: int, 
        provider: APIProvider,
        **kwargs
    ) -> SearchResponse:
        """Safely search an API and add provider metadata"""
        try:
            result = await api.search(query, search_type, num_results, **kwargs)
            result.metadata = result.metadata or {}
            result.metadata["provider"] = provider.value
            return result
        except Exception as e:
            raise Exception(f"{provider.value} failed: {str(e)}")
    
    def _deduplicate_results(self, results: List) -> List:
        """Remove duplicate results based on URL"""
        seen_urls = set()
        unique_results = []
        
        for result in results:
            if result.url not in seen_urls:
                seen_urls.add(result.url)
                unique_results.append(result)
        
        return unique_results
    
    def get_available_apis(self) -> List[str]:
        """Get list of configured API providers"""
        return [provider.value for provider in self.apis.keys()]
    
    def get_api_info(self, provider: str) -> Dict[str, Any]:
        """Get information about a specific API"""
        try:
            api_provider = APIProvider(provider)
            if api_provider not in self.apis:
                return {"error": f"API {provider} not configured"}
            
            api = self.apis[api_provider]
            return {
                "provider": provider,
                "rate_limits": api.get_rate_limits(),
                "pricing": api.get_pricing_info(),
                "configured": True
            }
        except ValueError:
            return {"error": f"Unknown provider: {provider}"}
    
    def get_all_api_info(self) -> Dict[str, Any]:
        """Get information about all configured APIs"""
        info = {}
        for provider in self.apis.keys():
            info[provider.value] = self.get_api_info(provider.value)
        return info
    
    async def close_all(self):
        """Close all API connections"""
        for api in self.apis.values():
            if hasattr(api, 'close'):
                await api.close()
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close_all()
