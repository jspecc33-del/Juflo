"""
Orchestrator data models shared across engine and router.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Any, Optional


class TaskType(Enum):
    """Types of tasks the orchestrator can handle"""
    FILE_OPERATION = "file_operation"
    BROWSER_AUTOMATION = "browser_automation"
    WEB_SCRAPING = "web_scraping"
    WEB_SEARCH = "web_search"
    CONVERSATIONAL_SEARCH = "conversational_search"
    RESEARCH_SYNTHESIS = "research_synthesis"
    FACT_CHECK = "fact_check"
    NEWS_ANALYSIS = "news_analysis"
    API_TESTING = "api_testing"
    SECURITY_SCAN = "security_scan"
    INFRASTRUCTURE = "infrastructure"
    MEMORY_OPERATION = "memory_operation"
    GENERAL_QUERY = "general_query"


@dataclass
class Task:
    """Represents a task to be executed"""
    id: str
    type: TaskType
    description: str
    parameters: Dict[str, Any]
    priority: int = 1
    dependencies: List[str] = field(default_factory=list)

    def __post_init__(self):
        if self.dependencies is None:
            self.dependencies = []


@dataclass
class TaskResult:
    """Result of a task execution"""
    task_id: str
    success: bool
    result: Any = None
    error: Optional[str] = None
    execution_time: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
