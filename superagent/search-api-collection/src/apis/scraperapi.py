import aiohttp
import asyncio
from typing import Dict, List, Any
import time
import urllib.parse
try:
    from ..base import BaseSearchAPI, SearchResponse, SearchType, SearchResult
except ImportError:
    from base import BaseSearchAPI, SearchResponse, SearchType, SearchResult


class ScraperAPIIntegration(BaseSearchAPI):
    def __init__(self, api_key: str, **kwargs):
        super().__init__(api_key, **kwargs)
        self.base_url = "http://api.scraperapi.com"
        self.session = None
    
    def _remove_none_values(self, params: Dict) -> Dict:
        """Remove None values from dictionary"""
        return {k: v for k, v in params.items() if v is not None}
    
    async def _get_session(self):
        if self.session is None:
            self.session = aiohttp.ClientSession()
        return self.session
    
    async def search(
        self,
        query: str,
        search_type: SearchType = SearchType.WEB,
        num_results: int = 10,
        **kwargs
    ) -> SearchResponse:
        if not self.validate_api_key():
            raise ValueError("Invalid ScraperAPI key")
        
        session = await self._get_session()
        start_time = time.time()
        
        # ScraperAPI works by scraping search engine results
        # We'll use Google search by default
        search_url = self._build_search_url(query, search_type, num_results, kwargs)
        
        params = {
            "api_key": self.api_key,
            "url": search_url,
            "render_js": kwargs.get("render_js", "false"),
            "premium": kwargs.get("premium", "false"),
            "country_code": kwargs.get("country_code", "us"),
            "device_type": kwargs.get("device_type", "desktop"),
            "session_number": kwargs.get("session_number", None),
            "keep_headers": kwargs.get("keep_headers", "false"),
        }
        
        # Remove None values
        params = self._remove_none_values(params)
        
        try:
            async with session.get(self.base_url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"ScraperAPI error: {response.status} - {error_text}")
                
                html_content = await response.text()
                search_time = time.time() - start_time
                
                return self._parse_html_response(html_content, query, search_time, search_type)
        
        except Exception as e:
            raise Exception(f"ScraperAPI request failed: {str(e)}")
    
    def _build_search_url(
        self, 
        query: str, 
        search_type: SearchType, 
        num_results: int, 
        kwargs: Dict
    ) -> str:
        """Build Google search URL for scraping"""
        base_google_url = "https://www.google.com/search"
        
        params = {
            "q": query,
            "num": min(num_results, 100),
            "start": kwargs.get("offset", 0),
            "safe": kwargs.get("safe", "active"),
            "hl": kwargs.get("hl", "en"),
            "gl": kwargs.get("gl", "us"),
            "ie": "utf-8",
            "oe": "utf-8"
        }
        
        # Add search type specific parameters
        if search_type == SearchType.NEWS:
            params["tbm"] = "nws"
        elif search_type == SearchType.IMAGES:
            params["tbm"] = "isch"
        elif search_type == SearchType.VIDEOS:
            params["tbm"] = "vid"
        
        # Remove None values
        params = {k: v for k, v in params.items() if v is not None}
        
        encoded_params = urllib.parse.urlencode(params)
        return f"{base_google_url}?{encoded_params}"
    
    def _parse_html_response(
        self, 
        html_content: str, 
        query: str, 
        search_time: float, 
        search_type: SearchType
    ) -> SearchResponse:
        """Parse HTML content from Google search results"""
        # This is a simplified parser - in production, you'd want to use
        # a proper HTML parser like BeautifulSoup
        results = []
        
        # For this example, we'll extract basic information using regex
        # In a real implementation, you'd parse the HTML structure
        
        # Note: This is a placeholder implementation
        # ScraperAPI returns raw HTML that needs to be parsed
        # You would typically use BeautifulSoup or similar for this
        
        # Simulate parsed results for demonstration
        sample_results = [
            {
                "title": f"Search result for: {query}",
                "url": "https://example.com/result1",
                "snippet": "This is a sample search result snippet..."
            },
            {
                "title": f"Another result for: {query}",
                "url": "https://example.com/result2", 
                "snippet": "Another sample search result with different content..."
            }
        ]
        
        for i, item in enumerate(sample_results):
            result = SearchResult(
                title=item.get("title", ""),
                url=item.get("url", ""),
                snippet=item.get("snippet", ""),
                position=i + 1,
                metadata={
                    "source": "google",
                    "search_type": search_type.value,
                    "scraper": "scraperapi"
                }
            )
            results.append(result)
        
        return SearchResponse(
            query=query,
            results=results,
            total_results=len(results),
            search_time=search_time,
            metadata={
                "source": "google",
                "search_type": search_type.value,
                "scraper": "scraperapi",
                "html_length": len(html_content)
            }
        )
    
    async def scrape_url(self, url: str, **kwargs) -> str:
        """Scrape content from a specific URL"""
        if not self.validate_api_key():
            raise ValueError("Invalid ScraperAPI key")
        
        session = await self._get_session()
        
        params = {
            "api_key": self.api_key,
            "url": url,
            "render_js": kwargs.get("render_js", "false"),
            "premium": kwargs.get("premium", "false"),
            "country_code": kwargs.get("country_code", "us"),
            "device_type": kwargs.get("device_type", "desktop"),
            "session_number": kwargs.get("session_number", None),
            "keep_headers": kwargs.get("keep_headers", "false"),
        }
        
        # Remove None values
        params = self._remove_none_values(params)
        
        try:
            async with session.get(self.base_url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"ScraperAPI error: {response.status} - {error_text}")
                
                return await response.text()
        
        except Exception as e:
            raise Exception(f"ScraperAPI scrape request failed: {str(e)}")
    
    async def get_account_info(self) -> Dict[str, Any]:
        """Get account information and usage stats"""
        if not self.validate_api_key():
            raise ValueError("Invalid ScraperAPI key")
        
        session = await self._get_session()
        
        params = {
            "api_key": self.api_key,
            "account": "true"
        }
        
        try:
            async with session.get(self.base_url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"ScraperAPI account error: {response.status} - {error_text}")
                
                # Parse account information
                text = await response.text()
                # In a real implementation, you'd parse the JSON response
                return {
                    "account_info": text,
                    "message": "Account information retrieved"
                }
        
        except Exception as e:
            raise Exception(f"ScraperAPI account request failed: {str(e)}")
    
    def get_rate_limits(self) -> Dict[str, Any]:
        return {
            "requests_per_second": 5,
            "requests_per_month": None,  # Depends on plan
            "concurrent_requests": 10,
            "rate_limit_headers": None
        }
    
    def get_pricing_info(self) -> Dict[str, Any]:
        return {
            "free_tier": {
                "requests_per_month": 1000,
                "features": ["Basic scraping", "Residential proxies"]
            },
            "paid_tiers": [
                {
                    "name": "Hobby",
                    "price": "$29/month",
                    "requests_per_month": 25000,
                    "features": ["Basic scraping", "Residential proxies", "Email support"]
                },
                {
                    "name": "Startup",
                    "price": "$99/month", 
                    "requests_per_month": 100000,
                    "features": ["All features", "Datacenter proxies", "Priority support"]
                },
                {
                    "name": "Business",
                    "price": "$249/month",
                    "requests_per_month": 300000,
                    "features": ["All features", "Dedicated account manager", "SLA guarantee"]
                },
                {
                    "name": "Enterprise",
                    "price": "Custom",
                    "requests_per_month": "Unlimited",
                    "features": ["All features", "Custom solutions", "Dedicated infrastructure"]
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
