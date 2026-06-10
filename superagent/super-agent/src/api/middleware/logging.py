"""
Logging Middleware

Request/response logging and monitoring middleware.
"""

import logging
import time
import uuid
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from typing import Callable


logger = logging.getLogger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Logging middleware for API requests and responses"""
    
    def __init__(self, app, log_level: str = "INFO"):
        super().__init__(app)
        self.log_level = getattr(logging, log_level.upper())
        self.logger = logging.getLogger(f"{__name__}.requests")
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Log request and response"""
        # Generate request ID
        request_id = str(uuid.uuid4())[:8]
        
        # Record start time
        start_time = time.time()
        
        # Log request
        self.logger.log(
            self.log_level,
            f"Request {request_id}: {request.method} {request.url.path} - "
            f"Client: {request.client.host if request.client else 'unknown'} - "
            f"User-Agent: {request.headers.get('user-agent', 'unknown')}"
        )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Calculate processing time
            process_time = time.time() - start_time
            
            # Log response
            self.logger.log(
                self.log_level,
                f"Response {request_id}: {response.status_code} - "
                f"Duration: {process_time:.3f}s - "
                f"Size: {len(response.body) if hasattr(response, 'body') else 'unknown'} bytes"
            )
            
            # Add custom headers
            if hasattr(response, 'headers'):
                response.headers["X-Request-ID"] = request_id
                response.headers["X-Process-Time"] = f"{process_time:.3f}"
            
            return response
            
        except Exception as e:
            # Calculate processing time for error
            process_time = time.time() - start_time
            
            # Log error
            self.logger.error(
                f"Error {request_id}: {str(e)} - "
                f"Duration: {process_time:.3f}s"
            )
            
            # Return error response
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal server error",
                    "request_id": request_id,
                    "message": "An unexpected error occurred"
                },
                headers={
                    "X-Request-ID": request_id,
                    "X-Process-Time": f"{process_time:.3f}"
                }
            )


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Detailed request logging middleware"""
    
    def __init__(self, app, log_body: bool = False, max_body_size: int = 1000):
        super().__init__(app)
        self.log_body = log_body
        self.max_body_size = max_body_size
        self.logger = logging.getLogger(f"{__name__}.detailed")
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Log detailed request information"""
        request_id = str(uuid.uuid4())[:8]
        start_time = time.time()
        
        # Collect request details
        request_details = {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "query_params": dict(request.query_params),
            "headers": dict(request.headers),
            "client": {
                "host": request.client.host if request.client else "unknown",
                "port": request.client.port if request.client else None
            },
            "timestamp": time.time()
        }
        
        # Log body if enabled and not too large
        if self.log_body and request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.body()
                if len(body) <= self.max_body_size:
                    request_details["body"] = body.decode("utf-8", errors="ignore")
                else:
                    request_details["body_size"] = len(body)
                    request_details["body_truncated"] = True
            except Exception as e:
                request_details["body_error"] = str(e)
        
        # Log request
        self.logger.info(f"Request {request_id}: {request_details}")
        
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            
            # Collect response details
            response_details = {
                "request_id": request_id,
                "status_code": response.status_code,
                "headers": dict(response.headers) if hasattr(response, 'headers') else {},
                "process_time": process_time,
                "timestamp": time.time()
            }
            
            # Log response
            self.logger.info(f"Response {request_id}: {response_details}")
            
            # Add tracking headers
            if hasattr(response, 'headers'):
                response.headers["X-Request-ID"] = request_id
                response.headers["X-Process-Time"] = f"{process_time:.3f}"
            
            return response
            
        except Exception as e:
            process_time = time.time() - start_time
            
            # Log error with details
            error_details = {
                "request_id": request_id,
                "error": str(e),
                "process_time": process_time,
                "timestamp": time.time()
            }
            
            self.logger.error(f"Error {request_id}: {error_details}")
            
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal server error",
                    "request_id": request_id,
                    "message": "An unexpected error occurred"
                },
                headers={
                    "X-Request-ID": request_id,
                    "X-Process-Time": f"{process_time:.3f}"
                }
            )


class SecurityLoggingMiddleware(BaseHTTPMiddleware):
    """Security-focused logging middleware"""
    
    def __init__(self, app):
        super().__init__(app)
        self.logger = logging.getLogger(f"{__name__}.security")
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Log security-relevant information"""
        request_id = str(uuid.uuid4())[:8]
        
        # Security checks
        security_issues = []
        
        # Check for suspicious headers
        suspicious_headers = [
            "x-forwarded-for",
            "x-real-ip", 
            "x-originating-ip"
        ]
        
        for header in suspicious_headers:
            if header in request.headers:
                security_issues.append(f"Suspicious header: {header}")
        
        # Check for unusual user agents
        user_agent = request.headers.get("user-agent", "")
        if any(pattern in user_agent.lower() for pattern in ["sqlmap", "nmap", "nikto"]):
            security_issues.append(f"Suspicious user agent: {user_agent}")
        
        # Check for large requests
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > 10 * 1024 * 1024:  # 10MB
            security_issues.append(f"Large request: {content_length} bytes")
        
        # Log security events
        if security_issues:
            self.logger.warning(
                f"Security Alert {request_id}: "
                f"Path: {request.url.path} - "
                f"Issues: {security_issues} - "
                f"Client: {request.client.host if request.client else 'unknown'}"
            )
        
        try:
            response = await call_next(request)
            
            # Add security headers
            if hasattr(response, 'headers'):
                response.headers["X-Request-ID"] = request_id
                response.headers["X-Content-Type-Options"] = "nosniff"
                response.headers["X-Frame-Options"] = "DENY"
                response.headers["X-XSS-Protection"] = "1; mode=block"
            
            return response
            
        except Exception as e:
            self.logger.error(f"Security middleware error {request_id}: {e}")
            raise


class MetricsMiddleware(BaseHTTPMiddleware):
    """Metrics collection middleware"""
    
    def __init__(self, app):
        super().__init__(app)
        self.logger = logging.getLogger(f"{__name__}.metrics")
        self.request_count = 0
        self.error_count = 0
        self.total_response_time = 0.0
        self.start_time = time.time()
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Collect metrics for each request"""
        start_time = time.time()
        self.request_count += 1
        
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            self.total_response_time += process_time
            
            # Log metrics periodically
            if self.request_count % 100 == 0:
                self._log_metrics()
            
            return response
            
        except Exception as e:
            self.error_count += 1
            process_time = time.time() - start_time
            self.total_response_time += process_time
            
            self.logger.error(f"Metrics middleware error: {e}")
            raise
    
    def _log_metrics(self):
        """Log collected metrics"""
        uptime = time.time() - self.start_time
        avg_response_time = self.total_response_time / self.request_count if self.request_count > 0 else 0
        
        metrics = {
            "uptime_seconds": uptime,
            "total_requests": self.request_count,
            "error_count": self.error_count,
            "error_rate": self.error_count / self.request_count if self.request_count > 0 else 0,
            "average_response_time": avg_response_time,
            "requests_per_second": self.request_count / uptime if uptime > 0 else 0
        }
        
        self.logger.info(f"API Metrics: {metrics}")
    
    def get_metrics(self) -> dict:
        """Get current metrics"""
        uptime = time.time() - self.start_time
        avg_response_time = self.total_response_time / self.request_count if self.request_count > 0 else 0
        
        return {
            "uptime_seconds": uptime,
            "total_requests": self.request_count,
            "error_count": self.error_count,
            "error_rate": self.error_count / self.request_count if self.request_count > 0 else 0,
            "average_response_time": avg_response_time,
            "requests_per_second": self.request_count / uptime if uptime > 0 else 0
        }
