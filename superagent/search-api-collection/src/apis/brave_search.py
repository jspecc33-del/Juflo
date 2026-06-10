import aiohttp
import asyncio
from typing import Dict, List, Any
import time
try:
    from ..base import BaseSearchAPI, SearchResponse, SearchType, SearchResult
except ImportError:
    from base import BaseSearchAPI, SearchResponse, SearchType, SearchResult


class BraveSearchAPI(BaseSearchAPI):
    def __init__(self, api_key: str, **kwargs):
        super().__init__(api_key, **kwargs)
        self.base_url = "https://api.search.brave.com/res/v1/web/search"
        self.session = None
    
    async def _get_session(self):
        if self.session is None:
            headers = {
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": self.api_key
            }
            self.session = aiohttp.ClientSession(headers=headers)
        return self.session
    
    async def search(
        self,
        query: str,
        search_type: SearchType = SearchType.WEB,
        num_results: int = 10,
        **kwargs
    ) -> SearchResponse:
        if not self.validate_api_key():
            raise ValueError("Invalid Brave Search API key")
        
        session = await self._get_session()
        start_time = time.time()
        
        params = {
            "q": query,
            "count": min(num_results, 20),  # Brave API limit
            "offset": kwargs.get("offset", 0),
            "text_decorations": kwargs.get("text_decorations", False),
            "spellcheck": kwargs.get("spellcheck", 1),
            "result_filter": kwargs.get("result_filter", None),
            "safesearch": kwargs.get("safesearch", "moderate"),
            "search_lang": kwargs.get("search_lang", "en"),
            "ui_lang": kwargs.get("ui_lang", "en"),
            "country": kwargs.get("country", "US"),
        }
        
        # Remove None values
        params = {k: v for k, v in params.items() if v is not None}
        
        try:
            async with session.get(self.base_url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Brave Search API error: {response.status} - {error_text}")
                
                data = await response.json()
                search_time = time.time() - start_time
                
                return self._parse_response(data, query, search_time)
        
        except Exception as e:
            raise Exception(f"Brave Search API request failed: {str(e)}")
    
    def _parse_response(self, data: Dict, query: str, search_time: float) -> SearchResponse:
        results = []
        
        # Parse web results
        if "web" in data and "results" in data["web"]:
            for i, item in enumerate(data["web"]["results"]):
                result = SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("description", ""),
                    position=i + 1,
                    metadata={
                        "language": item.get("language"),
                        "family_friendly": item.get("family_friendly"),
                        "type": item.get("type"),
                        "subtype": item.get("subtype")
                    }
                )
                results.append(result)
        
        # Parse news results if available
        if "news" in data and "results" in data["news"]:
            for item in data["news"]["results"]:
                result = SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("description", ""),
                    position=len(results) + 1,
                    metadata={
                        "type": "news",
                        "age": item.get("age"),
                        "language": item.get("language")
                    }
                )
                results.append(result)
        
        return SearchResponse(
            query=query,
            results=results,
            total_results=data.get("web", {}).get("total_results", len(results)),
            search_time=search_time,
            metadata={
                "mixed_results": data.get("mixed", {}),
                "spellcheck": data.get("spellcheck", {}),
                "search_location": data.get("search_location", {})
            }
        )
    
    def get_rate_limits(self) -> Dict[str, Any]:
        return {
            "requests_per_second": 100,
            "requests_per_month": None,  # Depends on subscription
            "concurrent_requests": 10,
            "rate_limit_headers": ["x-ratelimit-limit", "x-ratelimit-remaining"]
        }
    
    def get_pricing_info(self) -> Dict[str, Any]:
        return {
            "free_tier": {
                "requests_per_month": 2000,
                "features": ["Web search", "News search"]
            },
            "paid_tiers": [
                {
                    "name": "Pro",
                    "price": "$9.99/month",
                    "requests_per_month": 10000,
                    "features": ["Web search", "News search", "Image search", "Video search"]
                },
                {
                    "name": "Business",
                    "price": "$49.99/month",
                    "requests_per_month": 50000,
                    "features": ["All search types", "Priority support", "Custom models"]
                }
            ]
        }
    
    async def close(self):
        if self.session:
            await self.session.close()
            self.session = None
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
