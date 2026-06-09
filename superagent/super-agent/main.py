"""
Super-Agent Main Entry Point

Entry point for running the Super-Agent orchestrator.
"""

import asyncio
import logging
import uvicorn
from pathlib import Path

from src.api.main import app


def setup_logging():
    """Setup application logging"""
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.FileHandler("logs/super-agent.log"),
            logging.StreamHandler()
        ]
    )


def main():
    """Main entry point"""
    setup_logging()
    logger = logging.getLogger(__name__)
    
    logger.info("Starting Super-Agent Orchestrator...")
    
    try:
        # Run the FastAPI application
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level="info"
        )
    except KeyboardInterrupt:
        logger.info("Shutting down Super-Agent...")
    except Exception as e:
        logger.error(f"Failed to start Super-Agent: {e}")
        raise


if __name__ == "__main__":
    main()
