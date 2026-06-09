from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum


class SearchType(Enum):
    WEB = "web"
    NEWS = "news"
    IMAGES = "images"
    VIDEOS = "videos"


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str
    position: int
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class SearchResponse:
    query: str
    results: List[SearchResult]
    total_results: Optional[int] = None
    search_time: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


class BaseSearchAPI(ABC):
    def __init__(self, api_key: str, **kwargs):
        self.api_key = api_key
        self.config = kwargs
    
    @abstractmethod
    async def search(
        self,
        query: str,
        search_type: SearchType = SearchType.WEB,
        num_results: int = 10,
        **kwargs
    ) -> SearchResponse:
        pass
    
    @abstractmethod
    def get_rate_limits(self) -> Dict[str, Any]:
        pass
    
    @abstractmethod
    def get_pricing_info(self) -> Dict[str, Any]:
        pass
    
    def validate_api_key(self) -> bool:
        return bool(self.api_key and len(self.api_key.strip()) > 0)
    
    def format_results(self, raw_results: List[Dict], query: str) -> SearchResponse:
        formatted_results = []
        for i, result in enumerate(raw_results):
            formatted_result = SearchResult(
                title=result.get('title', ''),
                url=result.get('url', ''),
                snippet=result.get('snippet', ''),
                position=i + 1,
                metadata=result.get('metadata', {})
            )
            formatted_results.append(formatted_result)
        
        return SearchResponse(
            query=query,
            results=formatted_results,
            total_results=len(formatted_results),
            metadata={}
        )
