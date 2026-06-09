"""
Terraform MCP Client

Client for interacting with Terraform MCP server
providing infrastructure provisioning, management, and deployment capabilities.
"""

import json
import logging
import asyncio
from typing import Dict, List, Any, Optional
import aiohttp


class TerraformClient:
    """Client for Terraform MCP server operations"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.session = None
        self.base_url = config.get("base_url", "http://localhost:3005")
        self.workspace_path = config.get("workspace_path", "./terraform_workspace")
    
    async def connect(self):
        """Connect to Terraform MCP server"""
        try:
            self.session = aiohttp.ClientSession()
            
            # Test connection
            async with self.session.get(f"{self.base_url}/health") as response:
                if response.status == 200:
                    self.logger.info("Connected to Terraform MCP server")
                else:
                    raise Exception(f"Connection failed: {response.status}")
                    
        except Exception as e:
            self.logger.error(f"Failed to connect to Terraform MCP server: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from Terraform MCP server"""
        if self.session:
            await self.session.close()
            self.session = None
            self.logger.info("Disconnected from Terraform MCP server")
    
    async def execute(self, command_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute Terraform command"""
        try:
            payload = {
                "command": command_data,
                "workspace_path": self.workspace_path
            }
            
            async with self.session.post(
                f"{self.base_url}/terraform/execute",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Execute command failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to execute Terraform command: {e}")
            raise
    
    async def init(self, working_directory: Optional[str] = None) -> Dict[str, Any]:
        """Initialize Terraform configuration"""
        try:
            payload = {
                "command": "init",
                "working_directory": working_directory or self.workspace_path
            }
            
            async with self.session.post(
                f"{self.base_url}/terraform/init",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Init failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to initialize Terraform: {e}")
            raise
    
    async def plan(self, working_directory: Optional[str] = None,
                   var_file: Optional[str] = None) -> Dict[str, Any]:
        """Create Terraform execution plan"""
        try:
            payload = {
                "working_directory": working_directory or self.workspace_path
            }
            
            if var_file:
                payload["var_file"] = var_file
            
            async with self.session.post(
                f"{self.base_url}/terraform/plan",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Plan failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to create Terraform plan: {e}")
            raise
    
    async def apply(self, working_directory: Optional[str] = None,
                   var_file: Optional[str] = None,
                   auto_approve: bool = False) -> Dict[str, Any]:
        """Apply Terraform configuration"""
        try:
            payload = {
                "working_directory": working_directory or self.workspace_path,
                "auto_approve": auto_approve
            }
            
            if var_file:
                payload["var_file"] = var_file
            
            async with self.session.post(
                f"{self.base_url}/terraform/apply",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Apply failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to apply Terraform: {e}")
            raise
    
    async def destroy(self, working_directory: Optional[str] = None,
                     var_file: Optional[str] = None,
                     auto_approve: bool = False) -> Dict[str, Any]:
        """Destroy Terraform-managed infrastructure"""
        try:
            payload = {
                "working_directory": working_directory or self.workspace_path,
                "auto_approve": auto_approve
            }
            
            if var_file:
                payload["var_file"] = var_file
            
            async with self.session.post(
                f"{self.base_url}/terraform/destroy",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Destroy failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to destroy Terraform resources: {e}")
            raise
    
    async def validate(self, working_directory: Optional[str] = None) -> Dict[str, Any]:
        """Validate Terraform configuration files"""
        try:
            payload = {
                "working_directory": working_directory or self.workspace_path
            }
            
            async with self.session.post(
                f"{self.base_url}/terraform/validate",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Validate failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to validate Terraform: {e}")
            raise
    
    async def fmt(self, working_directory: Optional[str] = None,
                  check: bool = False) -> Dict[str, Any]:
        """Format Terraform configuration files"""
        try:
            payload = {
                "working_directory": working_directory or self.workspace_path,
                "check": check
            }
            
            async with self.session.post(
                f"{self.base_url}/terraform/fmt",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Format failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to format Terraform: {e}")
            raise
    
    async def show(self, working_directory: Optional[str] = None) -> Dict[str, Any]:
        """Show current state"""
        try:
            payload = {
                "working_directory": working_directory or self.workspace_path
            }
            
            async with self.session.post(
                f"{self.base_url}/terraform/show",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Show failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to show Terraform state: {e}")
            raise
    
    async def import_resource(self, resource_address: str, resource_id: str,
                           working_directory: Optional[str] = None) -> Dict[str, Any]:
        """Import existing resource into Terraform state"""
        try:
            payload = {
                "resource_address": resource_address,
                "resource_id": resource_id,
                "working_directory": working_directory or self.workspace_path
            }
            
            async with self.session.post(
                f"{self.base_url}/terraform/import",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Import failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to import resource {resource_address}: {e}")
            raise
    
    async def state_list(self, working_directory: Optional[str] = None) -> List[Dict[str, Any]]:
        """List resources in state"""
        try:
            payload = {
                "working_directory": working_directory or self.workspace_path
            }
            
            async with self.session.post(
                f"{self.base_url}/terraform/state/list",
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("resources", [])
                else:
                    error_text = await response.text()
                    raise Exception(f"State list failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to list Terraform state: {e}")
            return []
    
    async def taint(self, resource_address: str,
                   working_directory: Optional[str] = None) -> Dict[str, Any]:
        """Mark resource as tainted"""
        try:
            payload = {
                "resource_address": resource_address,
                "working_directory": working_directory or self.workspace_path
            }
            
            async with self.session.post(
                f"{self.base_url}/terraform/taint",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Taint failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to taint resource {resource_address}: {e}")
            raise
    
    async def untaint(self, resource_address: str,
                     working_directory: Optional[str] = None) -> Dict[str, Any]:
        """Remove taint from resource"""
        try:
            payload = {
                "resource_address": resource_address,
                "working_directory": working_directory or self.workspace_path
            }
            
            async with self.session.post(
                f"{self.base_url}/terraform/untaint",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Untaint failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to untaint resource {resource_address}: {e}")
            raise
    
    async def workspace_list(self) -> List[Dict[str, Any]]:
        """List available workspaces"""
        try:
            async with self.session.get(f"{self.base_url}/terraform/workspace/list") as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("workspaces", [])
                else:
                    error_text = await response.text()
                    raise Exception(f"Workspace list failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to list Terraform workspaces: {e}")
            return []
    
    async def workspace_select(self, workspace_name: str) -> Dict[str, Any]:
        """Select workspace"""
        try:
            payload = {"workspace": workspace_name}
            
            async with self.session.post(
                f"{self.base_url}/terraform/workspace/select",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Workspace select failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to select workspace {workspace_name}: {e}")
            raise
    
    async def output_show(self, output_name: Optional[str] = None,
                        working_directory: Optional[str] = None) -> Dict[str, Any]:
        """Show Terraform outputs"""
        try:
            payload = {
                "working_directory": working_directory or self.workspace_path
            }
            
            if output_name:
                payload["output_name"] = output_name
            
            async with self.session.post(
                f"{self.base_url}/terraform/output",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Output show failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to show Terraform outputs: {e}")
            raise
    
    async def graph(self, working_directory: Optional[str] = None) -> str:
        """Generate dependency graph"""
        try:
            payload = {
                "working_directory": working_directory or self.workspace_path
            }
            
            async with self.session.post(
                f"{self.base_url}/terraform/graph",
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("graph", "")
                else:
                    error_text = await response.text()
                    raise Exception(f"Graph failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to generate Terraform graph: {e}")
            raise
    
    async def force_unlock(self, lock_id: str) -> Dict[str, Any]:
        """Force unlock Terraform state"""
        try:
            payload = {"lock_id": lock_id}
            
            async with self.session.post(
                f"{self.base_url}/terraform/unlock",
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    raise Exception(f"Force unlock failed: {response.status} - {error_text}")
                    
        except Exception as e:
            self.logger.error(f"Failed to force unlock Terraform state: {e}")
            raise
