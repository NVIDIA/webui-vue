const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

class SchemaIndexer {
  constructor() {
    this.endpointIndex = new Map();
    this.tagIndex = new Map();
    this.componentIndex = new Map();
    this.searchIndex = new Map();
  }

  loadFromCache() {
    const cacheFile = path.join(__dirname, 'cache', 'schema-index.json');
    try {
      if (fs.existsSync(cacheFile)) {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        
        // Restore Maps from cached objects
        this.endpointIndex = new Map(Object.entries(cache.endpointIndex));
        this.tagIndex = new Map(Object.entries(cache.tagIndex).map(([k, v]) => [k, new Set(v)]));
        this.componentIndex = new Map(Object.entries(cache.componentIndex));
        this.searchIndex = new Map(Object.entries(cache.searchIndex).map(([k, v]) => [k, new Set(v)]));
        
        return true;
      }
    } catch (error) {
      console.error('Error loading schema cache:', error);
    }
    return false;
  }

  buildIndex(schemaPath) {
    try {
      const schema = yaml.load(fs.readFileSync(schemaPath, 'utf8'));
      
      // Index paths by categories
      Object.entries(schema.paths || {}).forEach(([path, pathData]) => {
        // Create searchable terms from the path
        const searchTerms = path.toLowerCase().split(/[^a-z0-9]+/);
        
        // Store path info with methods and descriptions
        const pathInfo = {
          path,
          methods: Object.keys(pathData),
          description: this._getPathDescription(pathData),
          tags: this._getPathTags(pathData)
        };

        // Index by each search term
        searchTerms.forEach(term => {
          if (term) {
            if (!this.searchIndex.has(term)) {
              this.searchIndex.set(term, new Set());
            }
            this.searchIndex.get(term).add(path);
          }
        });

        // Index by tags
        pathInfo.tags.forEach(tag => {
          if (!this.tagIndex.has(tag)) {
            this.tagIndex.set(tag, new Set());
          }
          this.tagIndex.get(tag).add(path);
        });

        // Store full path info
        this.endpointIndex.set(path, pathInfo);
      });

      // Index components/schemas for quick reference
      if (schema.components?.schemas) {
        Object.entries(schema.components.schemas).forEach(([name, schema]) => {
          this.componentIndex.set(name, {
            name,
            type: schema.type,
            properties: Object.keys(schema.properties || {})
          });
        });
      }

      return true;
    } catch (error) {
      console.error('Error building schema index:', error);
      return false;
    }
  }

  searchEndpoints(query) {
    const terms = query.toLowerCase().split(/\s+/);
    const results = new Set();

    terms.forEach(term => {
      // Search for exact matches first
      if (this.searchIndex.has(term)) {
        this.searchIndex.get(term).forEach(path => results.add(path));
      }
      
      // Then try partial matches
      this.searchIndex.forEach((paths, indexTerm) => {
        if (indexTerm.includes(term)) {
          paths.forEach(path => results.add(path));
        }
      });
    });

    // Return full endpoint info for matches
    return Array.from(results)
      .map(path => this.endpointIndex.get(path))
      .filter(Boolean);
  }

  getEndpointsByTag(tag) {
    const paths = this.tagIndex.get(tag);
    if (!paths) return [];
    
    return Array.from(paths)
      .map(path => this.endpointIndex.get(path))
      .filter(Boolean);
  }

  getEndpointDetails(path) {
    return this.endpointIndex.get(path);
  }

  _getPathDescription(pathData) {
    // Get description from first method that has one
    for (const method of Object.values(pathData)) {
      if (method.description) return method.description;
      if (method.summary) return method.summary;
    }
    return '';
  }

  _getPathTags(pathData) {
    // Collect unique tags from all methods
    const tags = new Set();
    Object.values(pathData).forEach(method => {
      (method.tags || []).forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }
}

module.exports = SchemaIndexer; 