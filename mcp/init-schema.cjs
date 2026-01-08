const fs = require('fs');
const path = require('path');
const SchemaIndexer = require('./schema-indexer.cjs');

// Path to store the cached index
const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'schema-index.json');
const SCHEMA_PATH = path.join(__dirname, '..', 'src', 'api', 'schema', 'openapi.yaml');

console.log('Initializing schema index...');

// Create cache directory if it doesn't exist
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Initialize indexer
const indexer = new SchemaIndexer();

// Build the index
if (indexer.buildIndex(SCHEMA_PATH)) {
  // Convert Maps to serializable objects
  const cache = {
    endpointIndex: Object.fromEntries(indexer.endpointIndex),
    tagIndex: Object.fromEntries([...indexer.tagIndex].map(([k, v]) => [k, Array.from(v)])),
    componentIndex: Object.fromEntries(indexer.componentIndex),
    searchIndex: Object.fromEntries([...indexer.searchIndex].map(([k, v]) => [k, Array.from(v)]))
  };

  // Save to cache file
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log(`Schema index built and cached at ${CACHE_FILE}`);
} else {
  console.error('Failed to build schema index');
  process.exit(1);
} 