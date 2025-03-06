#!/bin/bash

# Check if MCP server is already running
if [ -f mcp/pid/mcp.pid ] && ps -p $(cat mcp/pid/mcp.pid) > /dev/null; then
    echo "MCP server is already running (PID: $(cat mcp/pid/mcp.pid))"
    exit 0
fi

echo "Starting MCP server..."

# Create mcp/pid directory if it doesn't exist
mkdir -p mcp/pid

# Run the MCP server in background and save its PID
node mcp/mcp-server.js > mcp/pid/mcp.log 2>&1 & echo $! > mcp/pid/mcp.pid

echo "MCP server started in background (PID: $(cat mcp/pid/mcp.pid))"
echo "Logs available at: mcp/pid/mcp.log" 