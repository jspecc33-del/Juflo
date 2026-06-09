"""
Test script to verify Super-Agent Orchestrator implementation
"""

import asyncio
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from orchestrator.engine import SuperAgentOrchestrator, Task, TaskType
from integrations.anthropic import AnthropicIntegration, ClaudeReasoningEngine
from mcp.clients.puppeteer import PuppeteerClient, PuppeteerMCPIntegration


async def test_orchestrator_init():
    """Test orchestrator initialization"""
    print("\n=== Testing Orchestrator Initialization ===")
    
    config = {
        "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", "test-key"),
        "filesystem": {"base_url": "http://localhost:3000"},
        "playwright": {"base_url": "http://localhost:3001"},
        "puppeteer": {"base_url": "http://localhost:3006"},
        "memory": {"base_url": "http://localhost:3002"},
        "postman": {"base_url": "http://localhost:3003"},
        "snyk": {"base_url": "http://localhost:3004"},
        "terraform": {"base_url": "http://localhost:3005"},
    }
    
    try:
        orchestrator = SuperAgentOrchestrator(config)
        print("✅ Orchestrator instantiated successfully")
        
        # Check MCP clients
        assert "puppeteer" in orchestrator.mcp_clients, "Puppeteer client not found"
        print("✅ Puppeteer client initialized")
        
        assert "filesystem" in orchestrator.mcp_clients, "Filesystem client not found"
        print("✅ Filesystem client initialized")
        
        # Check integrations
        assert "anthropic" in orchestrator.integrations, "Anthropic integration not found"
        print("✅ Anthropic integration initialized")
        
        assert "claude_reasoning" in orchestrator.integrations, "Claude reasoning not found"
        print("✅ Claude reasoning engine initialized")
        
        print("\n✅ All components initialized successfully!")
        return True
        
    except Exception as e:
        print(f"\n❌ Orchestrator initialization failed: {e}")
        return False


def test_puppeteer_client():
    """Test Puppeteer client class"""
    print("\n=== Testing Puppeteer Client ===")
    
    try:
        config = {
            "base_url": "http://localhost:3006",
            "headless": True
        }
        
        client = PuppeteerClient(config)
        assert client is not None, "Failed to create Puppeteer client"
        print("✅ PuppeteerClient instantiated successfully")
        
        # Check default values
        assert client.base_url == "http://localhost:3006", "Base URL mismatch"
        print("✅ Puppeteer client configuration correct")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Puppeteer client test failed: {e}")
        return False


def test_anthropic_integration():
    """Test Anthropic integration"""
    print("\n=== Testing Anthropic Integration ===")
    
    try:
        config = {
            "api_key": os.getenv("ANTHROPIC_API_KEY", "test-key"),
            "model": "claude-opus-4-8",
            "max_tokens": 1000
        }

        integration = AnthropicIntegration(config)
        assert integration is not None, "Failed to create Anthropic integration"
        print("✅ AnthropicIntegration instantiated successfully")

        # Check configuration
        assert integration.model == "claude-opus-4-8", "Model mismatch"
        print("✅ Anthropic configuration correct")
        
        # Test reasoning engine
        reasoning = ClaudeReasoningEngine(config)
        assert reasoning is not None, "Failed to create ClaudeReasoningEngine"
        print("✅ ClaudeReasoningEngine instantiated successfully")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Anthropic integration test failed: {e}")
        return False


def test_imports():
    """Test all imports work correctly"""
    print("\n=== Testing Module Imports ===")
    
    try:
        # Test MCP clients imports
        from mcp.clients import (
            FilesystemClient,
            PlaywrightClient,
            PuppeteerClient,
            MemoryClient,
            PostmanClient,
            SnykClient,
            TerraformClient
        )
        print("✅ All MCP client imports successful")
        
        # Test integration imports
        from integrations import (
            ScraperAPIIntegration,
            ApifyIntegration,
            SearchAPIIntegration,
            AnthropicIntegration,
            ClaudeReasoningEngine
        )
        print("✅ All integration imports successful")
        
        # Test orchestrator imports
        from orchestrator.engine import SuperAgentOrchestrator, Task, TaskType, TaskResult
        from orchestrator.router import ToolRouter
        from orchestrator.memory import MemoryManager
        print("✅ All orchestrator imports successful")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Import test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_task_types():
    """Test TaskType enum"""
    print("\n=== Testing Task Types ===")
    
    try:
        # Check all expected task types exist
        expected_types = [
            TaskType.FILE_OPERATION,
            TaskType.BROWSER_AUTOMATION,
            TaskType.WEB_SCRAPING,
            TaskType.WEB_SEARCH,
            TaskType.CONVERSATIONAL_SEARCH,
            TaskType.RESEARCH_SYNTHESIS,
            TaskType.FACT_CHECK,
            TaskType.NEWS_ANALYSIS,
            TaskType.API_TESTING,
            TaskType.SECURITY_SCAN,
            TaskType.INFRASTRUCTURE,
            TaskType.MEMORY_OPERATION,
            TaskType.GENERAL_QUERY
        ]
        
        for task_type in expected_types:
            assert isinstance(task_type, TaskType), f"{task_type} is not a TaskType"
            print(f"✅ {task_type.value} exists")
        
        print("\n✅ All task types verified!")
        return True
        
    except Exception as e:
        print(f"\n❌ Task type test failed: {e}")
        return False


async def run_all_tests():
    """Run all tests"""
    print("=" * 60)
    print("SUPER-AGENT ORCHESTRATOR IMPLEMENTATION TESTS")
    print("=" * 60)
    
    results = []
    
    # Run tests
    results.append(("Imports", test_imports()))
    results.append(("Task Types", test_task_types()))
    results.append(("Puppeteer Client", test_puppeteer_client()))
    results.append(("Anthropic Integration", test_anthropic_integration()))
    results.append(("Orchestrator Init", await test_orchestrator_init()))
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name:<30} {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Implementation is complete.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review.")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(run_all_tests())
    sys.exit(exit_code)
