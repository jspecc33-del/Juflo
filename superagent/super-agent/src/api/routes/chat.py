"""
Chat Routes

Endpoints for natural language interaction with the Super-Agent.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional, List

from ...orchestrator.engine import SuperAgentOrchestrator
from ..deps import get_orchestrator


logger = logging.getLogger(__name__)
router = APIRouter()


class ChatRequest(BaseModel):
    """Chat request model"""
    message: str
    context: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None


class ChatResponse(BaseModel):
    """Chat response model"""
    response: str
    task_id: str
    execution_time: float
    task_type: str
    metadata: Optional[Dict[str, Any]] = None


class ChatHistoryResponse(BaseModel):
    """Chat history response model"""
    messages: List[Dict[str, Any]]
    total_count: int
    session_id: str


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> ChatResponse:
    """Process natural language chat request"""
    try:
        import time
        start_time = time.time()
        
        logger.info(f"Processing chat request: {request.message[:100]}...")
        
        # Process request through orchestrator
        result = await orchestrator.process_request(
            request.message,
            request.context or {}
        )
        
        execution_time = time.time() - start_time
        
        if result.success:
            logger.info(f"Chat request completed successfully in {execution_time:.2f}s")
            
            return ChatResponse(
                response=str(result.result) if result.result else "Task completed successfully",
                task_id=result.task_id,
                execution_time=execution_time,
                task_type=result.metadata.get("task_type", "unknown") if result.metadata else "unknown",
                metadata=result.metadata
            )
        else:
            logger.error(f"Chat request failed: {result.error}")
            raise HTTPException(
                status_code=500,
                detail=f"Request processing failed: {result.error}"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in chat endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error while processing request"
        )


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
):
    """Process chat request with streaming response"""
    try:
        import asyncio
        import time
        import json
        
        logger.info(f"Processing streaming chat request: {request.message[:100]}...")
        
        async def generate_response():
            """Generate streaming response"""
            start_time = time.time()
            
            # Send initial acknowledgment
            yield f"data: {json.dumps({'type': 'start', 'message': 'Processing request...'})}\n\n"
            
            try:
                # Process request through orchestrator
                result = await orchestrator.process_request(
                    request.message,
                    request.context or {}
                )
                
                execution_time = time.time() - start_time
                
                if result.success:
                    # Send progress updates
                    yield f"data: {json.dumps({'type': 'progress', 'message': 'Task completed successfully'})}\n\n"
                    
                    # Send final result
                    response_data = {
                        'type': 'complete',
                        'response': str(result.result) if result.result else "Task completed successfully",
                        'task_id': result.task_id,
                        'execution_time': execution_time,
                        'task_type': result.metadata.get("task_type", "unknown") if result.metadata else "unknown",
                        'metadata': result.metadata
                    }
                    yield f"data: {json.dumps(response_data)}\n\n"
                else:
                    # Send error
                    error_data = {
                        'type': 'error',
                        'error': result.error,
                        'execution_time': execution_time
                    }
                    yield f"data: {json.dumps(error_data)}\n\n"
            
            except Exception as e:
                logger.error(f"Error in streaming chat: {e}")
                error_data = {
                    'type': 'error',
                    'error': str(e)
                }
                yield f"data: {json.dumps(error_data)}\n\n"
            
            finally:
                yield f"data: {json.dumps({'type': 'end'})}\n\n"
        
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            generate_response(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    
    except Exception as e:
        logger.error(f"Error setting up streaming chat: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to set up streaming response"
        )


@router.get("/chat/history/{session_id}")
async def get_chat_history(
    session_id: str,
    limit: int = 50,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> ChatHistoryResponse:
    """Get chat history for a session"""
    try:
        # Retrieve task history for this session
        tasks = await orchestrator.memory_manager.search_tasks(
            f"session:{session_id}",
            limit
        )
        
        # Format as chat messages
        messages = []
        for task in tasks:
            if task.get("description"):
                messages.append({
                    "role": "user",
                    "content": task["description"],
                    "timestamp": task.get("created_at"),
                    "task_id": task.get("id")
                })
            
            # Try to get corresponding result
            result = await orchestrator.memory_manager.get_result(task.get("id"))
            if result and result.get("result"):
                messages.append({
                    "role": "assistant", 
                    "content": str(result["result"]),
                    "timestamp": result.get("completed_at"),
                    "task_id": result.get("task_id"),
                    "execution_time": result.get("execution_time")
                })
        
        # Sort by timestamp
        messages.sort(key=lambda x: x.get("timestamp", ""))
        
        return ChatHistoryResponse(
            messages=messages,
            total_count=len(messages),
            session_id=session_id
        )
    
    except Exception as e:
        logger.error(f"Error getting chat history: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve chat history"
        )


@router.delete("/chat/history/{session_id}")
async def clear_chat_history(
    session_id: str,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Clear chat history for a session"""
    try:
        # Search for tasks in this session
        tasks = await orchestrator.memory_manager.search_tasks(
            f"session:{session_id}",
            limit=1000  # Large limit to get all
        )
        
        deleted_count = 0
        for task in tasks:
            task_id = task.get("id")
            if task_id:
                # Delete task and result from memory
                try:
                    await orchestrator.memory_manager.delete("tasks", f"task:{task_id}")
                    await orchestrator.memory_manager.delete("results", f"result:{task_id}")
                    deleted_count += 1
                except Exception as e:
                    logger.warning(f"Failed to delete task {task_id}: {e}")
        
        logger.info(f"Cleared {deleted_count} items from session {session_id}")
        
        return {
            "message": f"Chat history cleared for session {session_id}",
            "deleted_count": deleted_count
        }
    
    except Exception as e:
        logger.error(f"Error clearing chat history: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to clear chat history"
        )


@router.post("/chat/suggest")
async def get_task_suggestions(
    request: ChatRequest,
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Get task suggestions based on partial input"""
    try:
        # Analyze the partial request to suggest completions
        suggestions = []
        
        message_lower = request.message.lower()
        
        # Common task patterns
        if "scrape" in message_lower or "extract" in message_lower:
            suggestions.extend([
                "scrape website content from URL",
                "extract contact information from website",
                "scrape product details from Amazon",
                "crawl website for data extraction"
            ])
        
        if "file" in message_lower or "read" in message_lower:
            suggestions.extend([
                "read file from path",
                "write content to file",
                "list files in directory",
                "delete file from system"
            ])
        
        if "test" in message_lower or "api" in message_lower:
            suggestions.extend([
                "test API endpoint",
                "run Postman collection",
                "validate API response",
                "monitor API performance"
            ])
        
        if "security" in message_lower or "scan" in message_lower:
            suggestions.extend([
                "scan for vulnerabilities",
                "check dependencies for security issues",
                "analyze code security",
                "generate security report"
            ])
        
        if "deploy" in message_lower or "infra" in message_lower:
            suggestions.extend([
                "deploy infrastructure with Terraform",
                "provision cloud resources",
                "update infrastructure configuration",
                "destroy infrastructure"
            ])
        
        # Remove duplicates and limit
        unique_suggestions = list(dict.fromkeys(suggestions))[:10]
        
        return {
            "suggestions": unique_suggestions,
            "input": request.message,
            "count": len(unique_suggestions)
        }
    
    except Exception as e:
        logger.error(f"Error getting suggestions: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate suggestions"
        )


@router.get("/chat/sessions")
async def get_chat_sessions(
    orchestrator: SuperAgentOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Get list of chat sessions"""
    try:
        # Get all tasks and group by session
        all_tasks = await orchestrator.memory_manager.list("tasks", limit=1000)
        
        sessions = {}
        for task in all_tasks:
            # Extract session ID from task context or create default
            task_id = task.get("id", "")
            session_id = "default"  # In production, extract from actual session data
            
            if session_id not in sessions:
                sessions[session_id] = {
                    "session_id": session_id,
                    "message_count": 0,
                    "last_activity": task.get("created_at", ""),
                    "created_at": task.get("created_at", "")
                }
            
            sessions[session_id]["message_count"] += 1
            
            # Update last activity if more recent
            if task.get("created_at", "") > sessions[session_id]["last_activity"]:
                sessions[session_id]["last_activity"] = task.get("created_at", "")
        
        return {
            "sessions": list(sessions.values()),
            "total_sessions": len(sessions),
            "total_messages": sum(s["message_count"] for s in sessions.values())
        }
    
    except Exception as e:
        logger.error(f"Error getting chat sessions: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve chat sessions"
        )
