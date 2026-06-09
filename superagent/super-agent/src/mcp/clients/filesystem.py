"""
Filesystem MCP Client

Client for interacting with the filesystem MCP server
providing file operations, directory management, and file system utilities.
"""

import json
import logging
import asyncio
from typing import Dict, List, Any, Optional
import aiohttp


class FilesystemClient:
    """Client for filesystem MCP server operations"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.session = None
        self.base_url = config.get("base_url", "http://localhost:3000")
    
    async def connect(self):
        """Connect to filesystem MCP server"""
        try:
            self.session = aiohttp.ClientSession()
            
            # Test connection
            async with self.session.get(f"{self.base_url}/health") as response:
                if response.status == 200:
                    self.logger.info("Connected to filesystem MCP server")
                else:
                    raise Exception(f"Connection failed: {response.status}")
                    
        except Exception as e:
            self.logger.error(f"Failed to connect to filesystem MCP server: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from filesystem MCP server"""
        if self.session:
            await self.session.close()
            self.session = None
            self.logger.info("Disconnected from filesystem MCP server")
    
    async def read_file(self, path: str) -> str:
        """Read file contents"""
        try:
            async with self.session.get(
                f"{self.base_url}/files/read",
                params={"path": path}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("content", "")
                else:
                    error_text = await response.text()
                    raise Exception(f"Read failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to read file {path}: {e}")
            raise
    
    async def write_file(self, path: str, content: str) -> bool:
        """Write content to file"""
        try:
            payload = {
                "path": path,
                "content": content
            }
            
            async with self.session.post(
                f"{self.base_url}/files/write",
                json=payload
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Write failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to write file {path}: {e}")
            raise
    
    async def list_directory(self, path: str) -> List[Dict[str, Any]]:
        """List directory contents"""
        try:
            async with self.session.get(
                f"{self.base_url}/directories/list",
                params={"path": path}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("items", [])
                else:
                    error_text = await response.text()
                    raise Exception(f"List failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to list directory {path}: {e}")
            raise
    
    async def create_directory(self, path: str) -> bool:
        """Create directory"""
        try:
            payload = {"path": path}
            
            async with self.session.post(
                f"{self.base_url}/directories/create",
                json=payload
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Create directory failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to create directory {path}: {e}")
            raise
    
    async def delete_file(self, path: str) -> bool:
        """Delete file"""
        try:
            async with self.session.delete(
                f"{self.base_url}/files/delete",
                params={"path": path}
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Delete failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to delete file {path}: {e}")
            raise
    
    async def delete_directory(self, path: str, recursive: bool = False) -> bool:
        """Delete directory"""
        try:
            async with self.session.delete(
                f"{self.base_url}/directories/delete",
                params={"path": path, "recursive": recursive}
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Delete directory failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to delete directory {path}: {e}")
            raise
    
    async def copy_file(self, source: str, destination: str) -> bool:
        """Copy file"""
        try:
            payload = {
                "source": source,
                "destination": destination
            }
            
            async with self.session.post(
                f"{self.base_url}/files/copy",
                json=payload
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Copy failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to copy file {source} to {destination}: {e}")
            raise
    
    async def move_file(self, source: str, destination: str) -> bool:
        """Move file"""
        try:
            payload = {
                "source": source,
                "destination": destination
            }
            
            async with self.session.post(
                f"{self.base_url}/files/move",
                json=payload
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Move failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to move file {source} to {destination}: {e}")
            raise
    
    async def get_file_info(self, path: str) -> Dict[str, Any]:
        """Get file metadata"""
        try:
            async with self.session.get(
                f"{self.base_url}/files/info",
                params={"path": path}
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get info failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get file info for {path}: {e}")
            raise
    
    async def search_files(self, directory: str, pattern: str, 
                         recursive: bool = True) -> List[Dict[str, Any]]:
        """Search for files matching pattern"""
        try:
            params = {
                "directory": directory,
                "pattern": pattern,
                "recursive": recursive
            }
            
            async with self.session.get(
                f"{self.base_url}/files/search",
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("results", [])
                else:
                    error_text = await response.text()
                    raise Exception(f"Search failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to search files in {directory}: {e}")
            raise
    
    async def watch_directory(self, path: str, callback) -> None:
        """Watch directory for changes (WebSocket)"""
        try:
            ws_url = f"{self.base_url.replace('http', 'ws')}/directories/watch"
            params = {"path": path}
            
            async with self.session.ws_connect(ws_url, params=params) as ws:
                self.logger.info(f"Watching directory {path} for changes")
                
                async for msg in ws:
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        data = json.loads(msg.data)
                        await callback(data)
                    elif msg.type == aiohttp.WSMsgType.ERROR:
                        self.logger.error(f"WebSocket error: {ws.exception()}")
                        break
                        
        except Exception as e:
            self.logger.error(f"Failed to watch directory {path}: {e}")
            raise
    
    async def get_directory_tree(self, path: str, max_depth: int = 3) -> Dict[str, Any]:
        """Get directory tree structure"""
        try:
            params = {
                "path": path,
                "max_depth": max_depth
            }
            
            async with self.session.get(
                f"{self.base_url}/directories/tree",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get tree failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get directory tree for {path}: {e}")
            raise
    
    async def calculate_directory_size(self, path: str) -> int:
        """Calculate total size of directory"""
        try:
            async with self.session.get(
                f"{self.base_url}/directories/size",
                params={"path": path}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("size", 0)
                else:
                    error_text = await response.text()
                    raise Exception(f"Calculate size failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to calculate directory size for {path}: {e}")
            raise
