"""
Puppeteer MCP Client

Client for interacting with Puppeteer MCP server
providing browser automation, web scraping, and testing capabilities.
"""

import json
import logging
import asyncio
import base64
from typing import Dict, List, Any, Optional
import aiohttp


class PuppeteerClient:
    """Client for Puppeteer MCP server operations"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.session = None
        self.base_url = config.get("base_url", "http://localhost:3002")
        self.browser = None
        self.page = None
    
    async def connect(self):
        """Connect to Puppeteer MCP server"""
        try:
            self.session = aiohttp.ClientSession()
            
            # Test connection
            async with self.session.get(f"{self.base_url}/health") as response:
                if response.status == 200:
                    # Launch browser
                    launch_data = {
                        "headless": self.config.get("headless", True),
                        "args": ["--no-sandbox", "--disable-setuid-sandbox"]
                    }
                    
                    async with self.session.post(
                        f"{self.base_url}/browser/launch",
                        json=launch_data
                    ) as launch_response:
                        if launch_response.status == 200:
                            launch_result = await launch_response.json()
                            self.browser = launch_result.get("browser_id")
                            self.logger.info(f"Connected to Puppeteer MCP server, browser: {self.browser}")
                            
                            # Create new page
                            await self._create_page()
                        else:
                            raise Exception(f"Browser launch failed: {launch_response.status}")
                else:
                    raise Exception(f"Puppeteer MCP server health check failed: {response.status}")
                    
        except Exception as e:
            self.logger.error(f"Failed to connect to Puppeteer MCP server: {str(e)}")
            raise
    
    async def _create_page(self):
        """Create a new page in the browser"""
        try:
            async with self.session.post(
                f"{self.base_url}/page/new",
                json={"browser_id": self.browser}
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    self.page = result.get("page_id")
                    self.logger.info(f"Created new page: {self.page}")
                else:
                    raise Exception(f"Failed to create page: {response.status}")
        except Exception as e:
            self.logger.error(f"Failed to create page: {str(e)}")
            raise
    
    async def navigate(self, url: str, wait_until: str = "networkidle0") -> Dict[str, Any]:
        """Navigate to a URL"""
        try:
            async with self.session.post(
                f"{self.base_url}/page/navigate",
                json={
                    "page_id": self.page,
                    "url": url,
                    "wait_until": wait_until
                }
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    self.logger.info(f"Navigated to {url}")
                    return result
                else:
                    raise Exception(f"Navigation failed: {response.status}")
        except Exception as e:
            self.logger.error(f"Failed to navigate to {url}: {str(e)}")
            raise
    
    async def screenshot(self, selector: Optional[str] = None, full_page: bool = False) -> str:
        """Take a screenshot"""
        try:
            data = {
                "page_id": self.page,
                "full_page": full_page
            }
            if selector:
                data["selector"] = selector
            
            async with self.session.post(
                f"{self.base_url}/page/screenshot",
                json=data
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    screenshot_data = result.get("screenshot")
                    self.logger.info("Screenshot captured")
                    return screenshot_data
                else:
                    raise Exception(f"Screenshot failed: {response.status}")
        except Exception as e:
            self.logger.error(f"Failed to take screenshot: {str(e)}")
            raise
    
    async def click(self, selector: str) -> Dict[str, Any]:
        """Click an element"""
        try:
            async with self.session.post(
                f"{self.base_url}/element/click",
                json={
                    "page_id": self.page,
                    "selector": selector
                }
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    self.logger.info(f"Clicked element: {selector}")
                    return result
                else:
                    raise Exception(f"Click failed: {response.status}")
        except Exception as e:
            self.logger.error(f"Failed to click element {selector}: {str(e)}")
            raise
    
    async def type(self, selector: str, text: str) -> Dict[str, Any]:
        """Type text into an element"""
        try:
            async with self.session.post(
                f"{self.base_url}/element/type",
                json={
                    "page_id": self.page,
                    "selector": selector,
                    "text": text
                }
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    self.logger.info(f"Typed text into element: {selector}")
                    return result
                else:
                    raise Exception(f"Type failed: {response.status}")
        except Exception as e:
            self.logger.error(f"Failed to type into element {selector}: {str(e)}")
            raise
    
    async def evaluate(self, script: str) -> Any:
        """Evaluate JavaScript in the page"""
        try:
            async with self.session.post(
                f"{self.base_url}/page/evaluate",
                json={
                    "page_id": self.page,
                    "script": script
                }
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    self.logger.info("Script evaluated successfully")
                    return result.get("result")
                else:
                    raise Exception(f"Script evaluation failed: {response.status}")
        except Exception as e:
            self.logger.error(f"Failed to evaluate script: {str(e)}")
            raise
    
    async def get_text(self, selector: str) -> str:
        """Get text content of an element"""
        try:
            async with self.session.post(
                f"{self.base_url}/element/get-text",
                json={
                    "page_id": self.page,
                    "selector": selector
                }
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return result.get("text", "")
                else:
                    raise Exception(f"Get text failed: {response.status}")
        except Exception as e:
            self.logger.error(f"Failed to get text from {selector}: {str(e)}")
            raise
    
    async def get_html(self, selector: Optional[str] = None) -> str:
        """Get HTML content"""
        try:
            data = {"page_id": self.page}
            if selector:
                data["selector"] = selector
            
            async with self.session.post(
                f"{self.base_url}/page/get-html",
                json=data
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return result.get("html", "")
                else:
                    raise Exception(f"Get HTML failed: {response.status}")
        except Exception as e:
            self.logger.error(f"Failed to get HTML: {str(e)}")
            raise
    
    async def close(self):
        """Close browser and cleanup"""
        try:
            if self.page:
                async with self.session.post(
                    f"{self.base_url}/page/close",
                    json={"page_id": self.page}
                ):
                    pass
            
            if self.browser:
                async with self.session.post(
                    f"{self.base_url}/browser/close",
                    json={"browser_id": self.browser}
                ):
                    pass
            
            if self.session:
                await self.session.close()
            
            self.logger.info("Puppeteer MCP client closed")
        except Exception as e:
            self.logger.error(f"Error during cleanup: {str(e)}")


class PuppeteerMCPIntegration:
    """High-level integration for Puppeteer MCP operations"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.client = PuppeteerClient(config)
    
    async def __aenter__(self):
        await self.client.connect()
        return self.client
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.close()
    
    async def scrape_page(self, url: str, selectors: Dict[str, str]) -> Dict[str, Any]:
        """Scrape data from a page"""
        try:
            await self.client.navigate(url)
            
            results = {}
            for key, selector in selectors.items():
                try:
                    text = await self.client.get_text(selector)
                    results[key] = text
                except Exception as e:
                    self.logger.warning(f"Failed to get {key}: {str(e)}")
                    results[key] = None
            
            return results
        except Exception as e:
            self.logger.error(f"Scraping failed: {str(e)}")
            raise
    
    async def perform_action_sequence(self, url: str, actions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Perform a sequence of actions on a page"""
        try:
            await self.client.navigate(url)
            
            results = []
            for action in actions:
                action_type = action.get("type")
                
                if action_type == "click":
                    result = await self.client.click(action["selector"])
                elif action_type == "type":
                    result = await self.client.type(action["selector"], action["text"])
                elif action_type == "screenshot":
                    result = await self.client.screenshot(action.get("selector"))
                elif action_type == "evaluate":
                    result = await self.client.evaluate(action["script"])
                else:
                    raise ValueError(f"Unknown action type: {action_type}")
                
                results.append({
                    "action": action_type,
                    "result": result
                })
            
            return {"actions": results}
        except Exception as e:
            self.logger.error(f"Action sequence failed: {str(e)}")
            raise
