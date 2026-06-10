import asyncio
from typing import Dict, List, Any
import time
from tavily import TavilyClient
try:
    from ..base import BaseSearchAPI, SearchResponse, SearchType, SearchResult
except ImportError:
    from base import BaseSearchAPI, SearchResponse, SearchType, SearchResult


class TavilyAPIIntegration(BaseSearchAPI):
    def __init__(self, api_key: str, **kwargs):
        super().__init__(api_key, **kwargs)
        self.client = None
    
    def _get_client(self):
        if self.client is None:
            if not self.validate_api_key():
                raise ValueError("Invalid Tavily API key")
            self.client = TavilyClient(api_key=self.api_key)
        return self.client
    
    async def search(
        self,
        query: str,
        search_type: SearchType = SearchType.WEB,
        num_results: int = 10,
        **kwargs
    ) -> SearchResponse:
        # Run synchronous TavilyClient in thread pool
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
        client = self._get_client()
        
        # Prepare search parameters
        search_params = {
            "query": query,
            "search_depth": kwargs.get("search_depth", "basic"),  # "basic" or "advanced"
            "include_answer": kwargs.get("include_answer", True),
            "include_raw_content": kwargs.get("include_raw_content", False),
            "max_results": min(num_results, 10),  # Tavily limit
            "include_domains": kwargs.get("include_domains", []),
            "exclude_domains": kwargs.get("exclude_domains", []),
        }
        
        # Add search type specific parameters
        if search_type == SearchType.NEWS:
            search_params["search_depth"] = "advanced"
            search_params["days"] = kwargs.get("days", 7)
        elif search_type == SearchType.IMAGES:
            search_params["include_image"] = True
        elif search_type == SearchType.VIDEOS:
            search_params["include_video"] = True
        
        # Remove None values and empty lists
        search_params = {k: v for k, v in search_params.items() 
                        if v is not None and v != []}
        
        try:
            # Perform search
            result = client.search(**search_params)
            search_time = time.time() - start_time
            
            return self._parse_response(result, query, search_time)
        
        except Exception as e:
            raise Exception(f"Tavily API request failed: {str(e)}")
    
    def _parse_response(self, data: Dict, query: str, search_time: float) -> SearchResponse:
        results = []
        
        # Parse search results
        if "results" in data:
            for i, item in enumerate(data["results"]):
                result = SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("content", ""),
                    position=i + 1,
                    metadata={
                        "score": item.get("score"),
                        "raw_content": item.get("raw_content"),
                        "published_date": item.get("published_date")
                    }
                )
                results.append(result)
        
        # Extract additional metadata
        metadata = {
            "answer": data.get("answer"),
            "follow_up_questions": data.get("follow_up_questions", []),
            "images": data.get("images", []),
            "videos": data.get("videos", [])
        }
        
        return SearchResponse(
            query=query,
            results=results,
            total_results=len(results),
            search_time=search_time,
            metadata=metadata
        )
    
    async def get_answer(self, query: str, **kwargs) -> Dict[str, Any]:
        """Get a direct answer from Tavily"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, 
            self._sync_get_answer, 
            query, 
            kwargs
        )
    
    def _sync_get_answer(self, query: str, kwargs: Dict) -> Dict[str, Any]:
        client = self._get_client()
        
        answer_params = {
            "query": query,
            "search_depth": kwargs.get("search_depth", "advanced"),
            "include_raw_content": kwargs.get("include_raw_content", False),
            "max_results": kwargs.get("max_results", 5),
        }
        
        answer_params = {k: v for k, v in answer_params.items() 
                         if v is not None}
        
        try:
            return client.get_answer(**answer_params)
        except Exception as e:
            raise Exception(f"Tavily answer API request failed: {str(e)}")
    
    async def extract_content(self, urls: List[str], **kwargs) -> List[Dict[str, Any]]:
        """Extract content from specific URLs"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, 
            self._sync_extract_content, 
            urls, 
            kwargs
        )
    
    def _sync_extract_content(self, urls: List[str], kwargs: Dict) -> List[Dict[str, Any]]:
        client = self._get_client()
        
        extract_params = {
            "urls": urls,
            "words": kwargs.get("words", 5000),
            "max_results": kwargs.get("max_results", 1),
        }
        
        extract_params = {k: v for k, v in extract_params.items() 
                         if v is not None}
        
        try:
            return client.extract(**extract_params)
        except Exception as e:
            raise Exception(f"Tavily extract API request failed: {str(e)}")
    
    def get_rate_limits(self) -> Dict[str, Any]:
        return {
            "requests_per_second": 20,
            "requests_per_month": None,  # Depends on plan
            "concurrent_requests": 10,
            "rate_limit_headers": None
        }
    
    def get_pricing_info(self) -> Dict[str, Any]:
        return {
            "free_tier": {
                "requests_per_month": 1000,
                "features": ["Basic search", "Answer generation", "Content extraction"]
            },
            "paid_tiers": [
                {
                    "name": "Standard",
                    "price": "$20/month",
                    "requests_per_month": 20000,
                    "features": ["All features", "Advanced search", "Priority support"]
                },
                {
                    "name": "Pro",
                    "price": "$100/month",
                    "requests_per_month": 100000,
                    "features": ["All features", "Unlimited depth", "Dedicated support"]
                },
                {
                    "name": "Enterprise",
                    "price": "Custom",
                    "requests_per_month": "Unlimited",
                    "features": ["All features", "Custom models", "SLA guarantee", "Dedicated infrastructure"]
                }
            ]
        }
