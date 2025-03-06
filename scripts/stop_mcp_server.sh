#!/bin/bash

if [ -f mcp/pid/mcp.pid ]; then
    PID=$(cat mcp/pid/mcp.pid)
    if ps -p $PID > /dev/null; then
        echo "Stopping MCP server (PID: $PID)..."
        kill $PID
        rm mcp/pid/mcp.pid
        echo "MCP server stopped"
    else
        echo "MCP server not running (stale PID file)"
        rm mcp/pid/mcp.pid
    fi
else
    echo "MCP server not running (no PID file found)"
fi 