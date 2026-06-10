"""
Anthropic Integration

Integration with Anthropic's Claude API for AI reasoning,
natural language processing, and task analysis.
"""

import json
import logging
from typing import Dict, List, Any, Optional, AsyncGenerator
import anthropic
import os


class AnthropicIntegration:
    """Integration with Anthropic Claude API"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.api_key = config.get("api_key") or os.getenv("ANTHROPIC_API_KEY")
        self.model = config.get("model", "claude-opus-4-8")
        self.max_tokens = config.get("max_tokens", 4096)
        self.client: Optional[anthropic.AsyncAnthropic] = None
    
    async def connect(self):
        """Initialize Anthropic API connection"""
        if not self.api_key:
            raise ValueError("Anthropic API key not provided")
        self.client = anthropic.AsyncAnthropic(api_key=self.api_key)
        self.logger.info("Anthropic integration initialized")
    
    async def analyze_task(self, task_description: str, available_tools: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze a task and determine the best tool to use"""
        try:
            tools_str = json.dumps(available_tools, indent=2)
            
            prompt = f"""You are an intelligent task analyzer. Given a task description and available tools, 
your job is to determine the best tool(s) to use and provide a structured execution plan.

Task Description:
{task_description}

Available Tools:
{tools_str}

Analyze the task and provide a JSON response with the following structure:
{{
    "tool_recommendation": "name of the recommended tool",
    "confidence": 0.0-1.0,
    "reasoning": "explanation of why this tool is best",
    "execution_plan": ["step 1", "step 2", ...],
    "parameters": {{"key": "value"}},
    "fallback_tools": ["tool1", "tool2"]
}}

Respond ONLY with the JSON."""

            messages = [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
            
            response = await self._call_api(messages)
            
            # Parse the JSON response
            try:
                analysis = json.loads(response)
                self.logger.info(f"Task analysis complete. Recommended tool: {analysis.get('tool_recommendation')}")
                return analysis
            except json.JSONDecodeError:
                self.logger.error("Failed to parse task analysis response as JSON")
                return {
                    "tool_recommendation": "unknown",
                    "confidence": 0.0,
                    "reasoning": "Failed to parse response",
                    "execution_plan": [],
                    "parameters": {},
                    "fallback_tools": []
                }
        except Exception as e:
            self.logger.error(f"Task analysis failed: {str(e)}")
            raise
    
    async def generate_response(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Generate a response using Claude"""
        try:
            messages = [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
            
            return await self._call_api(messages, system_prompt)
        except Exception as e:
            self.logger.error(f"Response generation failed: {str(e)}")
            raise
    
    async def stream_response(self, prompt: str, system_prompt: Optional[str] = None) -> AsyncGenerator[str, None]:
        """Stream a response from Claude"""
        try:
            kwargs: Dict[str, Any] = {
                "model": self.model,
                "max_tokens": self.max_tokens,
                "thinking": {"type": "adaptive"},
                "messages": [{"role": "user", "content": prompt}],
            }
            if system_prompt:
                kwargs["system"] = system_prompt
            async with self.client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield text
        except Exception as e:
            self.logger.error(f"Streaming response failed: {str(e)}")
            raise
    
    async def summarize_text(self, text: str, max_length: int = 500) -> str:
        """Summarize long text"""
        try:
            prompt = f"""Summarize the following text in no more than {max_length} characters. 
Provide the key points and main ideas:

{text}

Summary:"""
            
            return await self.generate_response(prompt)
        except Exception as e:
            self.logger.error(f"Text summarization failed: {str(e)}")
            raise
    
    async def extract_entities(self, text: str) -> Dict[str, List[str]]:
        """Extract named entities from text"""
        try:
            prompt = f"""Extract named entities from the following text and return them as a JSON object.
Categories: people, organizations, locations, dates, technologies, concepts.

Text:
{text}

Return JSON format:
{{
    "people": ["name1", "name2"],
    "organizations": ["org1", "org2"],
    "locations": ["loc1", "loc2"],
    "dates": ["date1", "date2"],
    "technologies": ["tech1", "tech2"],
    "concepts": ["concept1", "concept2"]
}}

JSON Response:"""
            
            response = await self.generate_response(prompt)
            
            try:
                return json.loads(response)
            except json.JSONDecodeError:
                self.logger.error("Failed to parse entity extraction response")
                return {
                    "people": [],
                    "organizations": [],
                    "locations": [],
                    "dates": [],
                    "technologies": [],
                    "concepts": []
                }
        except Exception as e:
            self.logger.error(f"Entity extraction failed: {str(e)}")
            raise
    
    async def classify_intent(self, text: str, intents: List[str]) -> Dict[str, Any]:
        """Classify user intent"""
        try:
            intents_str = ", ".join(intents)
            
            prompt = f"""Classify the following user input into one of these intents: {intents_str}

User Input: {text}

Provide a JSON response:
{{
    "intent": "detected_intent",
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation",
    "entities": {{"key": "value"}}
}}

JSON Response:"""
            
            response = await self.generate_response(prompt)
            
            try:
                return json.loads(response)
            except json.JSONDecodeError:
                self.logger.error("Failed to parse intent classification")
                return {
                    "intent": "unknown",
                    "confidence": 0.0,
                    "reasoning": "Failed to parse response",
                    "entities": {}
                }
        except Exception as e:
            self.logger.error(f"Intent classification failed: {str(e)}")
            raise
    
    async def _call_api(self, messages: List[Dict[str, str]], system_prompt: Optional[str] = None) -> str:
        """Make a call to the Anthropic API"""
        try:
            kwargs: Dict[str, Any] = {
                "model": self.model,
                "max_tokens": self.max_tokens,
                "thinking": {"type": "adaptive"},
                "messages": messages,
            }
            if system_prompt:
                kwargs["system"] = system_prompt
            response = await self.client.messages.create(**kwargs)
            return next((b.text for b in response.content if b.type == "text"), "")
        except Exception as e:
            self.logger.error(f"API call failed: {str(e)}")
            raise
    
    async def close(self):
        """Close the API session"""
        self.logger.info("Anthropic integration closed")


class ClaudeReasoningEngine:
    """High-level reasoning engine using Claude"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.anthropic = AnthropicIntegration(config)
    
    async def __aenter__(self):
        await self.anthropic.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.anthropic.close()
    
    async def process_natural_language_request(self, request: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process a natural language request and determine actions"""
        try:
            system_prompt = """You are an intelligent agent orchestrator. Your role is to:
1. Understand user requests in natural language
2. Determine what actions need to be taken
3. Select appropriate tools for each action
4. Provide structured execution plans

Always respond with structured, actionable information."""
            
            context_str = json.dumps(context, indent=2)
            
            prompt = f"""Process this user request and provide a structured response.

User Request: {request}

Current Context:
{context_str}

Provide a JSON response with:
{{
    "understood_intent": "what the user wants",
    "required_actions": ["action1", "action2"],
    "recommended_tools": ["tool1", "tool2"],
    "execution_order": [1, 2, 3],
    "parameters": {{"key": "value"}},
    "clarifying_questions": ["question1"] or []
}}

JSON Response:"""
            
            response = await self.anthropic.generate_response(prompt, system_prompt)
            
            try:
                return json.loads(response)
            except json.JSONDecodeError:
                self.logger.error("Failed to parse reasoning response")
                return {
                    "understood_intent": request,
                    "required_actions": [],
                    "recommended_tools": [],
                    "execution_order": [],
                    "parameters": {},
                    "clarifying_questions": ["Could you provide more details?"]
                }
        except Exception as e:
            self.logger.error(f"Natural language processing failed: {str(e)}")
            raise
