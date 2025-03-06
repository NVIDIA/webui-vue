# OpenAPI MCP Server

This is a Model Context Protocol (MCP) server that makes the project's OpenAPI schema available to Cursor's AI Agent. It runs as a standalone Express server, completely independent of the Vue development server.

## File Structure

- `mcp/mcp-server.js` - Standalone Express server implementation for MCP
- `mcp/public/index.html` - Web interface for exploring the OpenAPI schema
- `scripts/start_mcp_server.sh` - Script to start the MCP server in background
- `scripts/stop_mcp_server.sh` - Script to stop the MCP server
- `mcp/pid/` - Directory containing server PID and log files

## Setup

1. Start the MCP server (runs on port 3333):
   ```bash
   # Run in background (recommended)
   npm run mcp:start
   
   # Or run in foreground
   npm run mcp
   ```

2. Access the web interface at `http://localhost:3333`

3. Configure Cursor to use this MCP server:
   - Open Cursor settings
   - Navigate to "Features" > "MCP" in the settings sidebar
   - Click "+ Add New MCP Server"
   - Enter a name like "OpenAPI Schema"
   - Select "SSE" as the type
   - Enter the URL `http://localhost:3333/mcp`
   - Click "Save"

## Web Interface Features

The server provides a web interface for exploring the OpenAPI schema:

### Search Endpoints Tab
- **Keyword Search**: Search for endpoints using natural language queries
- **Path Pattern Filtering**: Filter endpoints using regular expressions
- **HTTP Method Filtering**: Filter by GET, POST, PUT, PATCH, DELETE methods
- **Result Limits**: Control the number of results displayed
- **Display Options**: 
  - Compact view: Shows only paths and methods
  - Detailed view: Includes descriptions, tags, and additional details
- **Example Queries**: Quick access to common search patterns

### View Schema Tab
- View the complete OpenAPI schema
- Toggle between YAML and JSON formats
- Formatted for easy reading

## Managing the Server

- Start the server in background: `npm run mcp:start`
- Stop the server: `npm run mcp:stop`
- View logs: `cat mcp/pid/mcp.log`
- Check if running: `cat mcp/pid/mcp.pid` (shows PID if running)

## Available Tools

The MCP server provides the following tools:

1. **openapi_schema**: Returns the full OpenAPI specification
   - Supports both YAML and JSON formats
   - Available via web interface or API endpoint

2. **search_endpoints**: Search API endpoints using natural language
   - Semantic search capabilities
   - Filtering by HTTP methods
   - Path pattern matching using regex
   - Available via web interface or API endpoint

## API Usage

### Endpoint Search
```bash
curl -X POST http://localhost:3333/tools/search_endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "query": "user management",
    "methods": ["GET", "POST"],
    "path_pattern": "AccountService",
    "limit": 10
  }'
```

### Schema Retrieval
```bash
# Get schema in JSON format
curl -X POST http://localhost:3333/tools/openapi_schema \
  -H "Content-Type: application/json" \
  -d '{"format": "json"}'

# Get schema in YAML format
curl -X POST http://localhost:3333/tools/openapi_schema \
  -H "Content-Type: application/json" \
  -d '{"format": "yaml"}'
```

## Development

The MCP server runs as a lightweight Express server on port 3333, completely independent of the Vue development server. This allows the MCP functionality to be available at all times, regardless of whether you're actively developing the web UI. When started with `npm run mcp:start`, it runs in the background and can be managed with the provided scripts. 