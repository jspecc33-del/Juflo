"""
Postman MCP Client

Client for interacting with Postman API MCP server
providing API testing, collection management, and monitoring capabilities.
"""

import json
import logging
import asyncio
from typing import Dict, List, Any, Optional
import aiohttp


class PostmanClient:
    """Client for Postman API MCP server operations"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.session = None
        self.base_url = config.get("base_url", "http://localhost:3003")
        self.api_key = config.get("api_key")
    
    async def connect(self):
        """Connect to Postman MCP server"""
        try:
            self.session = aiohttp.ClientSession()
            
            # Test connection
            async with self.session.get(f"{self.base_url}/health") as response:
                if response.status == 200:
                    self.logger.info("Connected to Postman MCP server")
                else:
                    raise Exception(f"Connection failed: {response.status}")
                    
        except Exception as e:
            self.logger.error(f"Failed to connect to Postman MCP server: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from Postman MCP server"""
        if self.session:
            await self.session.close()
            self.session = None
            self.logger.info("Disconnected from Postman MCP server")
    
    async def execute_request(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an API request"""
        try:
            payload = {
                "request": request_data,
                "api_key": self.api_key
            }
            
            async with self.session.post(
                f"{self.base_url}/requests/execute",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Execute request failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to execute request: {e}")
            raise
    
    async def get_collection(self, collection_id: str) -> Dict[str, Any]:
        """Get a Postman collection"""
        try:
            params = {
                "collection_id": collection_id,
                "api_key": self.api_key
            }
            
            async with self.session.get(
                f"{self.base_url}/collections/get",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get collection failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get collection {collection_id}: {e}")
            raise
    
    async def list_collections(self) -> List[Dict[str, Any]]:
        """List all Postman collections"""
        try:
            params = {"api_key": self.api_key}
            
            async with self.session.get(
                f"{self.base_url}/collections/list",
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("collections", [])
                else:
                    error_text = await response.text()
                    raise Exception(f"List collections failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to list collections: {e}")
            return []
    
    async def run_collection(self, collection_id: str, 
                          environment: Optional[str] = None) -> Dict[str, Any]:
        """Run a Postman collection"""
        try:
            payload = {
                "collection_id": collection_id,
                "api_key": self.api_key
            }
            
            if environment:
                payload["environment"] = environment
            
            async with self.session.post(
                f"{self.base_url}/collections/run",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Run collection failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to run collection {collection_id}: {e}")
            raise
    
    async def get_environment(self, environment_id: str) -> Dict[str, Any]:
        """Get a Postman environment"""
        try:
            params = {
                "environment_id": environment_id,
                "api_key": self.api_key
            }
            
            async with self.session.get(
                f"{self.base_url}/environments/get",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get environment failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get environment {environment_id}: {e}")
            raise
    
    async def list_environments(self) -> List[Dict[str, Any]]:
        """List all Postman environments"""
        try:
            params = {"api_key": self.api_key}
            
            async with self.session.get(
                f"{self.base_url}/environments/list",
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("environments", [])
                else:
                    error_text = await response.text()
                    raise Exception(f"List environments failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to list environments: {e}")
            return []
    
    async def create_monitor(self, monitor_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a Postman monitor"""
        try:
            payload = {
                "monitor": monitor_data,
                "api_key": self.api_key
            }
            
            async with self.session.post(
                f"{self.base_url}/monitors/create",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Create monitor failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to create monitor: {e}")
            raise
    
    async def get_monitor_results(self, monitor_id: str, 
                              limit: int = 50) -> List[Dict[str, Any]]:
        """Get monitor execution results"""
        try:
            params = {
                "monitor_id": monitor_id,
                "limit": limit,
                "api_key": self.api_key
            }
            
            async with self.session.get(
                f"{self.base_url}/monitors/results",
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("results", [])
                else:
                    error_text = await response.text()
                    raise Exception(f"Get monitor results failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get monitor results for {monitor_id}: {e}")
            return []
    
    async def test_api_endpoint(self, url: str, method: str = "GET", 
                             headers: Optional[Dict] = None,
                             body: Optional[str] = None) -> Dict[str, Any]:
        """Quick test of an API endpoint"""
        try:
            request_data = {
                "url": url,
                "method": method.upper()
            }
            
            if headers:
                request_data["headers"] = headers
            
            if body:
                request_data["body"] = body
            
            return await self.execute_request(request_data)
            
        except Exception as e:
            self.logger.error(f"Failed to test API endpoint {url}: {e}")
            raise
    
    async def validate_response_schema(self, response_data: Dict[str, Any], 
                                   schema: Dict[str, Any]) -> Dict[str, Any]:
        """Validate API response against schema"""
        try:
            payload = {
                "response": response_data,
                "schema": schema,
                "api_key": self.api_key
            }
            
            async with self.session.post(
                f"{self.base_url}/validation/schema",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Schema validation failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to validate response schema: {e}")
            raise
    
    async def generate_test_script(self, request_data: Dict[str, Any]) -> str:
        """Generate test script for a request"""
        try:
            payload = {
                "request": request_data,
                "api_key": self.api_key
            }
            
            async with self.session.post(
                f"{self.base_url}/scripts/generate",
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("script", "")
                else:
                    error_text = await response.text()
                    raise Exception(f"Generate test script failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to generate test script: {e}")
            raise
    
    async def mock_api_response(self, mock_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create API mock"""
        try:
            payload = {
                "mock": mock_data,
                "api_key": self.api_key
            }
            
            async with self.session.post(
                f"{self.base_url}/mocks/create",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Create mock failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to create API mock: {e}")
            raise
    
    async def get_api_documentation(self, collection_id: str) -> Dict[str, Any]:
        """Generate API documentation from collection"""
        try:
            params = {
                "collection_id": collection_id,
                "api_key": self.api_key
            }
            
            async with self.session.get(
                f"{self.base_url}/documentation/generate",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Generate documentation failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to generate documentation for {collection_id}: {e}")
            raise
    
    async def analyze_api_performance(self, collection_id: str, 
                                  time_range: str = "7d") -> Dict[str, Any]:
        """Analyze API performance metrics"""
        try:
            params = {
                "collection_id": collection_id,
                "time_range": time_range,
                "api_key": self.api_key
            }
            
            async with self.session.get(
                f"{self.base_url}/analytics/performance",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Performance analysis failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to analyze performance for {collection_id}: {e}")
            raise
    
    async def export_collection(self, collection_id: str, 
                             format: str = "json") -> Dict[str, Any]:
        """Export collection in specified format"""
        try:
            params = {
                "collection_id": collection_id,
                "format": format,
                "api_key": self.api_key
            }
            
            async with self.session.get(
                f"{self.base_url}/collections/export",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Export collection failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to export collection {collection_id}: {e}")
            raise
