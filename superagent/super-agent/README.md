# Super-Agent Orchestrator

A unified AI agent that orchestrates multiple MCP servers and external integrations to provide comprehensive task automation and intelligence capabilities.

## Features

### Core Capabilities

- **Natural Language Processing**: Understand and route user requests to appropriate tools
- **Task Orchestration**: Execute complex workflows with dependency management
- **Memory Management**: Persistent storage of tasks, results, and context
- **Multi-Service Integration**: Unified interface to diverse tools and services

### MCP Server Integrations

- **Filesystem**: File operations, directory management, search
- **Playwright**: Browser automation, web scraping, testing
- **Memory**: Persistent storage, retrieval, and search
- **Postman API**: API testing, collection management, monitoring
- **Snyk**: Security scanning, vulnerability assessment
- **Terraform**: Infrastructure provisioning and management

### External Service Integrations

- **ScraperAPI**: Advanced web scraping and data extraction
- **Apify**: Web automation and actor-based data collection
- **Anthropic AI**: Advanced reasoning and natural language understanding

## Architecture

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Chat API     │    │   Task API     │    │   Health API    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┬──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │   Super-Agent Orchestrator  │
                    └─────────────┬─────────────┘
                                 │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
    │ MCP Clients  │  │ External    │  │   Memory   │
    │             │  │ Integrations│  │ Management  │
    └─────────────┘  └─────────────┘  └─────────────┘
```

## Quick Start

### Prerequisites

- Python 3.13+
- MCP servers running (filesystem, playwright, memory, etc.)
- API keys for external services

### Installation

1. **Clone and setup environment**

```bash
cd C:\Users\Propaa\CascadeProjects\super-agent
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

2. **Configure environment**

```bash
# Copy and edit configuration
cp config/config.yaml.example config/config.yaml

# Set your API keys and service URLs
# Edit config/config.yaml with your actual values
```

3. **Start the API server**

```bash
python -m src.api.main
```

The API will be available at `http://localhost:8000`

### API Documentation

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

## API Endpoints

### Chat Interface

- `POST /api/v1/chat` - Process natural language requests
- `POST /api/v1/chat/stream` - Streaming responses
- `GET /api/v1/chat/history/{session_id}` - Get chat history
- `GET /api/v1/chat/sessions` - List chat sessions

### Task Management

- `POST /api/v1/tasks` - Create new task
- `GET /api/v1/tasks` - List tasks with pagination
- `GET /api/v1/tasks/{task_id}` - Get specific task
- `POST /api/v1/tasks/{task_id}/execute` - Execute task
- `POST /api/v1/workflows` - Create and execute workflow

### Health & Monitoring

- `GET /api/v1/health` - Basic health check
- `GET /api/v1/health/detailed` - Detailed service status
- `GET /api/v1/metrics` - System metrics

## Usage Examples

### Natural Language Requests

```bash
# File operations
curl -X POST "http://localhost:8000/api/v1/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Read the file config/settings.json"}'

# Web scraping
curl -X POST "http://localhost:8000/api/v1/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Scrape product information from https://example.com/product"}'

# API testing
curl -X POST "http://localhost:8000/api/v1/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Test the API endpoint https://api.example.com/users"}'

# Security scanning
curl -X POST "http://localhost:8000/api/v1/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Scan the current directory for security vulnerabilities"}'
```

### Task Creation

```bash
# Create a specific task
curl -X POST "http://localhost:8000/api/v1/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Scrape website content",
    "task_type": "web_scraping",
    "parameters": {
      "url": "https://example.com",
      "extract": "text"
    }
  }'
```

### Workflow Execution

```bash
# Create multi-step workflow
curl -X POST "http://localhost:8000/api/v1/workflows" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Website Analysis Workflow",
    "description": "Scrape and analyze website",
    "tasks": [
      {
        "description": "Scrape website content",
        "task_type": "web_scraping",
        "parameters": {"url": "https://example.com"}
      },
      {
        "description": "Analyze scraped content",
        "task_type": "general_query",
        "dependencies": ["task_1_id"]
      }
    ]
  }'
```

## Configuration

### Environment Variables

```bash
# API Configuration
export SUPER_AGENT_HOST=0.0.0.0
export SUPER_AGENT_PORT=8000

# Authentication
export SUPER_AGENT_SECRET_KEY=your-secret-key

# Service API Keys
export ANTHROPIC_API_KEY=your-anthropic-key
export SCRAPERAPI_KEY=your-scraperapi-key
export APIFY_TOKEN=your-apify-token
```

### Configuration File

See `config/config.yaml` for full configuration options including:

- MCP server URLs and settings
- External service API keys
- Memory and caching configuration
- Logging and monitoring settings
- Security and rate limiting

## Development

### Project Structure

```text
super-agent/
├── src/
│   ├── orchestrator/          # Core orchestration logic
│   │   ├── engine.py          # Main orchestrator
│   │   ├── router.py          # Task routing
│   │   └── memory.py          # Memory management
│   ├── mcp/clients/           # MCP server clients
│   ├── integrations/           # External service integrations
│   ├── api/                   # REST API layer
│   │   ├── routes/           # API endpoints
│   │   └── middleware/       # Auth, logging, etc.
│   └── utils/                 # Utility functions
├── config/                    # Configuration files
├── tests/                      # Test suite
├── docs/                       # Documentation
└── web/                        # Frontend interface
```

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test file
pytest tests/test_orchestrator.py
```

### Development Server

```bash
# Start with auto-reload
python -m src.api.main

# Or with uvicorn directly
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

## Deployment

### Docker Deployment

```bash
# Build image
docker build -t super-agent .

# Run container
docker run -p 8000:8000 --env-file .env super-agent
```

### Production Configuration
1. Set secure secret keys
2. Configure proper CORS origins
3. Set up reverse proxy (nginx/Apache)
4. Configure monitoring and logging
5. Set up SSL/TLS certificates

## Monitoring

### Health Checks
- Basic health: `/api/v1/health`
- Detailed health: `/api/v1/health/detailed`
- Service readiness: `/api/v1/health/ready`

### Metrics
- System metrics: `/api/v1/metrics`
- Task statistics: `/api/v1/tasks/statistics`
- Memory usage: `/api/v1/health/memory`

### Logging
- Application logs: `logs/super-agent.log`
- Request logs: Configurable via middleware
- Error tracking: Integrated with health checks

## Security

### Authentication
- JWT-based authentication
- API key support
- Permission-based access control

### Rate Limiting
- Requests per minute/hour/day limits
- Configurable per-endpoint limits
- Automatic throttling and blocking

### Security Headers
- XSS protection
- Content type options
- Frame options
- HSTS support

## Troubleshooting

### Common Issues

1. **MCP Server Connection Failed**
   - Check if MCP servers are running
   - Verify URLs in configuration
   - Check network connectivity

2. **API Key Authentication Failed**
   - Verify API keys in configuration
   - Check key permissions and quotas
   - Ensure proper header format

3. **Task Execution Timeout**
   - Increase timeout in configuration
   - Check service performance
   - Review task complexity

### Debug Mode

```bash
# Enable debug logging
export LOG_LEVEL=DEBUG

# Run with debug
python -m src.api.main --debug
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

## License

MIT License - see LICENSE file for details

## Support

- Documentation: `/docs`
- API Reference: `/docs` (Swagger UI)
- Issues: GitHub Issues
- Status: `/api/v1/health`
