const path = require('path');
const fs = require('fs');

module.exports = {
  // Minimal configuration for webpack-dev-server
  mode: 'development',
  devServer: {
    port: 3333,
    // Setup middleware for the OpenAPI MCP functionality
    setupMiddlewares: (middlewares, devServer) => {
      if (!devServer) {
        throw new Error('webpack-dev-server is not defined');
      }

      // Path to the OpenAPI schema
      const openapiSchemaPath = path.join(__dirname, '..', 'src', 'api', 'schema', 'openapi.yaml');

      // MCP response for tool description
      devServer.app.get('/tools', (req, res) => {
        res.json({
          tools: [
            {
              name: "openapi_schema",
              description: "Access the OpenAPI schema for the API",
              parameters: {}
            }
          ]
        });
      });

      // Implement the openapi_schema tool
      devServer.app.post('/tools/openapi_schema', (req, res) => {
        try {
          const schema = fs.readFileSync(openapiSchemaPath, 'utf8');
          res.json({
            result: {
              content: schema,
              format: "yaml"
            }
          });
        } catch (error) {
          res.status(500).json({
            error: `Failed to read OpenAPI schema: ${error.message}`
          });
        }
      });

      // Health check endpoint
      devServer.app.get('/health', (req, res) => {
        res.status(200).send('OK');
      });

      console.log(`MCP OpenAPI server running on http://localhost:3333`);
      console.log(`Serving OpenAPI schema from ${openapiSchemaPath}`);

      return middlewares;
    },
    // Enable CORS
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization"
    }
  }
}; 