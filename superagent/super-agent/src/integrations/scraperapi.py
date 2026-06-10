"""
ScraperAPI Integration

Integration with ScraperAPI for advanced web scraping capabilities
including search engine results, content extraction, and data collection.
"""

import aiohttp
import asyncio
import logging
from typing import Dict, List, Any, Optional
import time
import urllib.parse


class ScraperAPIIntegration:
    """Integration with ScraperAPI service"""
    
    def __init__(self, api_key: str, **kwargs):
        self.api_key = api_key
        self.base_url = "http://api.scraperapi.com"
        self.session = None
        self.logger = logging.getLogger(__name__)
        
        # Configuration
        self.config = {
            "render_js": kwargs.get("render_js", "false"),
            "premium": kwargs.get("premium", "false"),
            "country_code": kwargs.get("country_code", "us"),
            "device_type": kwargs.get("device_type", "desktop"),
            "timeout": kwargs.get("timeout", 60)
        }
    
    async def _get_session(self):
        """Get or create aiohttp session"""
        if self.session is None:
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.config["timeout"])
            )
        return self.session
    
    async def scrape_url(self, url: str, **kwargs) -> Dict[str, Any]:
        """Scrape content from a specific URL"""
        session = await self._get_session()
        start_time = time.time()
        
        try:
            params = {
                "api_key": self.api_key,
                "url": url,
                "render_js": kwargs.get("render_js", self.config["render_js"]),
                "premium": kwargs.get("premium", self.config["premium"]),
                "country_code": kwargs.get("country_code", self.config["country_code"]),
                "device_type": kwargs.get("device_type", self.config["device_type"]),
                "session_number": kwargs.get("session_number"),
                "keep_headers": kwargs.get("keep_headers", "false"),
            }
            
            # Remove None values
            params = {k: v for k, v in params.items() if v is not None}
            
            async with session.get(self.base_url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"ScraperAPI error: {response.status} - {error_text}")
                
                html_content = await response.text()
                scrape_time = time.time() - start_time
                
                return {
                    "url": url,
                    "content": html_content,
                    "status_code": response.status,
                    "headers": dict(response.headers),
                    "scrape_time": scrape_time,
                    "content_length": len(html_content)
                }
        
        except Exception as e:
            self.logger.error(f"ScraperAPI request failed for {url}: {e}")
            raise
    
    async def search_google(self, query: str, num_results: int = 10, 
                          **kwargs) -> Dict[str, Any]:
        """Search Google and scrape results"""
        session = await self._get_session()
        start_time = time.time()
        
        try:
            # Build Google search URL
            search_url = self._build_google_search_url(query, num_results, kwargs)
            
            params = {
                "api_key": self.api_key,
                "url": search_url,
                "render_js": kwargs.get("render_js", self.config["render_js"]),
                "premium": kwargs.get("premium", self.config["premium"]),
                "country_code": kwargs.get("country_code", self.config["country_code"]),
                "device_type": kwargs.get("device_type", self.config["device_type"]),
            }
            
            # Remove None values
            params = {k: v for k, v in params.items() if v is not None}
            
            async with session.get(self.base_url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"ScraperAPI search error: {response.status} - {error_text}")
                
                html_content = await response.text()
                search_time = time.time() - start_time
                
                # Parse search results (simplified)
                results = self._parse_google_results(html_content)
                
                return {
                    "query": query,
                    "results": results,
                    "total_results": len(results),
                    "search_time": search_time,
                    "search_url": search_url,
                    "raw_html": html_content
                }
        
        except Exception as e:
            self.logger.error(f"ScraperAPI search failed for query '{query}': {e}")
            raise
    
    async def scrape_multiple_urls(self, urls: List[str], 
                                max_concurrent: int = 5) -> List[Dict[str, Any]]:
        """Scrape multiple URLs concurrently"""
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def scrape_single(url):
            async with semaphore:
                try:
                    return await self.scrape_url(url)
                except Exception as e:
                    return {
                        "url": url,
                        "error": str(e),
                        "success": False
                    }
        
        tasks = [scrape_single(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out exceptions and format results
        formatted_results = []
        for result in results:
            if isinstance(result, Exception):
                self.logger.error(f"Scraping task failed: {result}")
                continue
            formatted_results.append(result)
        
        return formatted_results
    
    async def get_account_info(self) -> Dict[str, Any]:
        """Get account information and usage stats"""
        session = await self._get_session()
        
        try:
            params = {
                "api_key": self.api_key,
                "account": "true"
            }
            
            async with session.get(self.base_url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"ScraperAPI account error: {response.status} - {error_text}")
                
                # Parse account information (simplified)
                text = await response.text()
                return {
                    "account_info": text,
                    "message": "Account information retrieved",
                    "raw_response": text
                }
        
        except Exception as e:
            self.logger.error(f"ScraperAPI account request failed: {e}")
            raise
    
    def _build_google_search_url(self, query: str, num_results: int, 
                               kwargs: Dict) -> str:
        """Build Google search URL"""
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
        search_type = kwargs.get("search_type", "web")
        if search_type == "news":
            params["tbm"] = "nws"
        elif search_type == "images":
            params["tbm"] = "isch"
        elif search_type == "videos":
            params["tbm"] = "vid"
        elif search_type == "shopping":
            params["tbm"] = "shop"
        
        # Remove None values
        params = {k: v for k, v in params.items() if v is not None}
        
        encoded_params = urllib.parse.urlencode(params)
        return f"{base_google_url}?{encoded_params}"
    
    def _parse_google_results(self, html_content: str) -> List[Dict[str, Any]]:
        """Parse Google search results from HTML (simplified)"""
        # This is a simplified parser - in production, you'd want to use
        # BeautifulSoup or similar for proper HTML parsing
        
        # For demonstration, return sample results
        # In a real implementation, you would parse the actual HTML structure
        sample_results = [
            {
                "title": "Sample Result 1",
                "url": "https://example.com/result1",
                "snippet": "This is a sample search result snippet...",
                "position": 1
            },
            {
                "title": "Sample Result 2", 
                "url": "https://example.com/result2",
                "snippet": "Another sample search result with different content...",
                "position": 2
            }
        ]
        
        return sample_results
    
    async def test_proxy(self, url: str = "https://httpbin.org/ip") -> Dict[str, Any]:
        """Test proxy connection"""
        try:
            result = await self.scrape_url(url)
            return {
                "success": True,
                "proxy_working": True,
                "ip_info": result.get("content", ""),
                "response_time": result.get("scrape_time", 0)
            }
        except Exception as e:
            return {
                "success": False,
                "proxy_working": False,
                "error": str(e)
            }
    
    async def get_usage_stats(self) -> Dict[str, Any]:
        """Get current usage statistics"""
        try:
            account_info = await self.get_account_info()
            
            # Parse usage from account info (simplified)
            return {
                "requests_today": 0,
                "requests_this_month": 0,
                "request_limit": 0,
                "remaining_requests": 0,
                "account_info": account_info.get("account_info", "")
            }
        except Exception as e:
            self.logger.error(f"Failed to get usage stats: {e}")
            return {
                "error": str(e)
            }
    
    async def close(self):
        """Close the session"""
        if self.session:
            await self.session.close()
            self.session = None
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
