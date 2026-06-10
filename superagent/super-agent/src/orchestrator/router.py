"""
Tool Router - Intelligent task routing and analysis

Analyzes natural language requests and determines which MCP server
or integration should handle the task.
"""

import re
import json
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass

from .models import Task, TaskType


@dataclass
class RoutingDecision:
    """Result of routing analysis"""
    task_type: TaskType
    confidence: float
    parameters: Dict[str, Any]
    preferred_tools: List[str]
    reasoning: str


class ToolRouter:
    """Intelligent router for task analysis and tool selection"""
    
    def __init__(self, ai_client):
        self.ai_client = ai_client
        self.logger = logging.getLogger(__name__)
        
        # Define routing patterns
        self.routing_patterns = {
            TaskType.FILE_OPERATION: [
                r'\b(read|write|create|delete|list|copy|move|rename)\s+file',
                r'\b(file|directory|folder)\s+(operations?|management?|manipulation)',
                r'\b(open|edit|save)\s+(file|document)',
                r'\b(list|show|browse)\s+(directory|folder|files)',
                r'\b(create|make|new)\s+(file|folder|directory)'
            ],
            TaskType.BROWSER_AUTOMATION: [
                r'\b(click|navigate|go\s+to|open)\s+(page|website|link)',
                r'\b(screenshot|capture|take\s+picture)',
                r'\b(fill|enter|type)\s+(form|input|text)',
                r'\b(browser|web|page)\s+(automation|control|interaction)',
                r'\b(visit|load|open)\s+url'
            ],
            TaskType.WEB_SCRAPING: [
                r'\b(scrape|extract|crawl|harvest|collect)\s+(data|content|information)',
                r'\b(get|fetch|retrieve)\s+(web|page|site)\s+(data|content)',
                r'\b(scraping|crawling|extraction)',
                r'\b(parse|analyze)\s+(html|web\s+page)',
                r'\b(download|save)\s+(web|page)\s+(content|data)'
            ],
            TaskType.WEB_SEARCH: [
                r'\b(search|find|look for)\s+(information|data|results)',
                r'\b(query|search)\s+(web|internet|online)',
                r'\b(google|bing|search)\s+(for|about)',
                r'\b(what|who|where|when|why|how)\s+(is|are|was|were)',
                r'\b(find|search|locate)\s+(answer|solution)'
            ],
            TaskType.CONVERSATIONAL_SEARCH: [
                r'\b(conversational|chat|talk)\s+(search|find)',
                r'\b(discuss|conversation)\s+(about|regarding)',
                r'\b(interactive|dialog)\s+(search|research)',
                r'\b(let\'s|can we)\s+(search|explore|discuss)',
                r'\b(tell me|explain)\s+(about|more)'
            ],
            TaskType.RESEARCH_SYNTHESIS: [
                r'\b(research|investigate|study)\s+(topic|subject)',
                r'\b(analyze|synthesize|comprehensive)\s+(research|study)',
                r'\b(in-depth|deep|thorough)\s+(analysis|research)',
                r'\b(gather|collect|compile)\s+(information|data)',
                r'\b(academic|scholarly)\s+(research|study)'
            ],
            TaskType.FACT_CHECK: [
                r'\b(fact.?check|verify|validate)\s+(claim|statement)',
                r'\b(true|false|accurate)\s+(or|and)\s+(correct|right)',
                r'\b(is this|are these)\s+(true|false|correct)',
                r'\b(verify|confirm)\s+(accuracy|truth)',
                r'\b(debunk|expose)\s+(misinformation|false)'
            ],
            TaskType.NEWS_ANALYSIS: [
                r'\b(news|current events|breaking)\s+(analysis|update)',
                r'\b(latest|recent|today\'s)\s+(news|headlines)',
                r'\b(analyze|review)\s+(news|media|coverage)',
                r'\b(trending|popular|viral)\s+(news|stories)',
                r'\b(journalism|reporting)\s+(analysis|review)'
            ],
            TaskType.API_TESTING: [
                r'\b(test|check|verify)\s+(api|endpoint)',
                r'\b(make|send)\s+(request|call)',
                r'\b(api|rest|graphql)\s+(testing|validation)',
                r'\b(post|get|put|delete|patch)\s+request',
                r'\b(endpoint|service)\s+(testing|validation)'
            ],
            TaskType.SECURITY_SCAN: [
                r'\b(scan|check|analyze)\s+(security|vulnerability)',
                r'\b(security|safety|vulnerability)\s+(analysis|audit)',
                r'\b(scan|check)\s+(dependencies|packages|code)',
                r'\b(snyk|security\s+tool)',
                r'\b(vulnerability|security)\s+(assessment|report)'
            ],
            TaskType.INFRASTRUCTURE: [
                r'\b(deploy|provision|create)\s+(infrastructure|resources)',
                r'\b(terraform|infra|cloud)\s+(management|deployment)',
                r'\b(setup|configure)\s+(cloud|infrastructure)',
                r'\b(provision|deploy)\s+(servers?|resources?|services?)',
                r'\b(Infrastructure\s+as\s+Code|IaC)'
            ],
            TaskType.MEMORY_OPERATION: [
                r'\b(remember|store|save)\s+(information|data|memory)',
                r'\b(recall|retrieve|get)\s+(memory|information|data)',
                r'\b(search|find)\s+(memory|stored\s+information)',
                r'\b(memory|storage)\s+(operations?|management?)',
                r'\b(persistent|cache)\s+(data|information)'
            ]
        }
    
    async def analyze_request(self, request: str, context: Dict[str, Any] = None) -> Task:
        """Analyze natural language request and create appropriate task"""
        if context is None:
            context = {}

        # Tier 1: fast regex patterns
        pattern_result = self._analyze_with_patterns(request)
        if pattern_result.confidence >= 0.6:
            routing_decision = pattern_result
        else:
            # Tier 2: keyword vector search via AgentDB bridge
            vector_result = await self._analyze_with_vectors(request)
            if vector_result.confidence >= 0.7:
                routing_decision = vector_result
            else:
                # Tier 3: LLM fallback
                ai_result = await self._analyze_with_ai(request, context)
                routing_decision = max(
                    [pattern_result, vector_result, ai_result],
                    key=lambda r: r.confidence
                )
        
        # Create task from routing decision
        task = Task(
            id=self._generate_task_id(),
            type=routing_decision.task_type,
            description=request,
            parameters=routing_decision.parameters,
            preferred_tools=routing_decision.preferred_tools
        )
        
        self.logger.info(
            f"Routed task {task.id} to {task.type.value} "
            f"(confidence: {routing_decision.confidence:.2f})"
        )
        
        return task
    
    async def _analyze_with_vectors(self, request: str) -> RoutingDecision:
        """Analyze request using AgentDB bridge keyword-vector routing."""
        try:
            from .jj_tracker import AgentDBBridge
            bridge = await AgentDBBridge.get()
            result = await bridge.call(op='route', query=request, k=3)
            hits = result.get('results', [])
            if not hits:
                raise ValueError("empty results")
            top = hits[0]
            task_type = TaskType(top['id'])
            confidence = float(top.get('score', 0.0))
            parameters = self._extract_parameters(request, task_type)
            return RoutingDecision(
                task_type=task_type,
                confidence=confidence,
                parameters=parameters,
                preferred_tools=self._get_preferred_tools(task_type),
                reasoning=f"Vector routing: {confidence:.2f} confidence"
            )
        except Exception as e:
            self.logger.debug(f"Vector routing failed: {e}")
            return RoutingDecision(
                task_type=TaskType.GENERAL_QUERY,
                confidence=0.0,
                parameters={},
                preferred_tools=[],
                reasoning="Vector routing unavailable"
            )

    def _analyze_with_patterns(self, request: str) -> RoutingDecision:
        """Analyze request using regex patterns"""
        request_lower = request.lower()
        
        best_match = None
        best_confidence = 0.0
        
        for task_type, patterns in self.routing_patterns.items():
            matches = 0
            total_patterns = len(patterns)
            
            for pattern in patterns:
                if re.search(pattern, request_lower):
                    matches += 1
            
            confidence = matches / total_patterns if total_patterns > 0 else 0
            
            if confidence > best_confidence:
                best_confidence = confidence
                best_match = task_type
        
        if best_match is None:
            # Default to general query
            best_match = TaskType.GENERAL_QUERY
            best_confidence = 0.3
        
        # Extract basic parameters based on task type
        parameters = self._extract_parameters(request, best_match)
        
        return RoutingDecision(
            task_type=best_match,
            confidence=best_confidence,
            parameters=parameters,
            preferred_tools=self._get_preferred_tools(best_match),
            reasoning=f"Pattern matching: {best_confidence:.2f} confidence"
        )
    
    async def _analyze_with_ai(self, request: str, context: Dict[str, Any]) -> RoutingDecision:
        """Analyze request using AI for complex understanding"""
        prompt = f"""
        Analyze this user request and determine the appropriate task type and parameters.

        Request: "{request}"
        Context: {json.dumps(context, indent=2)}

        Available task types:
        - file_operation: File system operations (read, write, list, delete files)
        - browser_automation: Browser control and interaction
        - web_scraping: Extracting data from websites
        - api_testing: Testing API endpoints and services
        - security_scan: Security vulnerability scanning
        - infrastructure: Infrastructure provisioning and management
        - memory_operation: Storing and retrieving information
        - general_query: General questions and conversations

        Respond with JSON in this format:
        {{
            "task_type": "task_type_name",
            "confidence": 0.0-1.0,
            "parameters": {{"key": "value"}},
            "preferred_tools": ["tool1", "tool2"],
            "reasoning": "Explanation of the decision"
        }}
        """
        
        try:
            response = self.ai_client.messages.create(
                model="claude-opus-4-8",
                max_tokens=2048,
                thinking={"type": "adaptive"},
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )
            
            ai_response = response.content[0].text
            
            # Extract JSON from response
            json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
            if json_match:
                analysis_data = json.loads(json_match.group())
                
                return RoutingDecision(
                    task_type=TaskType(analysis_data.get("task_type", "general_query")),
                    confidence=float(analysis_data.get("confidence", 0.5)),
                    parameters=analysis_data.get("parameters", {}),
                    preferred_tools=analysis_data.get("preferred_tools", []),
                    reasoning=analysis_data.get("reasoning", "AI analysis")
                )
            else:
                self.logger.warning("AI response didn't contain valid JSON")
                raise ValueError("Invalid AI response format")
                
        except Exception as e:
            self.logger.error(f"AI analysis failed: {e}")
            # Fallback to pattern analysis
            return self._analyze_with_patterns(request)
    
    def _extract_parameters(self, request: str, task_type: TaskType) -> Dict[str, Any]:
        """Extract relevant parameters from request based on task type"""
        parameters = {}
        
        if task_type == TaskType.FILE_OPERATION:
            # Extract file paths and operations
            path_pattern = r'["\']([^"\']+)["\']|(\b[A-Za-z]:\\[^"\s]+|\/[^"\s]+)'
            paths = re.findall(path_pattern, request)
            if paths:
                parameters["paths"] = [p[0] or p[1] for p in paths]
            
            # Extract operation type
            if any(word in request.lower() for word in ["read", "open", "view"]):
                parameters["operation"] = "read"
            elif any(word in request.lower() for word in ["write", "create", "save"]):
                parameters["operation"] = "write"
            elif any(word in request.lower() for word in ["list", "show", "browse"]):
                parameters["operation"] = "list"
            elif any(word in request.lower() for word in ["delete", "remove"]):
                parameters["operation"] = "delete"
        
        elif task_type == TaskType.BROWSER_AUTOMATION:
            # Extract URLs
            url_pattern = r'https?://[^\s"\'<>]+'
            urls = re.findall(url_pattern, request)
            if urls:
                parameters["url"] = urls[0]
            
            # Extract actions
            if any(word in request.lower() for word in ["click", "press"]):
                parameters["action"] = "click"
            elif any(word in request.lower() for word in ["navigate", "go", "open"]):
                parameters["action"] = "navigate"
            elif any(word in request.lower() for word in ["screenshot", "capture"]):
                parameters["action"] = "screenshot"
        
        elif task_type == TaskType.WEB_SCRAPING:
            # Extract URLs and scraping details
            url_pattern = r'https?://[^\s"\'<>]+'
            urls = re.findall(url_pattern, request)
            if urls:
                parameters["url"] = urls[0]
            
            # Extract data requirements
            if any(word in request.lower() for word in ["text", "content", "data"]):
                parameters["extract"] = "text"
            elif any(word in request.lower() for word in ["images", "pictures"]):
                parameters["extract"] = "images"
            elif any(word in request.lower() for word in ["links", "urls"]):
                parameters["extract"] = "links"
        
        elif task_type == TaskType.API_TESTING:
            # Extract URLs and HTTP methods
            url_pattern = r'https?://[^\s"\'<>]+'
            urls = re.findall(url_pattern, request)
            if urls:
                parameters["url"] = urls[0]
            
            # Extract HTTP methods
            methods = ["get", "post", "put", "delete", "patch"]
            for method in methods:
                if method in request.lower():
                    parameters["method"] = method.upper()
                    break
        
        return parameters
    
    def _get_preferred_tools(self, task_type: TaskType) -> List[str]:
        """Get preferred tools for each task type"""
        tool_preferences = {
            TaskType.FILE_OPERATION: ["filesystem"],
            TaskType.BROWSER_AUTOMATION: ["playwright", "puppeteer"],
            TaskType.WEB_SCRAPING: ["scraperapi", "playwright"],
            TaskType.API_TESTING: ["postman"],
            TaskType.SECURITY_SCAN: ["snyk"],
            TaskType.INFRASTRUCTURE: ["terraform"],
            TaskType.MEMORY_OPERATION: ["memory"],
            TaskType.GENERAL_QUERY: ["anthropic"]
        }
        
        return tool_preferences.get(task_type, [])
    
    def _generate_task_id(self) -> str:
        """Generate unique task ID"""
        import uuid
        return f"task_{uuid.uuid4().hex[:8]}"
    
    def get_routing_statistics(self) -> Dict[str, Any]:
        """Get statistics about routing decisions"""
        # This would be implemented with actual tracking in a real system
        return {
            "total_requests": 0,
            "routing_accuracy": 0.0,
            "task_type_distribution": {},
            "average_confidence": 0.0
        }
