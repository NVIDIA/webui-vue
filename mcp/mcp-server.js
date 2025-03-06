const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const SchemaIndexer = require('./schema-indexer');
const yaml = require('js-yaml');

const app = express();
const PORT = 3333;

// Enable CORS
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Path to the OpenAPI schema
const openapiSchemaPath = path.join(__dirname, '..', 'src', 'api', 'schema', 'openapi.yaml');

// Initialize schema indexer
const schemaIndexer = new SchemaIndexer();
console.log('Building schema index...');
if (schemaIndexer.buildIndex(openapiSchemaPath)) {
  console.log('Schema index built successfully');
} else {
  console.error('Failed to build schema index');
  process.exit(1);
}

// SSE endpoint for Cursor MCP
app.get('/mcp', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send an initial message
  res.write('event: ready\ndata: {}\n\n');

  // Keep the connection alive
  const keepAlive = setInterval(() => {
    res.write('event: ping\ndata: {}\n\n');
  }, 30000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

// MCP response for tool description
app.get('/tools', (req, res) => {
  res.json({
    tools: [
      {
        name: "openapi_schema",
        description: "Access the OpenAPI schema for the API",
        parameters: {}
      },
      {
        name: "search_endpoints",
        description: "Search for API endpoints using keywords",
        parameters: {
          query: {
            type: "string",
            description: "Search query (e.g., 'user management', 'accounts', etc.)"
          }
        }
      }
    ]
  });
});

// Implement the openapi_schema tool
app.post('/tools/openapi_schema', (req, res) => {
  try {
    const schema = fs.readFileSync(openapiSchemaPath, 'utf8');
    const { format = 'yaml' } = req.body;
    
    if (format === 'json') {
      // Parse YAML and return as formatted JSON
      const jsonSchema = yaml.load(schema);
      res.json({
        result: {
          content: JSON.stringify(jsonSchema, null, 2),
          format: 'json'
        }
      });
    } else {
      // Return formatted YAML
      res.json({
        result: {
          content: schema,
          format: 'yaml'
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      error: `Failed to read OpenAPI schema: ${error.message}`
    });
  }
});

// Implement the search_endpoints tool
app.post('/tools/search_endpoints', (req, res) => {
  const { query, methods = [], limit = 50, path_pattern = '' } = req.body;
  if (!query) {
    return res.status(400).json({
      error: "Query parameter is required"
    });
  }

  let results = schemaIndexer.searchEndpoints(query);
  
  // Filter by methods if specified
  if (methods.length > 0) {
    results = results.filter(endpoint => 
      endpoint.methods.some(m => methods.includes(m.toUpperCase()))
    );
  }

  // Filter by path pattern if specified
  if (path_pattern) {
    const pattern = new RegExp(path_pattern, 'i');
    results = results.filter(endpoint => pattern.test(endpoint.path));
  }

  // Apply limit if specified and not 0 (0 means no limit)
  if (limit > 0) {
    results = results.slice(0, limit);
  }

  // Format results for better readability
  const formattedResults = results.map(endpoint => ({
    path: endpoint.path,
    methods: endpoint.methods.sort(),
    description: endpoint.description || '',
    tags: endpoint.tags || [],
    details: schemaIndexer.getEndpointDetails(endpoint.path)
  }));

  res.json({
    result: {
      endpoints: formattedResults,
      count: formattedResults.length,
      query: {
        search: query,
        methods: methods,
        path_pattern: path_pattern,
        limit: limit
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Serve the HTML page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MCP OpenAPI server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('- GET  /mcp (SSE connection)');
  console.log('- GET  /tools');
  console.log('- POST /tools/openapi_schema');
  console.log('- POST /tools/search_endpoints');
  console.log('- GET  /health');
}); 