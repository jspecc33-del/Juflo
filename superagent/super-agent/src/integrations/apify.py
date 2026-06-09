"""
Apify Integration

Integration with Apify platform for web automation,
data extraction, and actor management.
"""

import http.client
import json
import logging
import asyncio
from typing import Dict, List, Any, Optional
import aiohttp


class ApifyIntegration:
    """Integration with Apify platform"""
    
    def __init__(self, api_token: str):
        self.api_token = api_token
        self.base_url = "api.apify.com"
        self.session = None
        self.logger = logging.getLogger(__name__)
    
    async def _get_session(self):
        """Get or create aiohttp session"""
        if self.session is None:
            self.session = aiohttp.ClientSession()
        return self.session
    
    async def run_actor(self, actor_id: str, input_data: Dict[str, Any] = None,
                       run_options: Dict[str, Any] = None) -> Dict[str, Any]:
        """Run an Apify actor"""
        session = await self._get_session()
        
        try:
            # Build the URL for running actor
            url = f"https://{self.base_url}/v2/acts/{actor_id}/runs"
            
            headers = {
                "Authorization": f"Bearer {self.api_token}",
                "Content-Type": "application/json"
            }
            
            payload = {}
            if input_data:
                payload["input"] = input_data
            if run_options:
                payload.update(run_options)
            
            async with session.post(url, json=payload, headers=headers) as response:
                if response.status == 201:  # Created
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Run actor failed: {response.status} - {error_text}")
        
        except Exception as e:
            self.logger.error(f"Failed to run actor {actor_id}: {e}")
            raise
    
    async def get_run_status(self, run_id: str) -> Dict[str, Any]:
        """Get status of an actor run"""
        session = await self._get_session()
        
        try:
            url = f"https://{self.base_url}/v2/actor-runs/{run_id}"
            
            headers = {
                "Authorization": f"Bearer {self.api_token}"
            }
            
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get run status failed: {response.status} - {error_text}")
        
        except Exception as e:
            self.logger.error(f"Failed to get run status {run_id}: {e}")
            raise
    
    async def get_run_log(self, run_id: str) -> str:
        """Get log of an actor run"""
        session = await self._get_session()
        
        try:
            url = f"https://{self.base_url}/v2/actor-runs/{run_id}/log"
            
            headers = {
                "Authorization": f"Bearer {self.api_token}"
            }
            
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.text()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get run log failed: {response.status} - {error_text}")
        
        except Exception as e:
            self.logger.error(f"Failed to get run log {run_id}: {e}")
            raise
    
    async def get_run_results(self, run_id: str) -> List[Dict[str, Any]]:
        """Get results of an actor run"""
        session = await self._get_session()
        
        try:
            url = f"https://{self.base_url}/v2/actor-runs/{run_id}/items"
            
            headers = {
                "Authorization": f"Bearer {self.api_token}"
            }
            
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get run results failed: {response.status} - {error_text}")
        
        except Exception as e:
            self.logger.error(f"Failed to get run results {run_id}: {e}")
            raise
    
    async def list_actors(self, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """List available actors"""
        session = await self._get_session()
        
        try:
            params = {
                "limit": limit,
                "offset": offset
            }
            
            url = f"https://{self.base_url}/v2/actors"
            
            headers = {
                "Authorization": f"Bearer {self.api_token}"
            }
            
            async with session.get(url, headers=headers, params=params) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"List actors failed: {response.status} - {error_text}")
        
        except Exception as e:
            self.logger.error(f"Failed to list actors: {e}")
            raise
    
    async def get_actor_details(self, actor_id: str) -> Dict[str, Any]:
        """Get details of a specific actor"""
        session = await self._get_session()
        
        try:
            url = f"https://{self.base_url}/v2/acts/{actor_id}"
            
            headers = {
                "Authorization": f"Bearer {self.api_token}"
            }
            
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get actor details failed: {response.status} - {error_text}")
        
        except Exception as e:
            self.logger.error(f"Failed to get actor details {actor_id}: {e}")
            raise
    
    async def crawl_website(self, url: str, crawl_config: Dict[str, Any] = None) -> Dict[str, Any]:
        """Crawl a website using Website Content Crawler actor"""
        actor_id = "apify/website-content-crawler"
        
        default_config = {
            "startUrls": [{"url": url}],
            "maxCrawlDepth": 1,
            "maxCrawlPages": 10,
            "includeUrlGlobs": [],
            "excludeUrlGlobs": [],
            "ignoreSitemapLinks": False,
            "removeUrlFragment": True,
            "maxRetries": 3,
            "requestQueueTimeoutSecs": 180,
            "requestHandlerTimeoutSecs": 180,
            "handlePageTimeoutSecs": 60,
            "pageLoadTimeoutSecs": 60,
            "proxyConfiguration": {
                "useApifyProxy": True
            },
            "sessionPoolOptions": {
                "maxPoolSize": 100
            },
            "preNavigationHooks": [],
            "postNavigationHooks": [],
            "customData": {}
        }
        
        # Merge with provided config
        if crawl_config:
            default_config.update(crawl_config)
        
        return await self.run_actor(actor_id, default_config)
    
    async def scrape_youtube_transcript(self, video_url: str) -> Dict[str, Any]:
        """Scrape YouTube video transcript"""
        actor_id = "topaz_sharingan/Youtube-Transcript-Scraper-1"
        
        input_data = {
            "startUrls": [{"url": video_url}],
            "language": "en",
            "includeTimestamps": True
        }
        
        return await self.run_actor(actor_id, input_data)
    
    async def extract_contact_info(self, urls: List[str]) -> Dict[str, Any]:
        """Extract contact information from websites"""
        actor_id = "apify/contact-info-scraper"
        
        input_data = {
            "startUrls": [{"url": url} for url in urls],
            "maxResults": 10,
            "proxyConfiguration": {
                "useApifyProxy": True
            }
        }
        
        return await self.run_actor(actor_id, input_data)
    
    async def scrape_amazon_product(self, product_url: str) -> Dict[str, Any]:
        """Scrape Amazon product information"""
        actor_id = "streaming/scrape-amazon-product-details"
        
        input_data = {
            "startUrls": [{"url": product_url}],
            "proxyConfiguration": {
                "useApifyProxy": True
            }
        }
        
        return await self.run_actor(actor_id, input_data)
    
    async def search_google_results(self, query: str, max_results: int = 10) -> Dict[str, Any]:
        """Search Google and get results"""
        actor_id = "streaming/google-search-scraper"
        
        input_data = {
            "queries": [query],
            "maxResultsPerPage": max_results,
            "maxPages": 1,
            "proxyConfiguration": {
                "useApifyProxy": True
            }
        }
        
        return await self.run_actor(actor_id, input_data)
    
    async def monitor_run_until_finish(self, run_id: str, 
                                  timeout_seconds: int = 3600) -> Dict[str, Any]:
        """Monitor a run until it finishes or times out"""
        start_time = asyncio.get_event_loop().time()
        
        while True:
            # Check timeout
            if asyncio.get_event_loop().time() - start_time > timeout_seconds:
                raise Exception(f"Run {run_id} timed out after {timeout_seconds} seconds")
            
            # Get status
            status = await self.get_run_status(run_id)
            
            if status.get("status") in ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]:
                return status
            
            # Wait before checking again
            await asyncio.sleep(5)
    
    async def get_dataset_items(self, dataset_id: str, limit: int = 1000,
                             offset: int = 0) -> List[Dict[str, Any]]:
        """Get items from a dataset"""
        session = await self._get_session()
        
        try:
            params = {
                "limit": limit,
                "offset": offset
            }
            
            url = f"https://{self.base_url}/v2/datasets/{dataset_id}/items"
            
            headers = {
                "Authorization": f"Bearer {self.api_token}"
            }
            
            async with session.get(url, headers=headers, params=params) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get dataset items failed: {response.status} - {error_text}")
        
        except Exception as e:
            self.logger.error(f"Failed to get dataset items {dataset_id}: {e}")
            raise
    
    async def delete_dataset(self, dataset_id: str) -> bool:
        """Delete a dataset"""
        session = await self._get_session()
        
        try:
            url = f"https://{self.base_url}/v2/datasets/{dataset_id}"
            
            headers = {
                "Authorization": f"Bearer {self.api_token}"
            }
            
            async with session.delete(url, headers=headers) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Delete dataset failed: {response.status} - {error_text}")
        
        except Exception as e:
            self.logger.error(f"Failed to delete dataset {dataset_id}: {e}")
            raise
    
    async def get_user_info(self) -> Dict[str, Any]:
        """Get user account information"""
        session = await self._get_session()
        
        try:
            url = f"https://{self.base_url}/v2/users/me"
            
            headers = {
                "Authorization": f"Bearer {self.api_token}"
            }
            
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get user info failed: {response.status} - {error_text}")
        
        except Exception as e:
            self.logger.error(f"Failed to get user info: {e}")
            raise
    
    async def get_usage_stats(self) -> Dict[str, Any]:
        """Get usage statistics"""
        session = await self._get_session()
        
        try:
            url = f"https://{self.base_url}/v2/users/me/usage"
            
            headers = {
                "Authorization": f"Bearer {self.api_token}"
            }
            
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get usage stats failed: {response.status} - {error_text}")
        
        except Exception as e:
            self.logger.error(f"Failed to get usage stats: {e}")
            raise
    
    async def close(self):
        """Close the session"""
        if self.session:
            await self.session.close()
            self.session = None
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
