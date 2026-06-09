"""
Memory MCP Client

Client for interacting with memory MCP server
providing persistent storage, retrieval, and search capabilities.
"""

import json
import logging
import asyncio
from typing import Dict, List, Any, Optional
import aiohttp


class MemoryClient:
    """Client for memory MCP server operations"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.session = None
        self.base_url = config.get("base_url", "http://localhost:3002")
    
    async def connect(self):
        """Connect to memory MCP server"""
        try:
            self.session = aiohttp.ClientSession()
            
            # Test connection
            async with self.session.get(f"{self.base_url}/health") as response:
                if response.status == 200:
                    self.logger.info("Connected to memory MCP server")
                else:
                    raise Exception(f"Connection failed: {response.status}")
                    
        except Exception as e:
            self.logger.error(f"Failed to connect to memory MCP server: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from memory MCP server"""
        if self.session:
            await self.session.close()
            self.session = None
            self.logger.info("Disconnected from memory MCP server")
    
    async def ping(self) -> bool:
        """Ping the memory server"""
        try:
            async with self.session.get(f"{self.base_url}/ping") as response:
                return response.status == 200
        except Exception as e:
            self.logger.error(f"Memory server ping failed: {e}")
            return False
    
    async def store(self, namespace: str, key: str, value: Any, 
                   ttl: Optional[int] = None) -> bool:
        """Store data in memory"""
        try:
            payload = {
                "namespace": namespace,
                "key": key,
                "value": value
            }
            
            if ttl:
                payload["ttl"] = ttl
            
            async with self.session.post(
                f"{self.base_url}/memory/store",
                json=payload
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Store failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to store {key} in {namespace}: {e}")
            raise
    
    async def retrieve(self, namespace: str, key: str) -> Optional[Any]:
        """Retrieve data from memory"""
        try:
            params = {
                "namespace": namespace,
                "key": key
            }
            
            async with self.session.get(
                f"{self.base_url}/memory/retrieve",
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("value")
                elif response.status == 404:
                    return None
                else:
                    error_text = await response.text()
                    raise Exception(f"Retrieve failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to retrieve {key} from {namespace}: {e}")
            return None
    
    async def delete(self, namespace: str, key: str) -> bool:
        """Delete data from memory"""
        try:
            params = {
                "namespace": namespace,
                "key": key
            }
            
            async with self.session.delete(
                f"{self.base_url}/memory/delete",
                params=params
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Delete failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to delete {key} from {namespace}: {e}")
            raise
    
    async def list(self, namespace: str, prefix: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all keys in a namespace"""
        try:
            params = {"namespace": namespace}
            if prefix:
                params["prefix"] = prefix
            
            async with self.session.get(
                f"{self.base_url}/memory/list",
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("items", [])
                else:
                    error_text = await response.text()
                    raise Exception(f"List failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to list {namespace}: {e}")
            return []
    
    async def search(self, namespace: str, query: str, 
                   limit: int = 20) -> List[Dict[str, Any]]:
        """Search memory for content matching query"""
        try:
            payload = {
                "namespace": namespace,
                "query": query,
                "limit": limit
            }
            
            async with self.session.post(
                f"{self.base_url}/memory/search",
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("results", [])
                else:
                    error_text = await response.text()
                    raise Exception(f"Search failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to search {namespace} for '{query}': {e}")
            return []
    
    async def clear_namespace(self, namespace: str) -> bool:
        """Clear all data in a namespace"""
        try:
            payload = {"namespace": namespace}
            
            async with self.session.post(
                f"{self.base_url}/memory/clear",
                json=payload
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Clear namespace failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to clear namespace {namespace}: {e}")
            raise
    
    async def get_namespace_stats(self, namespace: str) -> Dict[str, Any]:
        """Get statistics for a namespace"""
        try:
            params = {"namespace": namespace}
            
            async with self.session.get(
                f"{self.base_url}/memory/stats",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get stats failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get stats for {namespace}: {e}")
            return {}
    
    async def backup_namespace(self, namespace: str) -> Dict[str, Any]:
        """Backup all data in a namespace"""
        try:
            params = {"namespace": namespace}
            
            async with self.session.get(
                f"{self.base_url}/memory/backup",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Backup failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to backup namespace {namespace}: {e}")
            raise
    
    async def restore_namespace(self, namespace: str, backup_data: Dict[str, Any]) -> bool:
        """Restore namespace from backup data"""
        try:
            payload = {
                "namespace": namespace,
                "backup_data": backup_data
            }
            
            async with self.session.post(
                f"{self.base_url}/memory/restore",
                json=payload
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Restore failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to restore namespace {namespace}: {e}")
            raise
    
    async def set_ttl(self, namespace: str, key: str, ttl: int) -> bool:
        """Set TTL for a specific key"""
        try:
            payload = {
                "namespace": namespace,
                "key": key,
                "ttl": ttl
            }
            
            async with self.session.post(
                f"{self.base_url}/memory/ttl",
                json=payload
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Set TTL failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to set TTL for {key} in {namespace}: {e}")
            raise
    
    async def get_ttl(self, namespace: str, key: str) -> Optional[int]:
        """Get TTL for a specific key"""
        try:
            params = {
                "namespace": namespace,
                "key": key
            }
            
            async with self.session.get(
                f"{self.base_url}/memory/ttl",
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("ttl")
                else:
                    error_text = await response.text()
                    raise Exception(f"Get TTL failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get TTL for {key} in {namespace}: {e}")
            return None
    
    async def compact_namespace(self, namespace: str) -> bool:
        """Compact namespace to remove expired entries"""
        try:
            payload = {"namespace": namespace}
            
            async with self.session.post(
                f"{self.base_url}/memory/compact",
                json=payload
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Compact failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to compact namespace {namespace}: {e}")
            raise
