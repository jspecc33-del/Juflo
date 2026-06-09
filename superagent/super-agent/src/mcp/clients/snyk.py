"""
Snyk MCP Client

Client for interacting with Snyk MCP server
providing security scanning, vulnerability assessment, and dependency analysis.
"""

import json
import logging
import asyncio
from typing import Dict, List, Any, Optional
import aiohttp


class SnykClient:
    """Client for Snyk MCP server operations"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.session = None
        self.base_url = config.get("base_url", "http://localhost:3004")
        self.api_token = config.get("api_token")
    
    async def connect(self):
        """Connect to Snyk MCP server"""
        try:
            self.session = aiohttp.ClientSession()
            
            # Test connection
            async with self.session.get(f"{self.base_url}/health") as response:
                if response.status == 200:
                    self.logger.info("Connected to Snyk MCP server")
                else:
                    raise Exception(f"Connection failed: {response.status}")
                    
        except Exception as e:
            self.logger.error(f"Failed to connect to Snyk MCP server: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from Snyk MCP server"""
        if self.session:
            await self.session.close()
            self.session = None
            self.logger.info("Disconnected from Snyk MCP server")
    
    async def scan(self, target: Dict[str, Any]) -> Dict[str, Any]:
        """Perform security scan"""
        try:
            payload = {
                "target": target,
                "api_token": self.api_token
            }
            
            async with self.session.post(
                f"{self.base_url}/scan/execute",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Scan failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to scan target: {e}")
            raise
    
    async def scan_file(self, file_path: str, file_type: str = "auto") -> Dict[str, Any]:
        """Scan a single file for vulnerabilities"""
        try:
            payload = {
                "file_path": file_path,
                "file_type": file_type,
                "api_token": self.api_token
            }
            
            async with self.session.post(
                f"{self.base_url}/scan/file",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"File scan failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to scan file {file_path}: {e}")
            raise
    
    async def scan_directory(self, directory_path: str, 
                          recursive: bool = True) -> Dict[str, Any]:
        """Scan directory for vulnerabilities"""
        try:
            payload = {
                "directory_path": directory_path,
                "recursive": recursive,
                "api_token": self.api_token
            }
            
            async with self.session.post(
                f"{self.base_url}/scan/directory",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Directory scan failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to scan directory {directory_path}: {e}")
            raise
    
    async def scan_dependencies(self, manifest_path: str) -> Dict[str, Any]:
        """Scan dependencies from manifest file"""
        try:
            payload = {
                "manifest_path": manifest_path,
                "api_token": self.api_token
            }
            
            async with self.session.post(
                f"{self.base_url}/scan/dependencies",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Dependency scan failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to scan dependencies {manifest_path}: {e}")
            raise
    
    async def scan_container_image(self, image_name: str, 
                                tag: str = "latest") -> Dict[str, Any]:
        """Scan container image for vulnerabilities"""
        try:
            payload = {
                "image_name": image_name,
                "tag": tag,
                "api_token": self.api_token
            }
            
            async with self.session.post(
                f"{self.base_url}/scan/container",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Container scan failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to scan container image {image_name}:{tag}: {e}")
            raise
    
    async def get_scan_result(self, scan_id: str) -> Dict[str, Any]:
        """Get results of a specific scan"""
        try:
            params = {
                "scan_id": scan_id,
                "api_token": self.api_token
            }
            
            async with self.session.get(
                f"{self.base_url}/scan/result",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get scan result failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get scan result {scan_id}: {e}")
            raise
    
    async def list_vulnerabilities(self, severity: Optional[str] = None,
                                limit: int = 50) -> List[Dict[str, Any]]:
        """List vulnerabilities with optional filtering"""
        try:
            params = {
                "limit": limit,
                "api_token": self.api_token
            }
            
            if severity:
                params["severity"] = severity
            
            async with self.session.get(
                f"{self.base_url}/vulnerabilities/list",
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("vulnerabilities", [])
                else:
                    error_text = await response.text()
                    raise Exception(f"List vulnerabilities failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to list vulnerabilities: {e}")
            return []
    
    async def get_vulnerability_details(self, vuln_id: str) -> Dict[str, Any]:
        """Get detailed information about a vulnerability"""
        try:
            params = {
                "vuln_id": vuln_id,
                "api_token": self.api_token
            }
            
            async with self.session.get(
                f"{self.base_url}/vulnerabilities/details",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get vulnerability details failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get vulnerability details {vuln_id}: {e}")
            raise
    
    async def generate_security_report(self, scan_id: str, 
                                   format: str = "json") -> Dict[str, Any]:
        """Generate security report"""
        try:
            payload = {
                "scan_id": scan_id,
                "format": format,
                "api_token": self.api_token
            }
            
            async with self.session.post(
                f"{self.base_url}/reports/generate",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Generate report failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to generate security report for {scan_id}: {e}")
            raise
    
    async def monitor_project(self, project_path: str) -> Dict[str, Any]:
        """Set up monitoring for a project"""
        try:
            payload = {
                "project_path": project_path,
                "api_token": self.api_token
            }
            
            async with self.session.post(
                f"{self.base_url}/monitoring/setup",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Setup monitoring failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to setup monitoring for {project_path}: {e}")
            raise
    
    async def get_monitoring_status(self, project_id: str) -> Dict[str, Any]:
        """Get monitoring status for a project"""
        try:
            params = {
                "project_id": project_id,
                "api_token": self.api_token
            }
            
            async with self.session.get(
                f"{self.base_url}/monitoring/status",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get monitoring status failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get monitoring status for {project_id}: {e}")
            raise
    
    async def ignore_vulnerability(self, vuln_id: str, reason: str,
                                 expires: Optional[str] = None) -> bool:
        """Ignore a vulnerability"""
        try:
            payload = {
                "vuln_id": vuln_id,
                "reason": reason,
                "api_token": self.api_token
            }
            
            if expires:
                payload["expires"] = expires
            
            async with self.session.post(
                f"{self.base_url}/vulnerabilities/ignore",
                json=payload
            ) as response:
                if response.status == 200:
                    return True
                else:
                    error_text = await response.text()
                    raise Exception(f"Ignore vulnerability failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to ignore vulnerability {vuln_id}: {e}")
            raise
    
    async def get_security_trends(self, time_range: str = "30d") -> Dict[str, Any]:
        """Get security trends and analytics"""
        try:
            params = {
                "time_range": time_range,
                "api_token": self.api_token
            }
            
            async with self.session.get(
                f"{self.base_url}/analytics/trends",
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Get security trends failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get security trends: {e}")
            raise
    
    async def recommend_fixes(self, scan_id: str) -> List[Dict[str, Any]]:
        """Get recommended fixes for vulnerabilities"""
        try:
            params = {
                "scan_id": scan_id,
                "api_token": self.api_token
            }
            
            async with self.session.get(
                f"{self.base_url}/recommendations/fixes",
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("recommendations", [])
                else:
                    error_text = await response.text()
                    raise Exception(f"Get fixes failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to get recommended fixes for {scan_id}: {e}")
            return []
    
    async def test_security_policy(self, policy_config: Dict[str, Any]) -> Dict[str, Any]:
        """Test security policy against current state"""
        try:
            payload = {
                "policy": policy_config,
                "api_token": self.api_token
            }
            
            async with self.session.post(
                f"{self.base_url}/policy/test",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Test security policy failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to test security policy: {e}")
            raise
