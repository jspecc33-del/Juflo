"""
Task Management Routes

Endpoints for creating, monitoring, and managing tasks.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, Any, Optional, List

from ...orchestrator.engine import SuperAgentOrchestrator
from ...orchestrator.models import Task, TaskType
from ..deps import get_orchestrator


logger = logging.getLogger(__name__)
router = APIRouter()


class TaskCreateRequest(BaseModel):
    """Task creation request model"""
    description: str
    task_type: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    priority: int = 1
    dependencies: Optional[List[str]] = None


class TaskResponse(BaseModel):
    """Task response model"""
    id: str
    description: str
    task_type: str
    status: str
    priority: int
    parameters: Dict[str, Any]
    dependencies: List[str]
    created_at: str
    updated_at: Optional[str] = None


class WorkflowCreateRequest(BaseModel):
    """Workflow creation request model"""
    name: str
    description: str
    tasks: List[TaskCreateRequest]


class TaskListResponse(BaseModel):
    """Task list response model"""
    tasks: List[TaskResponse]
    total_count: int
    page: int
    page_size: int


@router.post("/tasks", response_model=TaskResponse)
async def create_task(
    request: TaskCreateRequest,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> TaskResponse:
    """Create a new task"""
    try:
        import time
        import uuid
        
        logger.info(f"Creating task: {request.description}")
        
        # Create task object
        task = Task(
            id=f"task_{uuid.uuid4().hex[:8]}",
            type=TaskType(request.task_type) if request.task_type else TaskType.GENERAL_QUERY,
            description=request.description,
            parameters=request.parameters or {},
            priority=request.priority,
            dependencies=request.dependencies or []
        )
        
        # Store task in memory
        await orchestrator.memory_manager.store_task(task)
        
        logger.info(f"Task created successfully: {task.id}")
        
        return TaskResponse(
            id=task.id,
            description=task.description,
            task_type=task.type.value,
            status="pending",
            priority=task.priority,
            parameters=task.parameters,
            dependencies=task.dependencies,
            created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ")
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid task type: {e}"
        )
    except Exception as e:
        logger.error(f"Error creating task: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to create task"
        )


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    task_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> TaskListResponse:
    """List tasks with pagination and filtering"""
    try:
        logger.info(f"Listing tasks: page={page}, page_size={page_size}")
        
        # Get task history
        all_tasks = await orchestrator.memory_manager.get_task_history(
            limit=page_size * page,
            task_type=task_type
        )
        
        # Filter by status if specified
        if status:
            all_tasks = [
                task for task in all_tasks
                if task.get("status") == status
            ]
        
        # Apply pagination
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_tasks = all_tasks[start_idx:end_idx]
        
        # Convert to response format
        task_responses = []
        for task in paginated_tasks:
            task_responses.append(TaskResponse(
                id=task.get("id", ""),
                description=task.get("description", ""),
                task_type=task.get("type", ""),
                status=task.get("status", "unknown"),
                priority=task.get("priority", 1),
                parameters=task.get("parameters", {}),
                dependencies=task.get("dependencies", []),
                created_at=task.get("created_at", ""),
                updated_at=task.get("updated_at")
            ))
        
        return TaskListResponse(
            tasks=task_responses,
            total_count=len(all_tasks),
            page=page,
            page_size=page_size
        )
    
    except Exception as e:
        logger.error(f"Error listing tasks: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to list tasks"
        )


@router.get("/tasks/statistics")
async def get_task_statistics(
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Get task execution statistics"""
    try:
        logger.info("Getting task statistics")

        all_tasks = await orchestrator.memory_manager.get_task_history(limit=1000)

        total_tasks = len(all_tasks)
        completed_tasks = len([t for t in all_tasks if t.get("status") == "completed"])
        failed_tasks = len([t for t in all_tasks if t.get("status") == "failed"])
        pending_tasks = len([t for t in all_tasks if t.get("status") == "pending"])

        task_types: Dict[str, int] = {}
        for task in all_tasks:
            task_type = task.get("type", "unknown")
            task_types[task_type] = task_types.get(task_type, 0) + 1

        all_results = await orchestrator.memory_manager.list("results", limit=1000)
        execution_times = [r.get("execution_time", 0) for r in all_results if r.get("execution_time")]
        avg_execution_time = sum(execution_times) / len(execution_times) if execution_times else 0

        return {
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "failed_tasks": failed_tasks,
            "pending_tasks": pending_tasks,
            "success_rate": completed_tasks / total_tasks if total_tasks > 0 else 0,
            "task_type_distribution": task_types,
            "average_execution_time": avg_execution_time,
            "total_execution_time": sum(execution_times)
        }

    except Exception as e:
        logger.error(f"Error getting task statistics: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to get task statistics"
        )


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> TaskResponse:
    """Get a specific task by ID"""
    try:
        logger.info(f"Getting task: {task_id}")
        
        # Retrieve task from memory
        task_data = await orchestrator.memory_manager.get_task(task_id)
        
        if not task_data:
            raise HTTPException(
                status_code=404,
                detail=f"Task {task_id} not found"
            )
        
        return TaskResponse(
            id=task_data.get("id", ""),
            description=task_data.get("description", ""),
            task_type=task_data.get("type", ""),
            status=task_data.get("status", "unknown"),
            priority=task_data.get("priority", 1),
            parameters=task_data.get("parameters", {}),
            dependencies=task_data.get("dependencies", []),
            created_at=task_data.get("created_at", ""),
            updated_at=task_data.get("updated_at")
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting task {task_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to get task"
        )


@router.post("/tasks/{task_id}/execute")
async def execute_task(
    task_id: str,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Execute a specific task"""
    try:
        logger.info(f"Executing task: {task_id}")
        
        # Retrieve task from memory
        task_data = await orchestrator.memory_manager.get_task(task_id)
        
        if not task_data:
            raise HTTPException(
                status_code=404,
                detail=f"Task {task_id} not found"
            )
        
        # Convert to Task object
        task = Task(
            id=task_data.get("id", ""),
            type=TaskType(task_data.get("type", "general_query")),
            description=task_data.get("description", ""),
            parameters=task_data.get("parameters", {}),
            priority=task_data.get("priority", 1),
            dependencies=task_data.get("dependencies", [])
        )
        
        # Execute task
        result = await orchestrator.execute_task(task)
        
        # Store result
        await orchestrator.memory_manager.store_result(result)
        
        if result.success:
            logger.info(f"Task {task_id} executed successfully")
            return {
                "task_id": task_id,
                "status": "completed",
                "result": result.result,
                "execution_time": result.execution_time,
                "metadata": result.metadata
            }
        else:
            logger.error(f"Task {task_id} execution failed: {result.error}")
            return {
                "task_id": task_id,
                "status": "failed",
                "error": result.error,
                "execution_time": result.execution_time,
                "metadata": result.metadata
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing task {task_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to execute task"
        )


@router.post("/workflows")
async def create_workflow(
    request: WorkflowCreateRequest,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Create and execute a workflow of multiple tasks"""
    try:
        import time
        import uuid
        
        logger.info(f"Creating workflow: {request.name}")
        
        # Convert request to Task objects
        tasks = []
        for task_req in request.tasks:
            task = Task(
                id=f"task_{uuid.uuid4().hex[:8]}",
                type=TaskType(task_req.task_type) if task_req.task_type else TaskType.GENERAL_QUERY,
                description=task_req.description,
                parameters=task_req.parameters or {},
                priority=task_req.priority,
                dependencies=task_req.dependencies or []
            )
            tasks.append(task)
        
        # Execute workflow
        results = await orchestrator.execute_workflow(tasks)
        
        # Calculate workflow statistics
        successful_tasks = [r for r in results if r.success]
        failed_tasks = [r for r in results if not r.success]
        total_execution_time = sum(r.execution_time for r in results)
        
        workflow_id = f"workflow_{uuid.uuid4().hex[:8]}"
        
        # Store workflow in memory
        workflow_data = {
            "id": workflow_id,
            "name": request.name,
            "description": request.description,
            "tasks": [task.id for task in tasks],
            "results": [r.task_id for r in results],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "status": "completed" if len(failed_tasks) == 0 else "partial_failure"
        }
        
        await orchestrator.memory_manager.store("workflows", workflow_id, workflow_data)
        
        logger.info(f"Workflow {workflow_id} completed: {len(successful_tasks)}/{len(results)} tasks successful")
        
        return {
            "workflow_id": workflow_id,
            "name": request.name,
            "status": workflow_data["status"],
            "total_tasks": len(tasks),
            "successful_tasks": len(successful_tasks),
            "failed_tasks": len(failed_tasks),
            "total_execution_time": total_execution_time,
            "results": [
                {
                    "task_id": r.task_id,
                    "success": r.success,
                    "execution_time": r.execution_time,
                    "error": r.error
                }
                for r in results
            ]
        }
    
    except Exception as e:
        logger.error(f"Error creating workflow: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to create workflow"
        )


@router.get("/tasks/{task_id}/result")
async def get_task_result(
    task_id: str,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Get result of a specific task"""
    try:
        logger.info(f"Getting result for task: {task_id}")
        
        # Retrieve result from memory
        result_data = await orchestrator.memory_manager.get_result(task_id)
        
        if not result_data:
            raise HTTPException(
                status_code=404,
                detail=f"Result for task {task_id} not found"
            )
        
        return {
            "task_id": task_id,
            "success": result_data.get("success", False),
            "result": result_data.get("result"),
            "error": result_data.get("error"),
            "execution_time": result_data.get("execution_time", 0.0),
            "metadata": result_data.get("metadata", {}),
            "completed_at": result_data.get("completed_at")
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting task result {task_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to get task result"
        )


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Delete a task and its result"""
    try:
        logger.info(f"Deleting task: {task_id}")
        
        # Delete task and result from memory
        task_deleted = await orchestrator.memory_manager.delete("tasks", f"task:{task_id}")
        result_deleted = await orchestrator.memory_manager.delete("results", f"result:{task_id}")
        
        if task_deleted or result_deleted:
            logger.info(f"Task {task_id} deleted successfully")
            return {
                "message": f"Task {task_id} deleted successfully",
                "task_deleted": task_deleted,
                "result_deleted": result_deleted
            }
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Task {task_id} not found"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting task {task_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to delete task"
        )


