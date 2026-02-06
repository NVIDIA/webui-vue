/**
 * Build-Time Privilege Metadata Transformer
 *
 * Post-processes generated endpoint files to attach privilege metadata
 * to each endpoint function. Reads the apiInstance<ReturnType> from each
 * function to determine the Redfish schema entity, and the function name
 * prefix (get/post/patch/put/delete) for the HTTP method.
 *
 * Run as part of the API generation pipeline after Orval generates code.
 *
 * Usage: npx tsx src/api/transformer/add-privilege-metadata.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../../..');

// Paths
const ENDPOINTS_FILE = resolve(
  projectRoot,
  'src/api/endpoints/redfish.gen.ts',
);
const DIST_ENDPOINTS_FILE = resolve(
  projectRoot,
  'src/api/endpoints/redfish.dist.ts',
);

// HTTP method prefixes used by Orval-generated function names
const METHOD_PREFIXES: Record<string, string> = {
  get: 'GET',
  post: 'POST',
  patch: 'PATCH',
  put: 'PUT',
  delete: 'DELETE',
};

/**
 * Extract the HTTP method from a function name prefix.
 * e.g. "getUpdateService" -> "GET", "patchAccountService" -> "PATCH"
 */
function extractMethod(fnName: string): string | null {
  for (const [prefix, method] of Object.entries(METHOD_PREFIXES)) {
    if (fnName.startsWith(prefix) && fnName[prefix.length]?.match(/[A-Z]/)) {
      return method;
    }
  }
  return null;
}

/**
 * Remove any previously generated privilege metadata block.
 */
function stripPrivilegeMetadata(content: string): string {
  const startMarker =
    '// ========== Privilege Metadata (auto-generated) ==========';
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) return content;

  // Drop everything from the marker to the end of the file.
  return content.slice(0, startIndex).trimEnd() + '\n';
}

/**
 * Add privilege metadata to exported endpoint functions.
 *
 * For each endpoint function (get, post, patch, put, delete), reads its
 * apiInstance return type to determine the Redfish entity name.
 *
 * Appends Object.defineProperty calls at the end of the file.
 */
function addPrivilegeMetadata(content: string): string {
  // Split into blocks at each "export const" boundary so we can associate
  // each function with its body (including the apiInstance<Type> call).
  const blocks = content.split(/(?=^export const )/m);

  const functions: Array<{ name: string; entity: string; method: string }> = [];

  for (const block of blocks) {
    // Get function name
    const nameMatch = block.match(/^export const (\w+)\s*=/);
    if (!nameMatch) continue;
    const fnName = nameMatch[1];

    // Only process endpoint functions, skip helpers
    const method = extractMethod(fnName);
    if (!method) continue;
    if (/QueryKey$|QueryOptions$|MutationOptions$/.test(fnName)) continue;

    // Extract apiInstance<ReturnType> from the function body.
    // Handle union types like "AccountService | Task | void" by taking the first type.
    const returnTypeMatch = block.match(/apiInstance<(\w+)/);
    if (!returnTypeMatch) continue;

    const entity = returnTypeMatch[1];

    // Skip generic/void return types that aren't real Redfish entities
    if (entity === 'void' || entity === 'unknown') continue;

    functions.push({ name: fnName, entity, method });
  }

  if (functions.length === 0) return content;

  // Append metadata block
  const output = [content.trimEnd()];
  output.push('');
  output.push(
    '// ========== Privilege Metadata (auto-generated) ==========',
  );
  output.push('// This metadata enables runtime privilege checking.');
  output.push('// Entity names are derived from apiInstance<ReturnType>.');
  output.push('');

  for (const { name, entity, method } of functions) {
    output.push(
      `Object.defineProperty(${name}, 'privilegeMetadata', { value: { entity: '${entity}', method: '${method}' }, writable: false });`,
    );
  }

  return output.join('\n');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('Adding privilege metadata to endpoint functions...');

  // Process redfish.gen.ts
  if (existsSync(ENDPOINTS_FILE)) {
    console.log(`  Processing: ${ENDPOINTS_FILE}`);
    const content = readFileSync(ENDPOINTS_FILE, 'utf-8');

    const stripped = stripPrivilegeMetadata(content);
    const updated = addPrivilegeMetadata(stripped);
    writeFileSync(ENDPOINTS_FILE, updated, 'utf-8');
    console.log('  ✓ Added privilege metadata to redfish.gen.ts');
  } else {
    console.log(`  ⚠ File not found: ${ENDPOINTS_FILE}`);
  }

  // Process redfish.dist.ts if it exists
  if (existsSync(DIST_ENDPOINTS_FILE)) {
    console.log(`  Processing: ${DIST_ENDPOINTS_FILE}`);
    const content = readFileSync(DIST_ENDPOINTS_FILE, 'utf-8');

    const stripped = stripPrivilegeMetadata(content);
    const updated = addPrivilegeMetadata(stripped);
    writeFileSync(DIST_ENDPOINTS_FILE, updated, 'utf-8');
    console.log('  ✓ Added privilege metadata to redfish.dist.ts');
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Error adding privilege metadata:', err);
  process.exit(1);
});
