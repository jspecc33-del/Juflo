"""
Playwright MCP Client

Client for interacting with Playwright MCP server
providing browser automation, web scraping, and testing capabilities.
"""

import json
import logging
import asyncio
import base64
from typing import Dict, List, Any, Optional
import aiohttp


class PlaywrightClient:
    """Client for Playwright MCP server operations"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.session = None
        self.base_url = config.get("base_url", "http://localhost:3001")
        self.browser_id = None
    
    async def connect(self):
        """Connect to Playwright MCP server"""
        try:
            self.session = aiohttp.ClientSession()
            
            # Test connection and launch browser
            async with self.session.get(f"{self.base_url}/health") as response:
                if response.status == 200:
                    # Launch browser
                    launch_data = {
                        "headless": self.config.get("headless", True),
                        "browser": self.config.get("browser", "chromium")
                    }
                    
                    async with self.session.post(
                        f"{self.base_url}/browser/launch",
                        json=launch_data
                    ) as launch_response:
                        if launch_response.status == 200:
                            launch_result = await launch_response.json()
                            self.browser_id = launch_result.get("browser_id")
                            self.logger.info(f"Connected to Playwright MCP server, browser ID: {self.browser_id}")
                        else:
                            raise Exception(f"Browser launch failed: {launch_response.status}")
                else:
                    raise Exception(f"Connection failed: {response.status}")
                    
        except Exception as e:
            self.logger.error(f"Failed to connect to Playwright MCP server: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from Playwright MCP server"""
        if self.session:
            if self.browser_id:
                try:
                    await self.session.post(
                        f"{self.base_url}/browser/close",
                        json={"browser_id": self.browser_id}
                    )
                except Exception as e:
                    self.logger.error(f"Error closing browser: {e}")
            
            await self.session.close()
            self.session = None
            self.browser_id = None
            self.logger.info("Disconnected from Playwright MCP server")
    
    async def navigate(self, url: str) -> Dict[str, Any]:
        """Navigate to a URL"""
        try:
            payload = {
                "browser_id": self.browser_id,
                "url": url
            }
            
            async with self.session.post(
                f"{self.base_url}/page/navigate",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Navigate failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to navigate to {url}: {e}")
            raise
    
    async def click(self, selector: str, button: str = "left") -> Dict[str, Any]:
        """Click on an element"""
        try:
            payload = {
                "browser_id": self.browser_id,
                "selector": selector,
                "button": button
            }
            
            async with self.session.post(
                f"{self.base_url}/page/click",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Click failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to click {selector}: {e}")
            raise
    
    async def type_text(self, selector: str, text: str, clear: bool = True) -> Dict[str, Any]:
        """Type text into an element"""
        try:
            payload = {
                "browser_id": self.browser_id,
                "selector": selector,
                "text": text,
                "clear": clear
            }
            
            async with self.session.post(
                f"{self.base_url}/page/type",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Type failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to type text into {selector}: {e}")
            raise
    
    async def screenshot(self, selector: Optional[str] = None, 
                      full_page: bool = False) -> str:
        """Take screenshot"""
        try:
            payload = {
                "browser_id": self.browser_id,
                "full_page": full_page
            }
            
            if selector:
                payload["selector"] = selector
            
            async with self.session.post(
                f"{self.base_url}/page/screenshot",
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("image", "")
                else:
                    error_text = await response.text()
                    raise Exception(f"Screenshot failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to take screenshot: {e}")
            raise
    
    async def get_page_content(self) -> str:
        """Get page HTML content"""
        try:
            payload = {"browser_id": self.browser_id}
            
            async with self.session.post(
                f"{self.base_url}/page/content",
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("content", "")
                else:
                    error_text = await response.text()
                    raise Exception(f"Get content failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get page content: {e}")
            raise
    
    async def wait_for_element(self, selector: str, timeout: int = 30000) -> Dict[str, Any]:
        """Wait for element to appear"""
        try:
            payload = {
                "browser_id": self.browser_id,
                "selector": selector,
                "timeout": timeout
            }
            
            async with self.session.post(
                f"{self.base_url}/page/wait",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Wait for element failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to wait for element {selector}: {e}")
            raise
    
    async def get_element_text(self, selector: str) -> str:
        """Get text content of an element"""
        try:
            payload = {
                "browser_id": self.browser_id,
                "selector": selector
            }
            
            async with self.session.post(
                f"{self.base_url}/element/text",
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("text", "")
                else:
                    error_text = await response.text()
                    raise Exception(f"Get element text failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get text from {selector}: {e}")
            raise
    
    async def get_element_attribute(self, selector: str, attribute: str) -> str:
        """Get attribute value of an element"""
        try:
            payload = {
                "browser_id": self.browser_id,
                "selector": selector,
                "attribute": attribute
            }
            
            async with self.session.post(
                f"{self.base_url}/element/attribute",
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("value", "")
                else:
                    error_text = await response.text()
                    raise Exception(f"Get element attribute failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get attribute {attribute} from {selector}: {e}")
            raise
    
    async def execute_script(self, script: str) -> Any:
        """Execute JavaScript in the page"""
        try:
            payload = {
                "browser_id": self.browser_id,
                "script": script
            }
            
            async with self.session.post(
                f"{self.base_url}/page/execute",
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("result")
                else:
                    error_text = await response.text()
                    raise Exception(f"Execute script failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to execute script: {e}")
            raise
    
    async def scroll_to_element(self, selector: str) -> Dict[str, Any]:
        """Scroll to an element"""
        try:
            payload = {
                "browser_id": self.browser_id,
                "selector": selector
            }
            
            async with self.session.post(
                f"{self.base_url}/page/scroll",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Scroll to element failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to scroll to element {selector}: {e}")
            raise
    
    async def select_option(self, selector: str, value: str) -> Dict[str, Any]:
        """Select option from dropdown"""
        try:
            payload = {
                "browser_id": self.browser_id,
                "selector": selector,
                "value": value
            }
            
            async with self.session.post(
                f"{self.base_url}/element/select",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Select option failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to select option {value} from {selector}: {e}")
            raise
    
    async def hover(self, selector: str) -> Dict[str, Any]:
        """Hover over an element"""
        try:
            payload = {
                "browser_id": self.browser_id,
                "selector": selector
            }
            
            async with self.session.post(
                f"{self.base_url}/page/hover",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Hover failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to hover over {selector}: {e}")
            raise
    
    async def get_page_title(self) -> str:
        """Get page title"""
        try:
            payload = {"browser_id": self.browser_id}
            
            async with self.session.post(
                f"{self.base_url}/page/title",
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("title", "")
                else:
                    error_text = await response.text()
                    raise Exception(f"Get title failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get page title: {e}")
            raise
    
    async def get_current_url(self) -> str:
        """Get current page URL"""
        try:
            payload = {"browser_id": self.browser_id}
            
            async with self.session.post(
                f"{self.base_url}/page/url",
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("url", "")
                else:
                    error_text = await response.text()
                    raise Exception(f"Get URL failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get current URL: {e}")
            raise
    
    async def go_back(self) -> Dict[str, Any]:
        """Navigate back in history"""
        try:
            payload = {"browser_id": self.browser_id}
            
            async with self.session.post(
                f"{self.base_url}/page/back",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Go back failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to go back: {e}")
            raise
    
    async def go_forward(self) -> Dict[str, Any]:
        """Navigate forward in history"""
        try:
            payload = {"browser_id": self.browser_id}
            
            async with self.session.post(
                f"{self.base_url}/page/forward",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Go forward failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to go forward: {e}")
            raise
    
    async def refresh_page(self) -> Dict[str, Any]:
        """Refresh current page"""
        try:
            payload = {"browser_id": self.browser_id}
            
            async with self.session.post(
                f"{self.base_url}/page/refresh",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Refresh failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to refresh page: {e}")
            raise
