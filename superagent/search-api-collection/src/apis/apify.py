import aiohttp
import asyncio
from typing import Dict, List, Any, Optional
import time
try:
    from ..base import BaseSearchAPI, SearchResponse, SearchType, SearchResult
except ImportError:
    from base import BaseSearchAPI, SearchResponse, SearchType, SearchResult


class ApifyAPIIntegration(BaseSearchAPI):
    def __init__(self, api_key: str, **kwargs):
        super().__init__(api_key, **kwargs)
        self.base_url = "https://api.apify.com/v2"
        self.session = None
        
        # Default actors for different search types
        self.default_actors = {
            SearchType.WEB: "apify/web-scraper",
            SearchType.NEWS: "apify/news-scraper", 
            SearchType.IMAGES: "apify/image-scraper",
            SearchType.VIDEOS: "apify/video-scraper"
        }
    
    def _remove_none_values(self, params: Dict) -> Dict:
        """Remove None values from dictionary"""
        return {k: v for k, v in params.items() if v is not None}
    
    async def _get_session(self):
        if self.session is None:
            self.session = aiohttp.ClientSession()
        return self.session
    
    def _get_headers(self) -> Dict[str, str]:
        """Get API headers including authentication"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    async def get_actor_versions(self, actor_id: str) -> List[Dict[str, Any]]:
        """Get available versions for a specific actor"""
        if not self.validate_api_key():
            raise ValueError("Invalid Apify API key")
        
        session = await self._get_session()
        url = f"{self.base_url}/acts/{actor_id}/versions"
        
        try:
            async with session.get(url, headers=self._get_headers()) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Apify API error: {response.status} - {error_text}")
                
                data = await response.json()
                return data.get("data", [])
        
        except Exception as e:
            raise Exception(f"Failed to get actor versions: {str(e)}")
    
    async def search(
        self,
        query: str,
        search_type: SearchType = SearchType.WEB,
        num_results: int = 10,
        **kwargs
    ) -> SearchResponse:
        if not self.validate_api_key():
            raise ValueError("Invalid Apify API key")
        
        session = await self._get_session()
        start_time = time.time()
        
        # Get the appropriate actor for the search type
        actor_id = kwargs.get("actor_id", self.default_actors.get(search_type, "apify/web-scraper"))
        
        # Build actor run input
        run_input = self._build_actor_input(query, search_type, num_results, kwargs)
        
        # Start the actor run
        run_url = f"{self.base_url}/acts/{actor_id}/runs"
        
        try:
            async with session.post(run_url, headers=self._get_headers(), json=run_input) as response:
                if response.status != 201:  # 201 Created for successful run start
                    error_text = await response.text()
                    raise Exception(f"Apify actor run error: {response.status} - {error_text}")
                
                run_data = await response.json()
                run_id = run_data["data"]["id"]
                
                # Wait for the run to complete and get results
                results = await self._wait_for_run_completion(run_id, session)
                search_time = time.time() - start_time
                
                return self._parse_actor_results(results, query, search_time, search_type)
        
        except Exception as e:
            raise Exception(f"Apify search failed: {str(e)}")
    
    def _build_actor_input(
        self, 
        query: str, 
        search_type: SearchType, 
        num_results: int, 
        kwargs: Dict
    ) -> Dict[str, Any]:
        """Build input parameters for the actor run"""
        base_input = {
            "searchQuery": query,
            "maxResults": min(num_results, 100),
            "countryCode": kwargs.get("country_code", "US"),
            "language": kwargs.get("language", "en"),
            "proxyConfiguration": kwargs.get("proxy", {
                "useApifyProxy": True,
                "apifyProxyGroups": ["RESIDENTIAL"]
            })
        }
        
        # Add search type specific parameters
        if search_type == SearchType.NEWS:
            base_input.update({
                "source": kwargs.get("news_source", "google"),
                "timeRange": kwargs.get("time_range", "7d")
            })
        elif search_type == SearchType.IMAGES:
            base_input.update({
                "imageType": kwargs.get("image_type", "all"),
                "imageSize": kwargs.get("image_size", "all")
            })
        elif search_type == SearchType.VIDEOS:
            base_input.update({
                "videoDuration": kwargs.get("video_duration", "any"),
                "videoQuality": kwargs.get("video_quality", "any")
            })
        
        # Remove None values
        return self._remove_none_values(base_input)
    
    async def _wait_for_run_completion(self, run_id: str, session: aiohttp.ClientSession) -> List[Dict]:
        """Wait for actor run to complete and return results"""
        status_url = f"{self.base_url}/actor-runs/{run_id}"
        
        max_wait_time = 300  # 5 minutes max wait
        poll_interval = 5   # Check every 5 seconds
        elapsed_time = 0
        
        while elapsed_time < max_wait_time:
            async with session.get(status_url, headers=self._get_headers()) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Failed to check run status: {response.status} - {error_text}")
                
                status_data = await response.json()
                status = status_data["data"]["status"]
                
                if status == "SUCCEEDED":
                    # Get the results
                    results_url = f"{self.base_url}/actor-runs/{run_id}/dataset/items"
                    async with session.get(results_url, headers=self._get_headers()) as results_response:
                        if results_response.status == 200:
                            return await results_response.json()
                        else:
                            raise Exception(f"Failed to get results: {results_response.status}")
                
                elif status in ["FAILED", "ABORTED", "TIMED-OUT"]:
                    error_message = status_data["data"].get("statusMessage", "Unknown error")
                    raise Exception(f"Actor run {status.lower()}: {error_message}")
                
                # Still running, wait and poll again
                await asyncio.sleep(poll_interval)
                elapsed_time += poll_interval
        
        raise Exception("Actor run timed out after 5 minutes")
    
    def _parse_actor_results(
        self, 
        raw_results: List[Dict], 
        query: str, 
        search_time: float, 
        search_type: SearchType
    ) -> SearchResponse:
        """Parse results from Apify actor into SearchResponse"""
        results = []
        
        for i, item in enumerate(raw_results):
            # Handle different result formats from different actors
            if "url" in item and "title" in item:
                # Standard web scraper format
                result = SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("text", item.get("description", "")),
                    position=i + 1,
                    metadata={
                        "source": "apify",
                        "search_type": search_type.value,
                        "actor": item.get("actorId", "unknown"),
                        "raw_data": item
                    }
                )
            else:
                # Fallback for other formats
                result = SearchResult(
                    title=str(item.get("title", item.get("name", f"Result {i+1}"))),
                    url=str(item.get("url", item.get("link", ""))),
                    snippet=str(item.get("snippet", item.get("description", ""))),
                    position=i + 1,
                    metadata={
                        "source": "apify",
                        "search_type": search_type.value,
                        "raw_data": item
                    }
                )
            
            results.append(result)
        
        return SearchResponse(
            query=query,
            results=results,
            total_results=len(results),
            search_time=search_time,
            metadata={
                "source": "apify",
                "search_type": search_type.value,
                "total_raw_results": len(raw_results)
            }
        )
    
    async def run_custom_actor(
        self, 
        actor_id: str, 
        input_data: Dict[str, Any], 
        wait_for_completion: bool = True
    ) -> Dict[str, Any]:
        """Run a custom Apify actor with custom input"""
        if not self.validate_api_key():
            raise ValueError("Invalid Apify API key")
        
        session = await self._get_session()
        run_url = f"{self.base_url}/acts/{actor_id}/runs"
        
        try:
            async with session.post(run_url, headers=self._get_headers(), json=input_data) as response:
                if response.status != 201:
                    error_text = await response.text()
                    raise Exception(f"Apify actor run error: {response.status} - {error_text}")
                
                run_data = await response.json()
                run_id = run_data["data"]["id"]
                
                if wait_for_completion:
                    results = await self._wait_for_run_completion(run_id, session)
                    return {
                        "run_id": run_id,
                        "results": results
                    }
                else:
                    return {
                        "run_id": run_id,
                        "status": "started"
                    }
        
        except Exception as e:
            raise Exception(f"Custom actor run failed: {str(e)}")
    
    def get_rate_limits(self) -> Dict[str, Any]:
        return {
            "requests_per_second": 10,
            "requests_per_month": None,  # Depends on plan
            "concurrent_requests": 50,
            "rate_limit_headers": None,
            "compute_units_per_search": 1  # Approximate
        }
    
    def get_pricing_info(self) -> Dict[str, Any]:
        return {
            "free_tier": {
                "compute_units_per_month": 5,
                "features": ["Basic actors", "Community support"]
            },
            "paid_tiers": [
                {
                    "name": "Starter",
                    "price": "$49/month",
                    "compute_units_per_month": 100,
                    "features": ["All actors", "Priority support", "API access"]
                },
                {
                    "name": "Professional", 
                    "price": "$149/month",
                    "compute_units_per_month": 500,
                    "features": ["All features", "Faster execution", "Dedicated support"]
                },
                {
                    "name": "Business",
                    "price": "$499/month",
                    "compute_units_per_month": 2000,
                    "features": ["All features", "Custom solutions", "SLA guarantee"]
                },
                {
                    "name": "Enterprise",
                    "price": "Custom",
                    "compute_units_per_month": "Unlimited",
                    "features": ["All features", "Custom infrastructure", "Dedicated team"]
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
