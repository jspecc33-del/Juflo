#!/usr/bin/env python3
"""
AI Search Agent Demo

Demonstrates the capabilities of different specialized agents
including research, conversational, fact-checking, and news agents.
"""

import asyncio
import os
import sys
from dotenv import load_dotenv

# Add the src directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from manager import SearchAPICollection, SearchStrategy
from agent.base import AgentConfig, AgentType
from agent.config import AgentConfigurationManager
from agent.memory import ConversationMemory
from agent.research_agent import ResearchAgent
from agent.conversational_agent import ConversationalAgent
from agent.factcheck_agent import FactCheckAgent
from agent.news_agent import NewsAgent


async def demo_research_agent():
    """Demonstrate research agent capabilities"""
    print("=" * 60)
    print("RESEARCH AGENT DEMO")
    print("=" * 60)
    
    # Load configuration
    load_dotenv()
    
    search_config = {
        "strategy": "parallel",
        "primary_api": "tavily",
        "apis": {
            "tavily": {
                "api_key": os.getenv("TAVILY_API_KEY", "demo_key"),
                "config": {"search_depth": "advanced"}
            },
            "brave": {
                "api_key": os.getenv("BRAVE_API_KEY", "demo_key"),
                "config": {"country": "US"}
            }
        }
    }
    
    # Create configuration manager and get agent config
    config_manager = AgentConfigurationManager()
    agent_config = config_manager.get_agent_config(AgentType.RESEARCH)
    
    # Initialize research agent
    async with ResearchAgent(search_config, agent_config) as agent:
        print("Research Agent initialized successfully!")
        
        # Research queries
        research_queries = [
            "quantum computing applications in medicine",
            "climate change impact on agriculture",
            "artificial intelligence ethics research"
        ]
        
        for query in research_queries:
            print(f"\n🔍 Researching: {query}")
            print("-" * 40)
            
            try:
                response = await agent.process_query(query)
                
                print(f"✅ Research completed!")
                print(f"📊 Confidence: {response.confidence:.2f}")
                print(f"⏱️  Processing time: {response.processing_time:.2f}s")
                print(f"📚 Sources found: {len(response.sources)}")
                
                # Display summary
                if response.answer:
                    summary = response.answer[:500] + "..." if len(response.answer) > 500 else response.answer
                    print(f"\n📋 Summary:\n{summary}")
                
                # Display top sources
                if response.sources:
                    print(f"\n📖 Top Sources:")
                    for i, source in enumerate(response.sources[:3], 1):
                        print(f"  {i}. {source.title}")
                        print(f"     {source.url}")
                
            except Exception as e:
                print(f"❌ Error: {e}")


async def demo_conversational_agent():
    """Demonstrate conversational agent capabilities"""
    print("\n" + "=" * 60)
    print("CONVERSATIONAL AGENT DEMO")
    print("=" * 60)
    
    # Load configuration
    load_dotenv()
    
    search_config = {
        "strategy": "fallback",
        "primary_api": "tavily",
        "apis": {
            "tavily": {
                "api_key": os.getenv("TAVILY_API_KEY", "demo_key"),
                "config": {"search_depth": "basic"}
            }
        }
    }
    
    # Create configuration manager and get agent config
    config_manager = AgentConfigurationManager()
    agent_config = config_manager.get_agent_config(AgentType.CONVERSATIONAL)
    
    # Initialize memory and conversational agent
    memory = ConversationMemory()
    session_id = memory.create_session("conversational")
    
    async with ConversationalAgent(search_config, agent_config, memory) as agent:
        agent.set_session_id(session_id)
        print("Conversational Agent initialized successfully!")
        
        # Conversational queries
        conversation = [
            "Hi! Can you tell me about renewable energy?",
            "That's interesting. What about solar panels specifically?",
            "How do they compare to wind energy?",
            "What are the latest developments in this field?"
        ]
        
        for i, query in enumerate(conversation, 1):
            print(f"\n💬 Turn {i}: {query}")
            print("-" * 40)
            
            try:
                response = await agent.process_query(query)
                
                print(f"🤖 Agent Response:")
                # Display conversational response
                if response.answer:
                    answer_lines = response.answer.split('\n')
                    for line in answer_lines[:5]:  # First 5 lines
                        if line.strip():
                            print(f"  {line}")
                
                print(f"\n📊 Confidence: {response.confidence:.2f}")
                print(f"💭 Personalization: {response.metadata.get('personalization_level', 0):.2f}")
                
                # Add to memory
                memory.add_conversation_turn(session_id, query, response)
                
            except Exception as e:
                print(f"❌ Error: {e}")
        
        # Show conversation summary
        summary = agent.get_conversation_summary()
        print(f"\n📈 Conversation Summary:")
        print(f"  Total exchanges: {summary.get('total_exchanges', 0)}")
        print(f"  Current topic: {summary.get('current_topic', 'N/A')}")
        print(f"  Personalization level: {summary.get('personalization_level', 0):.2f}")


async def demo_fact_check_agent():
    """Demonstrate fact-checking agent capabilities"""
    print("\n" + "=" * 60)
    print("FACT-CHECKING AGENT DEMO")
    print("=" * 60)
    
    # Load configuration
    load_dotenv()
    
    search_config = {
        "strategy": "parallel",
        "primary_api": "tavily",
        "apis": {
            "tavily": {
                "api_key": os.getenv("TAVILY_API_KEY", "demo_key"),
                "config": {"search_depth": "advanced"}
            },
            "serpapi": {
                "api_key": os.getenv("SERPAPI_KEY", "demo_key"),
                "config": {"engine": "google"}
            }
        }
    }
    
    # Create configuration manager and get agent config
    config_manager = AgentConfigurationManager()
    agent_config = config_manager.get_agent_config(AgentType.FACT_CHECK)
    
    # Initialize fact-checking agent
    async with FactCheckAgent(search_config, agent_config) as agent:
        print("Fact-Checking Agent initialized successfully!")
        
        # Claims to verify
        claims = [
            "vaccines cause autism",
            "humans only use 10% of their brain",
            "lightning never strikes the same place twice",
            "goldfish have a 3-second memory"
        ]
        
        for claim in claims:
            print(f"\n🔍 Fact-checking claim: {claim}")
            print("-" * 40)
            
            try:
                response = await agent.process_query(f"fact check {claim}")
                
                print(f"✅ Fact-check completed!")
                print(f"📊 Confidence: {response.confidence:.2f}")
                print(f"⏱️  Processing time: {response.processing_time:.2f}s")
                
                # Display verdict
                if response.answer:
                    # Look for verdict in the answer
                    answer_lower = response.answer.lower()
                    if "true" in answer_lower:
                        verdict = "✅ TRUE"
                    elif "false" in answer_lower:
                        verdict = "❌ FALSE"
                    elif "mostly true" in answer_lower:
                        verdict = "🟡 MOSTLY TRUE"
                    elif "mostly false" in answer_lower:
                        verdict = "🟠 MOSTLY FALSE"
                    elif "unverifiable" in answer_lower:
                        verdict = "❓ UNVERIFIABLE"
                    else:
                        verdict = "🔍 NEEDS INVESTIGATION"
                    
                    print(f"🏛️  Verdict: {verdict}")
                    
                    # Display explanation
                    lines = response.answer.split('\n')
                    for line in lines:
                        if 'explanation' in line.lower() or 'evidence' in line.lower():
                            print(f"📋 {line}")
                            break
                
                # Display sources
                if response.sources:
                    print(f"\n📚 Sources consulted: {len(response.sources)}")
                    for i, source in enumerate(response.sources[:3], 1):
                        print(f"  {i}. {source.title}")
                
            except Exception as e:
                print(f"❌ Error: {e}")


async def demo_news_agent():
    """Demonstrate news agent capabilities"""
    print("\n" + "=" * 60)
    print("NEWS AGENT DEMO")
    print("=" * 60)
    
    # Load configuration
    load_dotenv()
    
    search_config = {
        "strategy": "parallel",
        "primary_api": "tavily",
        "apis": {
            "tavily": {
                "api_key": os.getenv("TAVILY_API_KEY", "demo_key"),
                "config": {"search_depth": "basic", "days": 7}
            },
            "brave": {
                "api_key": os.getenv("BRAVE_API_KEY", "demo_key"),
                "config": {"country": "US", "search_lang": "en"}
            }
        }
    }
    
    # Create configuration manager and get agent config
    config_manager = AgentConfigurationManager()
    agent_config = config_manager.get_agent_config(AgentType.NEWS)
    
    # Initialize news agent
    async with NewsAgent(search_config, agent_config) as agent:
        print("News Agent initialized successfully!")
        
        # News queries
        news_queries = [
            "artificial intelligence latest developments",
            "climate change policy updates",
            "technology industry news"
        ]
        
        for query in news_queries:
            print(f"\n📰 Searching news: {query}")
            print("-" * 40)
            
            try:
                response = await agent.process_query(query)
                
                print(f"✅ News search completed!")
                print(f"📊 Confidence: {response.confidence:.2f}")
                print(f"⏱️  Processing time: {response.processing_time:.2f}s")
                print(f"📰 Articles found: {len(response.sources)}")
                
                # Display news summary
                if response.answer:
                    # Extract key information
                    lines = response.answer.split('\n')
                    for line in lines:
                        if 'top news articles' in line.lower() or 'trending' in line.lower():
                            print(f"📋 {line}")
                            break
                
                # Display top articles
                if response.sources:
                    print(f"\n📰 Top Articles:")
                    for i, source in enumerate(response.sources[:3], 1):
                        print(f"  {i}. {source.title}")
                        print(f"     {source.url}")
                
                # Display metadata if available
                if response.metadata:
                    metadata = response.metadata
                    if 'source_diversity' in metadata:
                        print(f"\n🌍 Source Diversity: {len(metadata['source_diversity'])} unique sources")
                    if 'trending_topics' in metadata:
                        trending = metadata['trending_topics']
                        if trending:
                            print(f"🔥 Top Trending Topic: {trending[0].get('topic', 'N/A')}")
                
            except Exception as e:
                print(f"❌ Error: {e}")


async def demo_agent_comparison():
    """Compare different agents on the same query"""
    print("\n" + "=" * 60)
    print("AGENT COMPARISON DEMO")
    print("=" * 60)
    
    # Load configuration
    load_dotenv()
    
    search_config = {
        "strategy": "parallel",
        "primary_api": "tavily",
        "apis": {
            "tavily": {
                "api_key": os.getenv("TAVILY_API_KEY", "demo_key"),
                "config": {"search_depth": "basic"}
            }
        }
    }
    
    # Create configuration manager
    config_manager = AgentConfigurationManager()
    
    # Test query
    test_query = "renewable energy solar panels"
    print(f"🔍 Testing all agents with query: '{test_query}'")
    print("-" * 60)
    
    agents = {
        "Research": (ResearchAgent, AgentType.RESEARCH),
        "Conversational": (ConversationalAgent, AgentType.CONVERSATIONAL),
        "Fact-Check": (FactCheckAgent, AgentType.FACT_CHECK),
        "News": (NewsAgent, AgentType.NEWS)
    }
    
    results = {}
    
    for agent_name, (agent_class, agent_type) in agents.items():
        print(f"\n🤖 {agent_name} Agent:")
        print("-" * 30)
        
        try:
            agent_config = config_manager.get_agent_config(agent_type)
            
            # Special handling for conversational agent
            if agent_name == "Conversational":
                memory = ConversationMemory()
                session_id = memory.create_session("comparison")
                async with agent_class(search_config, agent_config, memory) as agent:
                    agent.set_session_id(session_id)
                    response = await agent.process_query(test_query)
            else:
                async with agent_class(search_config, agent_config) as agent:
                    response = await agent.process_query(test_query)
            
            results[agent_name] = response
            
            print(f"✅ Completed")
            print(f"📊 Confidence: {response.confidence:.2f}")
            print(f"⏱️  Time: {response.processing_time:.2f}s")
            print(f"📚 Sources: {len(response.sources)}")
            
            # Brief summary
            summary = response.answer[:200] + "..." if len(response.answer) > 200 else response.answer
            print(f"📋 Summary: {summary}")
            
        except Exception as e:
            print(f"❌ Error: {e}")
    
    # Comparison summary
    print(f"\n📊 COMPARISON SUMMARY")
    print("=" * 30)
    
    for agent_name, response in results.items():
        print(f"{agent_name:12} | Confidence: {response.confidence:.2f} | Time: {response.processing_time:.2f}s | Sources: {len(response.sources)}")


async def demo_configuration_system():
    """Demonstrate the configuration system"""
    print("\n" + "=" * 60)
    print("CONFIGURATION SYSTEM DEMO")
    print("=" * 60)
    
    config_manager = AgentConfigurationManager()
    
    # List available personalities
    print("🎭 Available Personalities:")
    for personality_name in config_manager.list_personalities():
        personality = config_manager.get_personality(personality_name)
        print(f"  • {personality.name}: {personality.description}")
    
    print("\n⚙️  Agent Configurations:")
    for agent_type in [AgentType.RESEARCH, AgentType.CONVERSATIONAL, AgentType.FACT_CHECK, AgentType.NEWS]:
        summary = config_manager.get_config_summary(agent_type)
        print(f"\n🤖 {summary['agent_type'].title()} Agent:")
        print(f"  Personality: {summary['personality']['name']}")
        print(f"  Search Strategy: {summary['search_strategy']}")
        print(f"  Max Results: {summary['max_results']}")
        print(f"  Confidence Threshold: {summary['confidence_threshold']}")
        print(f"  Learning Enabled: {summary['learning_enabled']}")
    
    # Create custom personality
    print("\n🎨 Creating Custom Personality:")
    custom_personality = config_manager.create_custom_personality(
        name="Demo Custom",
        description="A custom personality for demonstration",
        tone="friendly",
        response_style=config_manager.ResponseStyle.CONVERSATIONAL,
        verbosity=0.7,
        helpfulness=0.9,
        creativity=0.6,
        formality=0.4
    )
    
    print(f"✅ Created: {custom_personality.name}")
    print(f"   Description: {custom_personality.description}")
    print(f"   Tone: {custom_personality.tone}")
    print(f"   Response Style: {custom_personality.response_style.value}")


async def main():
    """Run all agent demos"""
    print("🚀 AI Search Agent Collection Demo")
    print("=" * 60)
    print("This demo showcases the capabilities of different specialized agents.")
    print("Make sure to set your API keys in environment variables!\n")
    
    try:
        # Run individual agent demos
        await demo_configuration_system()
        await demo_research_agent()
        await demo_conversational_agent()
        await demo_fact_check_agent()
        await demo_news_agent()
        await demo_agent_comparison()
        
        print("\n" + "=" * 60)
        print("🎉 Demo completed successfully!")
        print("=" * 60)
        
    except KeyboardInterrupt:
        print("\n⏹️  Demo interrupted by user")
    except Exception as e:
        print(f"\n❌ Demo failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
