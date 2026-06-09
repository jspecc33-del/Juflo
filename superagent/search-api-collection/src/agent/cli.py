"""
CLI Interface for AI Search Agent System

Provides command-line interface for interacting with search agents,
including interactive mode, batch processing, and configuration management.
"""

import asyncio
import sys
import os
import argparse
import json
from typing import Dict, List, Any, Optional
from dataclasses import asdict
import time
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn
    from rich.prompt import Prompt, Confirm
    from rich.markdown import Markdown
    from rich.syntax import Syntax
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    Console = None

from .base import AgentType, AgentConfig, QueryType
from .memory import ConversationMemory
from .intelligence import IntelligenceProcessor


class AgentCLI:
    """Command-line interface for AI search agents"""
    
    def __init__(self):
        self.console = Console() if RICH_AVAILABLE else None
        self.memory = ConversationMemory()
        self.current_session_id = None
        self.agent = None
        self.config = None
        
    def print(self, message: str, style: str = None):
        """Print message with optional styling"""
        if self.console:
            self.console.print(message, style=style)
        else:
            print(message)
    
    def print_error(self, message: str):
        """Print error message"""
        if self.console:
            self.console.print(f"❌ {message}", style="red")
        else:
            print(f"ERROR: {message}")
    
    def print_success(self, message: str):
        """Print success message"""
        if self.console:
            self.console.print(f"✅ {message}", style="green")
        else:
            print(f"SUCCESS: {message}")
    
    def print_info(self, message: str):
        """Print info message"""
        if self.console:
            self.console.print(f"ℹ️  {message}", style="blue")
        else:
            print(f"INFO: {message}")
    
    def display_response(self, response, show_sources: bool = True):
        """Display agent response in formatted way"""
        if self.console:
            # Display answer in a panel
            answer_panel = Panel(
                response.answer,
                title=f"Answer (Confidence: {response.confidence:.2f})",
                border_style="green" if response.confidence > 0.7 else "yellow"
            )
            self.console.print(answer_panel)
            
            # Display metadata
            if response.metadata:
                metadata_table = Table(title="Search Metadata")
                metadata_table.add_column("Property", style="cyan")
                metadata_table.add_column("Value", style="white")
                
                for key, value in response.metadata.items():
                    metadata_table.add_row(key.replace("_", " ").title(), str(value))
                
                self.console.print(metadata_table)
            
            # Display sources if requested
            if show_sources and response.sources:
                sources_table = Table(title="Sources")
                sources_table.add_column("#", style="cyan")
                sources_table.add_column("Title", style="white")
                sources_table.add_column("URL", style="blue")
                sources_table.add_column("Snippet", style="dim")
                
                for i, source in enumerate(response.sources[:5], 1):
                    snippet = source.snippet[:100] + "..." if len(source.snippet) > 100 else source.snippet
                    sources_table.add_row(str(i), source.title, source.url, snippet)
                
                self.console.print(sources_table)
        else:
            # Plain text fallback
            print(f"\n{'='*60}")
            print(f"ANSWER (Confidence: {response.confidence:.2f})")
            print(f"{'='*60}")
            print(response.answer)
            
            if response.metadata:
                print(f"\nMETADATA:")
                for key, value in response.metadata.items():
                    print(f"  {key}: {value}")
            
            if show_sources and response.sources:
                print(f"\nSOURCES:")
                for i, source in enumerate(response.sources[:5], 1):
                    print(f"  {i}. {source.title}")
                    print(f"     {source.url}")
                    print(f"     {source.snippet[:100]}...")
                    print()
    
    async def interactive_mode(self, agent_type: str = "conversational"):
        """Run interactive mode"""
        self.print_info("Starting interactive mode...")
        self.print_info(f"Agent type: {agent_type}")
        
        # Create session
        self.current_session_id = self.memory.create_session(agent_type)
        
        # Initialize agent
        try:
            self.agent = await self._create_agent(agent_type)
            self.print_success("Agent initialized successfully")
        except Exception as e:
            self.print_error(f"Failed to initialize agent: {e}")
            return
        
        self.print_info("Type 'help' for commands, 'quit' to exit")
        print("-" * 60)
        
        while True:
            try:
                # Get user input
                query = Prompt.ask("\n[bold green]You[/bold green]") if self.console else input("\nYou: ")
                
                if not query.strip():
                    continue
                
                # Handle commands
                if query.lower() in ['quit', 'exit', 'q']:
                    self.print_info("Goodbye!")
                    break
                
                if query.lower() == 'help':
                    self._show_help()
                    continue
                
                if query.lower() == 'stats':
                    self._show_stats()
                    continue
                
                if query.lower() == 'history':
                    self._show_history()
                    continue
                
                if query.lower() == 'clear':
                    self.memory.clear_history()
                    self.print_success("History cleared")
                    continue
                
                if query.lower().startswith('set '):
                    self._handle_set_command(query[4:])
                    continue
                
                # Process query with progress indicator
                if self.console:
                    with Progress(
                        SpinnerColumn(),
                        TextColumn("[progress.description]{task.description}"),
                        console=self.console
                    ) as progress:
                        task = progress.add_task("Searching...", total=None)
                        response = await self.agent.process_query(query)
                        progress.update(task, description="Done!")
                else:
                    print("Searching...")
                    response = await self.agent.process_query(query)
                
                # Display response
                self.display_response(response)
                
                # Add to memory
                self.memory.add_conversation_turn(self.current_session_id, query, response)
                
                # Ask for feedback (optional)
                if self.console and Confirm.ask("Rate this response?"):
                    satisfaction = Prompt.ask("Satisfaction (0-1)", default="0.8")
                    try:
                        satisfaction_val = float(satisfaction)
                        self.memory.learn_from_feedback(
                            self.current_session_id, 
                            len(self.memory.conversations[self.current_session_id]),
                            satisfaction_val
                        )
                        self.print_success("Thank you for your feedback!")
                    except ValueError:
                        self.print_error("Invalid satisfaction value")
                
            except KeyboardInterrupt:
                self.print_info("\nInterrupted. Type 'quit' to exit.")
            except Exception as e:
                self.print_error(f"Error processing query: {e}")
    
    async def batch_mode(self, queries: List[str], agent_type: str, output_file: Optional[str] = None):
        """Run batch mode with multiple queries"""
        self.print_info(f"Processing {len(queries)} queries in batch mode...")
        
        # Initialize agent
        try:
            self.agent = await self._create_agent(agent_type)
        except Exception as e:
            self.print_error(f"Failed to initialize agent: {e}")
            return
        
        results = []
        
        for i, query in enumerate(queries, 1):
            self.print_info(f"Processing query {i}/{len(queries)}: {query}")
            
            try:
                response = await self.agent.process_query(query)
                results.append({
                    "query": query,
                    "answer": response.answer,
                    "confidence": response.confidence,
                    "sources": [{"title": s.title, "url": s.url} for s in response.sources],
                    "processing_time": response.processing_time
                })
                
                self.print_success(f"Query {i} completed")
                
            except Exception as e:
                self.print_error(f"Error processing query {i}: {e}")
                results.append({
                    "query": query,
                    "error": str(e)
                })
        
        # Save results if output file specified
        if output_file:
            try:
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(results, f, indent=2, ensure_ascii=False)
                self.print_success(f"Results saved to {output_file}")
            except Exception as e:
                self.print_error(f"Failed to save results: {e}")
        else:
            # Print results to console
            for result in results:
                print(f"\n{'='*60}")
                print(f"Query: {result['query']}")
                print(f"{'='*60}")
                if 'error' in result:
                    print(f"ERROR: {result['error']}")
                else:
                    print(f"Answer: {result['answer']}")
                    print(f"Confidence: {result['confidence']:.2f}")
                    print(f"Processing Time: {result['processing_time']:.2f}s")
    
    async def config_mode(self, action: str, args: Dict[str, Any]):
        """Handle configuration operations"""
        if action == 'show':
            self._show_config()
        elif action == 'set':
            self._set_config(args)
        elif action == 'reset':
            self._reset_config()
        else:
            self.print_error(f"Unknown config action: {action}")
    
    def _show_help(self):
        """Show help information"""
        help_text = """
Available Commands:
  help              - Show this help message
  stats             - Show session statistics
  history           - Show conversation history
  clear             - Clear conversation history
  set <key> <value> - Set configuration value
  quit/exit/q       - Exit interactive mode

Configuration Options:
  response_style    - concise, detailed, academic
  max_results       - Maximum number of search results
  confidence_threshold - Minimum confidence for answers
        """
        if self.console:
            help_panel = Panel(help_text.strip(), title="Help", border_style="blue")
            self.console.print(help_panel)
        else:
            print(help_text)
    
    def _show_stats(self):
        """Show session statistics"""
        if not self.current_session_id:
            self.print_error("No active session")
            return
        
        stats = self.memory.get_session_summary(self.current_session_id)
        agent_stats = self.agent.get_stats() if self.agent else {}
        
        if self.console:
            stats_table = Table(title="Session Statistics")
            stats_table.add_column("Metric", style="cyan")
            stats_table.add_column("Value", style="white")
            
            stats_table.add_row("Session ID", stats["session_id"])
            stats_table.add_row("Session Type", stats["session_type"])
            stats_table.add_row("Duration", f"{stats['duration']:.2f}s")
            stats_table.add_row("Total Queries", str(stats["total_queries"]))
            stats_table.add_row("Avg Confidence", f"{stats['avg_confidence']:.2f}")
            stats_table.add_row("Avg Processing Time", f"{stats['avg_processing_time']:.2f}s")
            
            self.console.print(stats_table)
            
            if agent_stats:
                agent_table = Table(title="Agent Statistics")
                agent_table.add_column("Metric", style="cyan")
                agent_table.add_column("Value", style="white")
                
                for key, value in agent_stats.items():
                    agent_table.add_row(key.replace("_", " ").title(), str(value))
                
                self.console.print(agent_table)
        else:
            print(f"\nSession Statistics:")
            print(f"  Session ID: {stats['session_id']}")
            print(f"  Session Type: {stats['session_type']}")
            print(f"  Duration: {stats['duration']:.2f}s")
            print(f"  Total Queries: {stats['total_queries']}")
            print(f"  Avg Confidence: {stats['avg_confidence']:.2f}")
            print(f"  Avg Processing Time: {stats['avg_processing_time']:.2f}s")
            
            if agent_stats:
                print(f"\nAgent Statistics:")
                for key, value in agent_stats.items():
                    print(f"  {key}: {value}")
    
    def _show_history(self):
        """Show conversation history"""
        if not self.current_session_id:
            self.print_error("No active session")
            return
        
        context = self.memory.get_conversation_context(self.current_session_id, 10)
        
        if not context:
            self.print_info("No conversation history")
            return
        
        if self.console:
            history_panel = Panel("\n".join(context), title="Conversation History", border_style="yellow")
            self.console.print(history_panel)
        else:
            print(f"\nConversation History:")
            print("-" * 40)
            for line in context:
                print(line)
    
    def _handle_set_command(self, command: str):
        """Handle set command"""
        parts = command.split(maxsplit=1)
        if len(parts) != 2:
            self.print_error("Usage: set <key> <value>")
            return
        
        key, value = parts
        self.memory.update_preferences(**{key: value})
        self.print_success(f"Set {key} = {value}")
    
    def _show_config(self):
        """Show current configuration"""
        preferences = self.memory.preferences
        
        if self.console:
            config_table = Table(title="Current Configuration")
            config_table.add_column("Setting", style="cyan")
            config_table.add_column("Value", style="white")
            
            for field, value in asdict(preferences).items():
                config_table.add_row(field.replace("_", " ").title(), str(value))
            
            self.console.print(config_table)
        else:
            print(f"\nCurrent Configuration:")
            for field, value in asdict(preferences).items():
                print(f"  {field}: {value}")
    
    def _set_config(self, args: Dict[str, Any]):
        """Set configuration values"""
        self.memory.update_preferences(**args)
        self.print_success("Configuration updated")
    
    def _reset_config(self):
        """Reset configuration to defaults"""
        self.memory.preferences = UserPreferences()
        self.print_success("Configuration reset to defaults")
    
    async def _create_agent(self, agent_type: str):
        """Create agent instance"""
        # Load configuration
        config = self._load_config()
        
        # Create agent config
        agent_config = AgentConfig(
            agent_type=AgentType(agent_type),
            personality=self.memory.preferences.preferred_response_style,
            response_style=self.memory.preferences.preferred_response_style,
            max_results=self.memory.preferences.preferred_sources or 10,
            search_strategy=self.memory.preferences.preferred_search_strategy,
            confidence_threshold=self.memory.preferences.confidence_threshold
        )
        
        # Import and create agent
        if agent_type == "research":
            from .research_agent import ResearchAgent
            return ResearchAgent(config, agent_config)
        elif agent_type == "conversational":
            from .conversational_agent import ConversationalAgent
            return ConversationalAgent(config, agent_config, self.memory)
        elif agent_type == "fact_check":
            from .factcheck_agent import FactCheckAgent
            return FactCheckAgent(config, agent_config)
        elif agent_type == "news":
            from .news_agent import NewsAgent
            return NewsAgent(config, agent_config)
        else:
            from .base import BaseAgent
            # Create a basic agent for testing
            class BasicAgent(BaseAgent):
                async def _synthesize_answer(self, query, search_results, query_type):
                    processor = IntelligenceProcessor()
                    return await processor.synthesize_answer(query, search_results, query_type, self.agent_config.response_style)
            
            return BasicAgent(config, agent_config)
    
    def _load_config(self) -> Dict[str, Any]:
        """Load search configuration"""
        # Try to load from environment variables first
        config = {
            "strategy": os.getenv("SEARCH_STRATEGY", "fallback"),
            "primary_api": os.getenv("PRIMARY_API", "tavily"),
            "apis": {}
        }
        
        # Load API keys
        api_keys = {
            "tavily": os.getenv("TAVILY_API_KEY"),
            "brave": os.getenv("BRAVE_API_KEY"),
            "serpapi": os.getenv("SERPAPI_KEY"),
            "scraperapi": os.getenv("SCRAPERAPI_KEY")
        }
        
        for api, key in api_keys.items():
            if key:
                config["apis"][api] = {
                    "api_key": key,
                    "config": {}
                }
        
        return config


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(description="AI Search Agent CLI")
    parser.add_argument("--mode", choices=["interactive", "batch", "config"], default="interactive",
                       help="Operation mode")
    parser.add_argument("--agent", choices=["conversational", "research", "fact_check", "news"],
                       default="conversational", help="Agent type")
    parser.add_argument("--queries", nargs="+", help="Queries for batch mode")
    parser.add_argument("--output", help="Output file for batch mode")
    parser.add_argument("--config-action", choices=["show", "set", "reset"], help="Configuration action")
    parser.add_argument("--config-key", help="Configuration key (for set action)")
    parser.add_argument("--config-value", help="Configuration value (for set action)")
    
    args = parser.parse_args()
    
    cli = AgentCLI()
    
    async def run():
        if args.mode == "interactive":
            await cli.interactive_mode(args.agent)
        elif args.mode == "batch":
            if not args.queries:
                cli.print_error("Queries required for batch mode")
                return
            await cli.batch_mode(args.queries, args.agent, args.output)
        elif args.mode == "config":
            config_args = {}
            if args.config_action == "set":
                if not args.config_key or not args.config_value:
                    cli.print_error("Key and value required for set action")
                    return
                config_args[args.config_key] = args.config_value
            await cli.config_mode(args.config_action, config_args)
    
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        cli.print_info("\nInterrupted by user")
    except Exception as e:
        cli.print_error(f"Unexpected error: {e}")


if __name__ == "__main__":
    main()
