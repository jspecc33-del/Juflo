import asyncio
import json
import os
from src.orchestrator.skill_layer import SkillLayer

async def test_reasoning_pipeline():
    print("Starting Skill Layer Integration Test...")
    
    # Configuration
    config = {
        "ollama_url": "http://localhost:11434",
        "planner_model": "qwen2.5:7b",
        "chroma_path": "./qwen_db",
        "collection_name": "test_collection",
        "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", "mock-key")
    }
    
    sl = SkillLayer(config)
    
    # 1. Test Planning
    print("\n--- Testing Planner (Qwen) ---")
    user_input = "I want to search for information about the new Qwen3 model and save it to memory."
    plan = await sl.planner.plan(user_input)
    print(f"Plan generated: {json.dumps(plan, indent=2)}")
    
    # 2. Test Memory
    print("\n--- Testing Memory (Chroma) ---")
    await sl.memory.store(user_input, json.dumps(plan), "This is a test response.")
    context = await sl.memory.retrieve("Qwen3 model")
    print(f"Context retrieved: {context}")
    
    # 3. Test Full Pipeline (MOCKING Executor if no API key)
    print("\n--- Testing Full Pipeline (Execution) ---")
    if config["anthropic_api_key"] == "mock-key":
        print("Skipping real Claude execution (no API key).")
    else:
        response = await sl.run(user_input)
        print(f"Final Response: {response}")

if __name__ == "__main__":
    asyncio.run(test_reasoning_pipeline())
