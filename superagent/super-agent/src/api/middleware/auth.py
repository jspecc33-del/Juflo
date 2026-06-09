"""
Authentication Middleware

Handles API authentication and authorization.
"""

import logging
import os
from fastapi import Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import time
import jwt
from typing import Optional


logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"


class AuthMiddleware(BaseHTTPMiddleware):
    """Authentication middleware for API requests"""
    
    def __init__(self, app, exclude_paths: Optional[list] = None):
        super().__init__(app)
        self.exclude_paths = exclude_paths or [
            "/",
            "/api/v1/health",
            "/api/v1/health/detailed",
            "/docs",
            "/openapi.json"
        ]
    
    async def dispatch(self, request: Request, call_next):
        """Process request through authentication"""
        path = request.url.path
        
        # Skip authentication for excluded paths
        if any(path.startswith(excluded) for excluded in self.exclude_paths):
            return await call_next(request)
        
        # Get authorization header
        auth_header = request.headers.get("authorization")
        
        if not auth_header:
            return self._unauthorized_response("Missing authorization header")
        
        try:
            # Extract token from "Bearer <token>" format
            if not auth_header.startswith("Bearer "):
                return self._unauthorized_response("Invalid authorization header format")
            
            token = auth_header[7:]  # Remove "Bearer " prefix
            
            # Validate token (simplified for demo)
            if not self._validate_token(token):
                return self._unauthorized_response("Invalid or expired token")
            
            # Add user info to request state
            request.state.user = self._decode_token(token)
            
            return await call_next(request)
            
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return self._unauthorized_response("Authentication failed")
    
    def _validate_token(self, token: str) -> bool:
        """Validate JWT token (simplified for demo)"""
        try:
            # In production, use proper JWT validation
            if token == "demo-token":
                return True
            
            # Try to decode JWT
            jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return True
        except jwt.ExpiredSignatureError:
            logger.warning("Token expired")
            return False
        except jwt.InvalidTokenError:
            logger.warning("Invalid token")
            return False
        except Exception as e:
            logger.error(f"Token validation error: {e}")
            return False
    
    def _decode_token(self, token: str) -> dict:
        """Decode JWT token and return user info"""
        try:
            if token == "demo-token":
                return {
                    "user_id": "demo-user",
                    "username": "demo",
                    "permissions": ["read", "write", "execute"]
                }
            
            # Decode JWT
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except Exception as e:
            logger.error(f"Token decode error: {e}")
            return {
                "user_id": "unknown",
                "username": "unknown",
                "permissions": []
            }
    
    def _unauthorized_response(self, message: str) -> JSONResponse:
        """Return unauthorized response"""
        return JSONResponse(
            status_code=401,
            content={
                "error": "Unauthorized",
                "message": message,
                "timestamp": time.time()
            }
        )


# HTTP Bearer scheme for FastAPI
security = HTTPBearer()


async def get_current_user(request: Request):
    """Get current user from request state"""
    if hasattr(request.state, 'user') and request.state.user:
        return request.state.user
    
    raise HTTPException(
        status_code=401,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def require_permission(permission: str):
    """Decorator to require specific permission"""
    def permission_checker(current_user: dict = Depends(get_current_user)):
        user_permissions = current_user.get("permissions", [])
        
        if permission not in user_permissions:
            raise HTTPException(
                status_code=403,
                detail=f"Permission '{permission}' required"
            )
        
        return current_user
    
    return permission_checker


def create_demo_token(user_data: dict) -> str:
    """Create a demo token (for testing)"""
    return "demo-token"


def create_jwt_token(user_data: dict, expires_in: int = 3600) -> str:
    """Create JWT token"""
    payload = {
        **user_data,
        "exp": time.time() + expires_in,
        "iat": time.time()
    }
    
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_api_key(request: Request) -> Optional[str]:
    """Extract API key from request"""
    # Check Authorization header
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]
    
    # Check query parameter
    api_key = request.query_params.get("api_key")
    if api_key:
        return api_key
    
    # Check custom header
    api_key_header = request.headers.get("x-api-key")
    if api_key_header:
        return api_key_header
    
    return None


class APIKeyMiddleware(BaseHTTPMiddleware):
    """API Key authentication middleware"""
    
    def __init__(self, app, api_keys: list, exclude_paths: Optional[list] = None):
        super().__init__(app)
        self.api_keys = set(api_keys)
        self.exclude_paths = exclude_paths or [
            "/",
            "/api/v1/health",
            "/docs",
            "/openapi.json"
        ]
    
    async def dispatch(self, request: Request, call_next):
        """Process request through API key validation"""
        path = request.url.path
        
        # Skip API key validation for excluded paths
        if any(path.startswith(excluded) for excluded in self.exclude_paths):
            return await call_next(request)
        
        # Validate API key
        api_key = verify_api_key(request)
        
        if not api_key or api_key not in self.api_keys:
            return JSONResponse(
                status_code=401,
                content={
                    "error": "Invalid API key",
                    "message": "Valid API key required"
                }
            )
        
        # Add API key info to request state
        request.state.api_key = api_key
        
        return await call_next(request)
