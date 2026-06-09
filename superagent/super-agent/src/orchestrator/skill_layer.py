import json
import uuid
import logging
import httpx
import anthropic
import chromadb
from typing import Dict, List, Any, Optional
from chromadb.utils import embedding_functions

# LlamaIndex Instrumentation
from llama_index.core.instrumentation import get_dispatcher
dispatcher = get_dispatcher("super-agent.skill_layer")

class SkillMemory:
    """Stores and retrieves conversation context using ChromaDB."""
    def __init__(self, chroma_path: str, collection_name: str):
        self.client = chromadb.PersistentClient(path=chroma_path)
        self.embed_fn = embedding_functions.DefaultEmbeddingFunction()
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=self.embed_fn,
        )
        self.logger = logging.getLogger(__name__)

    async def store(self, user_input: str, plan: str, response: str):
        doc = f"USER: {user_input}\nPLAN: {plan}\nRESPONSE: {response}"
        self.collection.add(
            documents=[doc],
            ids=[str(uuid.uuid4())],
        )

    async def retrieve(self, query: str, limit: int = 5) -> str:
        count = self.collection.count()
        if count == 0:
            return "No past memory available."

        n = min(limit, count)
        results = self.collection.query(query_texts=[query], n_results=n)
        docs = results.get("documents", [[]])[0]

        if not docs:
            return "No relevant memory found."

        formatted = "\n---\n".join(docs)
        return f"RELEVANT PAST CONTEXT:\n{formatted}"

class SkillPlanner:
    """Uses local Qwen2.5 7B via Ollama to produce execution plans."""
    
    SYSTEM_PROMPT = """You are a planning assistant. Your only job is to read a user's request
and produce a clear, numbered execution plan for another AI to follow.

Rules:
- Output ONLY a JSON object, no markdown, no explanation.
- Format: {"goal": "...", "steps": ["step 1", "step 2", ...], "context_needed": true/false}
- Keep steps concrete and actionable.
- Set context_needed to true if past memory would help answer this request."""

    def __init__(self, ollama_url: str, model: str):
        self.url = f"{ollama_url}/api/chat"
        self.model = model
        self.logger = logging.getLogger(__name__)

    async def plan(self, user_input: str) -> dict:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": user_input},
            ],
            "stream": False,
        }

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(self.url, json=payload, timeout=60.0)
                resp.raise_for_status()
                raw = resp.json()["message"]["content"].strip()

                # Clean up markdown if present
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                raw = raw.strip()

                return json.loads(raw)
            except Exception as e:
                self.logger.warning(f"Planner failed: {e}. Using fallback plan.")
                return {"goal": user_input, "steps": [user_input], "context_needed": False}

class SkillExecutor:
    """Executes plans using Claude API with memory injection."""
    
    def __init__(self, api_key: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.logger = logging.getLogger(__name__)

    async def execute(self, user_input: str, plan: dict, memory_context: str) -> str:
        steps_text = "\n".join(
            f"  {i+1}. {s}" for i, s in enumerate(plan.get("steps", []))
        )

        system_prompt = f"""You are a helpful, precise AI assistant.
A planning system has already analysed the user's request and produced a structured plan.
You must follow the plan steps to deliver the best possible response.

{memory_context}

EXECUTION PLAN:
Goal: {plan.get('goal', 'Respond helpfully')}
Steps:
{steps_text}

Follow the plan. Be thorough but concise. Do not mention the planning system to the user."""

        message = await self.client.messages.create(
            model="claude-opus-4-8",
            max_tokens=8096,
            thinking={"type": "adaptive"},
            system=system_prompt,
            messages=[{"role": "user", "content": user_input}],
        )

        return message.content[0].text

class SkillLayer:
    """Orchestrates Planner -> Memory -> Executor."""
    
    def __init__(self, config: Dict[str, Any]):
        self.memory = SkillMemory(
            chroma_path=config.get("chroma_path", "./chroma_db"),
            collection_name=config.get("collection_name", "super_agent_memory")
        )
        self.planner = SkillPlanner(
            ollama_url=config.get("ollama_url", "http://localhost:11434"),
            model=config.get("planner_model", "qwen2.5:7b")
        )
        self.executor = SkillExecutor(
            api_key=config.get("anthropic_api_key")
        )
        self.logger = logging.getLogger(__name__)

    @dispatcher.span
    async def run(self, user_input: str) -> str:
        self.logger.info(f"SkillLayer processing: {user_input}")

        # 1. Plan
        plan = await self.planner.plan(user_input)
        
        # 2. Memory Retrieval
        memory_context = ""
        if plan.get("context_needed", False):
            memory_context = await self.memory.retrieve(user_input)
        
        # 3. Execute
        response = await self.executor.execute(user_input, plan, memory_context)
        
        # 4. Store
        await self.memory.store(user_input, json.dumps(plan), response)
        
        return response
