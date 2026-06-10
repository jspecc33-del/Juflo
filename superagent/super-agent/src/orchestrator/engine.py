"""
Super-Agent Orchestrator Engine

Central coordinator that routes requests to appropriate MCP servers
and manages task execution across multiple services.
"""

import asyncio
import json
import logging
import uuid
from typing import Dict, List, Any, Optional, Union
import anthropic

from ..mcp.clients import (
    FilesystemClient,
    PlaywrightClient,
    PuppeteerClient,
    MemoryClient,
    PostmanClient,
    SnykClient,
    TerraformClient
)
from ..integrations.scraperapi import ScraperAPIIntegration
from ..integrations.apify import ApifyIntegration
from ..integrations.anthropic import AnthropicIntegration, ClaudeReasoningEngine
from .models import Task, TaskType, TaskResult
from .router import ToolRouter
from .memory import MemoryManager
from .skill_layer import SkillLayer
from .jj_tracker import TaskTrajectoryTracker


class SuperAgentOrchestrator:
    """Main orchestrator for the super-agent system"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Initialize AI client for task analysis
        self.ai_client = anthropic.Anthropic(
            api_key=config.get("anthropic_api_key")
        )
        
        # Initialize MCP clients
        self.mcp_clients = {
            "filesystem": FilesystemClient(config.get("filesystem", {})),
            "playwright": PlaywrightClient(config.get("playwright", {})),
            "puppeteer": PuppeteerClient(config.get("puppeteer", {})),
            "memory": MemoryClient(config.get("memory", {})),
            "postman": PostmanClient(config.get("postman", {})),
            "snyk": SnykClient(config.get("snyk", {})),
            "terraform": TerraformClient(config.get("terraform", {}))
        }
        
        # Initialize external integrations
        from ..integrations import ScraperAPIIntegration, ApifyIntegration, SearchAPIIntegration, AnthropicIntegration, ClaudeReasoningEngine
        
        self.integrations = {
            "scraperapi": ScraperAPIIntegration(
                api_key=config.get("scraperapi_key", ""),
                **config.get("scraperapi_config", {})
            ),
            "apify": ApifyIntegration(
                api_token=config.get("apify_token", "")
            ),
            "search_api_collection": SearchAPIIntegration(
                config=config.get("search_api_config", {})
            ),
            "anthropic": AnthropicIntegration(
                config=config.get("anthropic", {})
            ),
            "claude_reasoning": ClaudeReasoningEngine(
                config=config.get("anthropic", {})
            )
        }
        
        # Initialize components
        self.router = ToolRouter(self.ai_client)
        self.memory_manager = MemoryManager(self.mcp_clients["memory"])
        self.skill_layer = SkillLayer(config)
        self.jj_tracker = TaskTrajectoryTracker()

        # Task execution state
        self.running_tasks: Dict[str, asyncio.Task] = {}
        self.task_queue = asyncio.Queue()
        
    async def initialize(self):
        """Initialize all clients and connections"""
        self.logger.info("Initializing Super-Agent Orchestrator...")
        
        # Initialize MCP clients
        for name, client in self.mcp_clients.items():
            try:
                await client.connect()
                self.logger.info(f"Connected to {name} MCP server")
            except Exception as e:
                self.logger.error(f"Failed to connect to {name} MCP server: {e}")
        
        # Initialize memory manager
        await self.memory_manager.initialize()
        
        self.logger.info("Orchestrator initialization complete")
    
    async def process_request(self, request: str, context: Dict[str, Any] = None) -> TaskResult:
        """Process a natural language request"""
        if context is None:
            context = {}
        
        try:
            # Execute through SkillLayer (Planner -> Memory -> Executor)
            reasoned_response = await self.skill_layer.run(request)
            
            # Create a virtual task for tracking
            task = Task(
                id=str(uuid.uuid4()),
                type=TaskType.GENERAL_QUERY,
                description=request,
                parameters={"reasoned_response": reasoned_response}
            )
            
            result = TaskResult(
                task_id=task.id,
                success=True,
                result=reasoned_response,
                metadata={"task_type": "skill_layer_reasoning"}
            )
            
            return result
            
        except Exception as e:
            self.logger.error(f"Error processing request: {e}")
            return TaskResult(
                task_id="unknown",
                success=False,
                error=str(e)
            )
    
    async def execute_task(self, task: Task) -> TaskResult:
        """Execute a single task with trajectory tracking."""
        traj_id = await self.jj_tracker.start(task.description)
        result = await self._execute_task_impl(task)
        await self.jj_tracker.record(traj_id)
        await self.jj_tracker.finish(traj_id, result.success, result.error or 'ok')
        return result

    async def _execute_task_impl(self, task: Task) -> TaskResult:
        """Core task execution logic."""
        start_time = asyncio.get_event_loop().time()

        try:
            self.logger.info(f"Executing task {task.id}: {task.description}")
            
            # Route to appropriate handler
            if task.type == TaskType.FILE_OPERATION:
                result = await self._handle_file_operation(task)
            elif task.type == TaskType.BROWSER_AUTOMATION:
                result = await self._handle_browser_automation(task)
            elif task.type == TaskType.WEB_SCRAPING:
                result = await self._handle_web_scraping(task)
            elif task.type == TaskType.API_TESTING:
                result = await self._handle_api_testing(task)
            elif task.type == TaskType.SECURITY_SCAN:
                result = await self._handle_security_scan(task)
            elif task.type == TaskType.INFRASTRUCTURE:
                result = await self._handle_infrastructure(task)
            elif task.type == TaskType.MEMORY_OPERATION:
                result = await self._handle_memory_operation(task)
            else:
                result = await self._handle_general_query(task)
            
            execution_time = asyncio.get_event_loop().time() - start_time
            
            return TaskResult(
                task_id=task.id,
                success=True,
                result=result,
                execution_time=execution_time,
                metadata={"task_type": task.type.value}
            )
            
        except Exception as e:
            execution_time = asyncio.get_event_loop().time() - start_time
            self.logger.error(f"Task {task.id} failed: {e}")
            
            return TaskResult(
                task_id=task.id,
                success=False,
                error=str(e),
                execution_time=execution_time,
                metadata={"task_type": task.type.value}
            )
    
    async def _handle_file_operation(self, task: Task) -> Any:
        """Handle file system operations"""
        client = self.mcp_clients["filesystem"]
        operation = task.parameters.get("operation")
        
        if operation == "read":
            return await client.read_file(task.parameters.get("path"))
        elif operation == "write":
            return await client.write_file(
                task.parameters.get("path"),
                task.parameters.get("content")
            )
        elif operation == "list":
            return await client.list_directory(task.parameters.get("path"))
        else:
            raise ValueError(f"Unknown file operation: {operation}")
    
    async def _handle_browser_automation(self, task: Task) -> Any:
        """Handle browser automation tasks"""
        client = self.mcp_clients["playwright"]
        action = task.parameters.get("action")
        
        if action == "navigate":
            return await client.navigate(task.parameters.get("url"))
        elif action == "click":
            return await client.click(task.parameters.get("selector"))
        elif action == "screenshot":
            return await client.screenshot(task.parameters.get("selector"))
        else:
            raise ValueError(f"Unknown browser action: {action}")
    
    async def _handle_web_scraping(self, task: Task) -> Any:
        """Handle web scraping tasks"""
        # Try ScraperAPI first, fallback to browser automation
        if "scraperapi" in task.parameters.get("preferred_tools", []):
            return await self.integrations["scraperapi"].scrape_url(
                task.parameters.get("url")
            )
        else:
            # Use browser automation for scraping
            return await self._handle_browser_automation(task)
    
    async def _handle_api_testing(self, task: Task) -> Any:
        """Handle API testing tasks"""
        client = self.mcp_clients["postman"]
        return await client.execute_request(task.parameters)
    
    async def _handle_security_scan(self, task: Task) -> Any:
        """Handle security scanning tasks"""
        client = self.mcp_clients["snyk"]
        return await client.scan(task.parameters.get("target"))
    
    async def _handle_infrastructure(self, task: Task) -> Any:
        """Handle infrastructure management tasks"""
        client = self.mcp_clients["terraform"]
        return await client.execute(task.parameters)
    
    async def _handle_memory_operation(self, task: Task) -> Any:
        """Handle memory operations"""
        operation = task.parameters.get("operation")
        
        if operation == "store":
            return await self.memory_manager.store(
                task.parameters.get("key"),
                task.parameters.get("value")
            )
        elif operation == "retrieve":
            return await self.memory_manager.retrieve(
                task.parameters.get("key")
            )
        elif operation == "search":
            return await self.memory_manager.search(
                task.parameters.get("query")
            )
        else:
            raise ValueError(f"Unknown memory operation: {operation}")
    
    async def _handle_general_query(self, task: Task) -> Any:
        """Handle general queries using AI"""
        response = self.ai_client.messages.create(
            model="claude-opus-4-8",
            max_tokens=8096,
            thinking={"type": "adaptive"},
            messages=[
                {
                    "role": "user",
                    "content": task.description
                }
            ]
        )
        
        return response.content[0].text
    
    async def execute_workflow(self, tasks: List[Task]) -> List[TaskResult]:
        """Execute a workflow of multiple tasks"""
        results = []
        
        # Sort tasks by priority and dependencies
        sorted_tasks = self._sort_tasks_by_dependencies(tasks)
        
        for task in sorted_tasks:
            # Wait for dependencies to complete
            for dep_id in task.dependencies:
                if dep_id in [r.task_id for r in results]:
                    dep_result = next(r for r in results if r.task_id == dep_id)
                    if not dep_result.success:
                        raise Exception(f"Dependency {dep_id} failed")
            
            # Execute task
            result = await self.execute_task(task)
            results.append(result)
        
        return results
    
    def _sort_tasks_by_dependencies(self, tasks: List[Task]) -> List[Task]:
        """Sort tasks by their dependencies"""
        # Simple topological sort
        sorted_tasks = []
        remaining_tasks = tasks.copy()
        
        while remaining_tasks:
            # Find tasks with no unmet dependencies
            ready_tasks = [
                task for task in remaining_tasks
                if all(dep_id in [r.task_id for r in sorted_tasks] 
                       for dep_id in task.dependencies)
            ]
            
            if not ready_tasks:
                raise Exception("Circular dependency detected")
            
            # Add highest priority ready task
            ready_tasks.sort(key=lambda t: t.priority, reverse=True)
            task = ready_tasks[0]
            sorted_tasks.append(task)
            remaining_tasks.remove(task)
        
        return sorted_tasks
    
    async def shutdown(self):
        """Shutdown all clients and connections"""
        self.logger.info("Shutting down Super-Agent Orchestrator...")
        
        # Cancel running tasks
        for task in self.running_tasks.values():
            task.cancel()
        
        # Close MCP clients
        for name, client in self.mcp_clients.items():
            try:
                await client.disconnect()
                self.logger.info(f"Disconnected from {name} MCP server")
            except Exception as e:
                self.logger.error(f"Error disconnecting from {name}: {e}")
        
        self.logger.info("Orchestrator shutdown complete")
