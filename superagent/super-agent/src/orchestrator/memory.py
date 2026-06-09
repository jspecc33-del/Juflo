"""
Memory Manager - Handles persistent memory operations using MCP memory server

Provides interface for storing, retrieving, and searching memory
including task history, results, and contextual information.
Falls back to an in-process dict when the MCP memory server is unavailable.
MCP writes are best-effort; the local store is always written and always consulted.
"""

import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
import asyncio

from .models import Task, TaskResult


class MemoryManager:
    """Manages persistent memory using MCP memory server with in-process fallback"""

    def __init__(self, memory_client):
        self.memory_client = memory_client
        self.logger = logging.getLogger(__name__)

        # In-process fallback store: {namespace: {key: value}}
        self._store: Dict[str, Dict[str, Any]] = {}

        # Memory namespaces
        self.namespaces = {
            "tasks": "task_history",
            "results": "task_results",
            "context": "context_data",
            "user_preferences": "user_settings",
            "learned_patterns": "ml_patterns"
        }

    # ------------------------------------------------------------------
    # Internal fallback helpers
    # ------------------------------------------------------------------

    def _resolve_ns(self, namespace: str) -> str:
        """Resolve namespace alias (e.g. 'tasks' -> 'task_history')."""
        return self.namespaces.get(namespace, namespace)

    def _fb_store(self, namespace: str, key: str, value: Any) -> None:
        self._store.setdefault(namespace, {})[key] = value

    def _fb_get(self, namespace: str, key: str) -> Optional[Any]:
        return self._store.get(namespace, {}).get(key)

    def _fb_list(self, namespace: str) -> List[Any]:
        return list(self._store.get(namespace, {}).values())

    def _fb_delete(self, namespace: str, key: str) -> bool:
        ns = self._store.get(namespace, {})
        if key in ns:
            del ns[key]
            return True
        return False

    async def _mcp_store(self, namespace: str, key: str, value: Any, **kw) -> None:
        """Best-effort MCP write — logs and ignores all errors."""
        try:
            await self.memory_client.store(namespace=namespace, key=key, value=value, **kw)
        except Exception as e:
            self.logger.debug(f"MCP store skipped ({namespace}/{key}): {e}")

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self):
        """Initialize memory manager"""
        try:
            await self.memory_client.ping()
            self.logger.info("Memory manager initialized successfully")
        except Exception as e:
            self.logger.warning(f"MCP memory server unavailable, using in-process fallback: {e}")

    # ------------------------------------------------------------------
    # Tasks
    # ------------------------------------------------------------------

    async def store_task(self, task: Task) -> str:
        """Store a task in memory"""
        task_data = {
            "id": task.id,
            "type": task.type.value,
            "description": task.description,
            "parameters": task.parameters,
            "priority": task.priority,
            "dependencies": task.dependencies,
            "created_at": datetime.utcnow().isoformat(),
            "status": "pending"
        }
        ns = self.namespaces["tasks"]
        key = f"task:{task.id}"
        # Always persist locally first
        self._fb_store(ns, key, task_data)
        await self._mcp_store(ns, key, task_data)
        self.logger.debug(f"Stored task {task.id}")
        return key

    async def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a specific task from memory"""
        ns = self.namespaces["tasks"]
        key = f"task:{task_id}"
        try:
            data = await self.memory_client.retrieve(namespace=ns, key=key)
            if data is not None:
                return data
        except Exception:
            pass
        return self._fb_get(ns, key)

    async def get_task_history(self, limit: int = 50,
                           task_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get task history with optional filtering"""
        ns = self.namespaces["tasks"]
        # Start from local store (guaranteed), then overlay any MCP results
        local_items = {v["id"]: v for v in self._fb_list(ns) if "id" in v}
        try:
            mcp_items = await self.memory_client.list(namespace=ns)
            if mcp_items:
                for item in mcp_items:
                    if "id" in item:
                        local_items[item["id"]] = item
        except Exception:
            pass
        all_tasks = list(local_items.values())
        if task_type:
            all_tasks = [t for t in all_tasks if t.get("type") == task_type]
        all_tasks.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return all_tasks[:limit]

    async def search_tasks(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Search tasks by description or parameters"""
        try:
            results = await self.memory_client.search(
                namespace=self.namespaces["tasks"],
                query=query,
                limit=limit
            )
            return results or []
        except Exception as e:
            self.logger.error(f"Failed to search tasks: {e}")
            return []

    async def semantic_search(self, query: str, limit: int = 5) -> str:
        """Placeholder — bridged by the orchestrator via skill_layer"""
        return ""

    # ------------------------------------------------------------------
    # Results
    # ------------------------------------------------------------------

    async def store_result(self, result: TaskResult) -> str:
        """Store a task result in memory"""
        result_data = {
            "task_id": result.task_id,
            "success": result.success,
            "result": result.result,
            "error": result.error,
            "execution_time": result.execution_time,
            "metadata": result.metadata,
            "completed_at": datetime.utcnow().isoformat()
        }
        ns = self.namespaces["results"]
        key = f"result:{result.task_id}"
        self._fb_store(ns, key, result_data)
        await self._mcp_store(ns, key, result_data)
        await self._update_task_status(result.task_id, "completed")
        self.logger.debug(f"Stored result for task {result.task_id}")
        return key

    async def get_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a specific result from memory"""
        ns = self.namespaces["results"]
        key = f"result:{task_id}"
        try:
            data = await self.memory_client.retrieve(namespace=ns, key=key)
            if data is not None:
                return data
        except Exception:
            pass
        return self._fb_get(ns, key)

    # ------------------------------------------------------------------
    # Generic store / list / delete (called from tasks.py workflows)
    # ------------------------------------------------------------------

    async def store(self, namespace: str, key: str, value: Any) -> str:
        """Generic store for arbitrary namespaces (e.g. workflows)"""
        ns = self._resolve_ns(namespace)
        self._fb_store(ns, key, value)
        await self._mcp_store(ns, key, value)
        return key

    async def list(self, namespace: str, limit: int = 100) -> List[Any]:
        """Generic list for arbitrary namespaces"""
        ns = self._resolve_ns(namespace)
        local_items = self._fb_list(ns)
        try:
            mcp_items = await self.memory_client.list(namespace=ns)
            if mcp_items:
                return mcp_items[:limit]
        except Exception:
            pass
        return local_items[:limit]

    async def delete(self, namespace: str, key: str) -> bool:
        """Generic delete for arbitrary namespaces"""
        ns = self._resolve_ns(namespace)
        fb_deleted = self._fb_delete(ns, key)
        try:
            await self.memory_client.delete(namespace=ns, key=key)
            return True
        except Exception:
            pass
        return fb_deleted

    # ------------------------------------------------------------------
    # Context
    # ------------------------------------------------------------------

    async def store_context(self, key: str, value: Any, ttl: Optional[int] = None) -> str:
        """Store contextual information"""
        context_data = {
            "key": key,
            "value": value,
            "created_at": datetime.utcnow().isoformat(),
            "ttl": ttl
        }
        ns = self.namespaces["context"]
        storage_key = f"context:{key}"
        self._fb_store(ns, storage_key, context_data)
        await self._mcp_store(ns, storage_key, context_data, ttl=ttl)
        self.logger.debug(f"Stored context data for key: {key}")
        return storage_key

    async def get_context(self, key: str) -> Optional[Any]:
        """Retrieve contextual information"""
        ns = self.namespaces["context"]
        storage_key = f"context:{key}"
        try:
            data = await self.memory_client.retrieve(namespace=ns, key=storage_key)
            if data is not None:
                return data.get("value")
        except Exception:
            pass
        data = self._fb_get(ns, storage_key)
        return data.get("value") if data else None

    # ------------------------------------------------------------------
    # User preferences
    # ------------------------------------------------------------------

    async def store_user_preference(self, key: str, value: Any) -> str:
        """Store user preferences"""
        preference_data = {
            "key": key,
            "value": value,
            "updated_at": datetime.utcnow().isoformat()
        }
        ns = self.namespaces["user_preferences"]
        storage_key = f"pref:{key}"
        self._fb_store(ns, storage_key, preference_data)
        await self._mcp_store(ns, storage_key, preference_data)
        self.logger.debug(f"Stored user preference: {key}")
        return storage_key

    async def get_user_preference(self, key: str, default: Any = None) -> Any:
        """Retrieve user preferences"""
        ns = self.namespaces["user_preferences"]
        storage_key = f"pref:{key}"
        try:
            data = await self.memory_client.retrieve(namespace=ns, key=storage_key)
            if data is not None:
                return data.get("value", default)
        except Exception:
            pass
        data = self._fb_get(ns, storage_key)
        return data.get("value", default) if data else default

    # ------------------------------------------------------------------
    # Learned patterns
    # ------------------------------------------------------------------

    async def learn_pattern(self, pattern_type: str, pattern_data: Dict[str, Any]) -> str:
        """Store learned patterns for improving routing"""
        learning_data = {
            "type": pattern_type,
            "pattern": pattern_data,
            "created_at": datetime.utcnow().isoformat(),
            "usage_count": 0,
            "success_rate": 0.0
        }
        ns = self.namespaces["learned_patterns"]
        key = f"pattern:{pattern_type}_{hash(str(pattern_data))}"
        self._fb_store(ns, key, learning_data)
        await self._mcp_store(ns, key, learning_data)
        self.logger.debug(f"Stored learned pattern: {pattern_type}")
        return key

    async def get_patterns(self, pattern_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve learned patterns"""
        ns = self.namespaces["learned_patterns"]
        local = self._fb_list(ns)
        try:
            mcp_items = await self.memory_client.list(namespace=ns)
            if mcp_items:
                local = mcp_items
        except Exception:
            pass
        if pattern_type:
            local = [p for p in local if p.get("type") == pattern_type]
        local.sort(
            key=lambda x: (x.get("usage_count", 0), x.get("success_rate", 0.0)),
            reverse=True
        )
        return local

    async def update_pattern_stats(self, pattern_key: str, success: bool) -> None:
        """Update pattern statistics after usage"""
        ns = self.namespaces["learned_patterns"]
        pattern_data = None
        try:
            pattern_data = await self.memory_client.retrieve(namespace=ns, key=pattern_key)
        except Exception:
            pass
        if pattern_data is None:
            pattern_data = self._fb_get(ns, pattern_key)
        if pattern_data:
            pattern_data["usage_count"] = pattern_data.get("usage_count", 0) + 1
            usage_count = pattern_data["usage_count"]
            current = pattern_data.get("success_rate", 0.0)
            pattern_data["success_rate"] = (
                (current * (usage_count - 1) + 1.0) / usage_count if success
                else (current * (usage_count - 1)) / usage_count
            )
            pattern_data["last_used"] = datetime.utcnow().isoformat()
            self._fb_store(ns, pattern_key, pattern_data)
            await self._mcp_store(ns, pattern_key, pattern_data)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _update_task_status(self, task_id: str, status: str) -> None:
        """Update task status in memory"""
        ns = self.namespaces["tasks"]
        key = f"task:{task_id}"
        task_data = self._fb_get(ns, key)
        if task_data is None:
            try:
                task_data = await self.memory_client.retrieve(namespace=ns, key=key)
            except Exception:
                pass
        if task_data:
            task_data["status"] = status
            task_data["updated_at"] = datetime.utcnow().isoformat()
            self._fb_store(ns, key, task_data)
            await self._mcp_store(ns, key, task_data)

    async def cleanup_old_data(self, days: int = 30) -> None:
        """Clean up old data from memory"""
        try:
            cutoff = datetime.utcnow().timestamp() - (days * 24 * 60 * 60)
            ns = self.namespaces["context"]
            context_items = self._fb_list(ns)
            try:
                mcp_items = await self.memory_client.list(namespace=ns)
                if mcp_items:
                    context_items = mcp_items
            except Exception:
                pass
            for item in context_items:
                created_at = item.get("created_at", "")
                if created_at:
                    try:
                        if datetime.fromisoformat(created_at).timestamp() < cutoff:
                            await self.delete(ns, item.get("key", ""))
                    except ValueError:
                        continue
            self.logger.info(f"Cleaned up data older than {days} days")
        except Exception as e:
            self.logger.error(f"Failed to cleanup old data: {e}")

    async def get_memory_stats(self) -> Dict[str, Any]:
        """Get memory usage statistics"""
        stats = {}
        for namespace_name, namespace in self.namespaces.items():
            local_count = len(self._fb_list(namespace))
            try:
                mcp_items = await self.memory_client.list(namespace=namespace)
                stats[namespace_name] = len(mcp_items) if mcp_items else local_count
            except Exception:
                stats[namespace_name] = local_count
        return stats
