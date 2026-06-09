import asyncio
from typing import Dict, List, Any
import time
from serpapi import GoogleSearch
try:
    from ..base import BaseSearchAPI, SearchResponse, SearchType, SearchResult
except ImportError:
    from base import BaseSearchAPI, SearchResponse, SearchType, SearchResult


class SerpAPIIntegration(BaseSearchAPI):
    def __init__(self, api_key: str, **kwargs):
        super().__init__(api_key, **kwargs)
        self.base_params = {
            "api_key": self.api_key,
            "engine": kwargs.get("engine", "google"),
            "google_domain": kwargs.get("google_domain", "google.com"),
            "gl": kwargs.get("gl", "us"),  # Country
            "hl": kwargs.get("hl", "en"),  # Language
        }
    
    async def search(
        self,
        query: str,
        search_type: SearchType = SearchType.WEB,
        num_results: int = 10,
        **kwargs
    ) -> SearchResponse:
        if not self.validate_api_key():
            raise ValueError("Invalid SerpAPI key")
        
        # Run synchronous GoogleSearch in thread pool
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, 
            self._sync_search, 
            query, 
            search_type, 
            num_results, 
            kwargs
        )
    
    def _sync_search(
        self, 
        query: str, 
        search_type: SearchType, 
        num_results: int, 
        kwargs: Dict
    ) -> SearchResponse:
        start_time = time.time()
        
        params = self.base_params.copy()
        params.update({
            "q": query,
            "num": min(num_results, 100),  # SerpAPI limit
            "start": kwargs.get("offset", 0),
            "safe": kwargs.get("safe", "active"),
            "filter": kwargs.get("filter", "1"),
            "location": kwargs.get("location"),
            "device": kwargs.get("device"),
        })
        
        # Configure search engine based on type
        if search_type == SearchType.NEWS:
            params["tbm"] = "nws"
        elif search_type == SearchType.IMAGES:
            params["tbm"] = "isch"
        elif search_type == SearchType.VIDEOS:
            params["tbm"] = "vid"
        
        # Remove None values
        params = {k: v for k, v in params.items() if v is not None}
        
        try:
            search = GoogleSearch(params)
            results = search.get_dict()
            search_time = time.time() - start_time
            
            return self._parse_response(results, query, search_time, search_type)
        
        except Exception as e:
            raise Exception(f"SerpAPI request failed: {str(e)}")
    
    def _parse_response(
        self, 
        data: Dict, 
        query: str, 
        search_time: float, 
        search_type: SearchType
    ) -> SearchResponse:
        results = []
        
        # Parse organic results
        if "organic_results" in data:
            for i, item in enumerate(data["organic_results"]):
                result = SearchResult(
                    title=item.get("title", ""),
                    url=item.get("link", ""),
                    snippet=item.get("snippet", ""),
                    position=i + 1,
                    metadata={
                        "displayed_link": item.get("displayed_link"),
                        "favicon": item.get("favicon"),
                        "date": item.get("date"),
                        "cached_page_link": item.get("cached_page_link"),
                        "snippet_highlighted_words": item.get("snippet_highlighted_words", [])
                    }
                )
                results.append(result)
        
        # Parse news results
        if search_type == SearchType.NEWS and "news_results" in data:
            for item in data["news_results"]:
                result = SearchResult(
                    title=item.get("title", ""),
                    url=item.get("link", ""),
                    snippet=item.get("snippet", ""),
                    position=len(results) + 1,
                    metadata={
                        "type": "news",
                        "source": item.get("source"),
                        "date": item.get("date"),
                        "thumbnail": item.get("thumbnail")
                    }
                )
                results.append(result)
        
        # Parse image results
        if search_type == SearchType.IMAGES and "images_results" in data:
            for item in data["images_results"]:
                result = SearchResult(
                    title=item.get("title", ""),
                    url=item.get("original", ""),
                    snippet=item.get("title", ""),  # Images don't have snippets
                    position=len(results) + 1,
                    metadata={
                        "type": "image",
                        "thumbnail": item.get("thumbnail"),
                        "source": item.get("source"),
                        "image_size": item.get("image_size")
                    }
                )
                results.append(result)
        
        # Parse video results
        if search_type == SearchType.VIDEOS and "video_results" in data:
            for item in data["video_results"]:
                result = SearchResult(
                    title=item.get("title", ""),
                    url=item.get("link", ""),
                    snippet=item.get("snippet", ""),
                    position=len(results) + 1,
                    metadata={
                        "type": "video",
                        "duration": item.get("duration"),
                        "source": item.get("source"),
                        "channel": item.get("channel")
                    }
                )
                results.append(result)
        
        # Extract search information
        search_info = data.get("search_information", {})
        
        return SearchResponse(
            query=query,
            results=results,
            total_results=search_info.get("total_results", len(results)),
            search_time=search_time,
            metadata={
                "search_time": search_info.get("time_taken_displayed"),
                "query_displayed": search_info.get("query_displayed"),
                "total_results_displayed": search_info.get("total_results_displayed"),
                "related_searches": data.get("related_searches", []),
                "paid_results": data.get("ads", []),
                "people_also_ask": data.get("people_also_ask", [])
            }
        )
    
    def get_rate_limits(self) -> Dict[str, Any]:
        return {
            "requests_per_second": 5,
            "requests_per_month": None,  # Depends on plan
            "concurrent_requests": 10,
            "rate_limit_headers": None  # SerpAPI doesn't expose rate limit headers
        }
    
    def get_pricing_info(self) -> Dict[str, Any]:
        return {
            "free_tier": {
                "requests_per_month": 100,
                "features": ["Basic search", "Organic results"]
            },
            "paid_tiers": [
                {
                    "name": "Starter",
                    "price": "$50/month",
                    "requests_per_month": 5000,
                    "features": ["All search types", "Location-based search", "Advanced filters"]
                },
                {
                    "name": "Pro",
                    "price": "$250/month",
                    "requests_per_month": 50000,
                    "features": ["All features", "Priority support", "Custom engines"]
                },
                {
                    "name": "Business",
                    "price": "$500/month",
                    "requests_per_month": 100000,
                    "features": ["All features", "Dedicated support", "SLA guarantee"]
                }
            ]
        }
