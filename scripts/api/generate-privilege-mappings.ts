/**
 * Auto-generate PRIVILEGE_MAPPINGS in endpointPrivileges.ts from
 * PrivilegeRegistry.json.
 *
 * For each endpoint function that has privilege metadata, reads its
 * apiInstance<ReturnType> to get the actual Redfish schema type, then
 * looks that type up directly in the PrivilegeRegistry.  Only when
 * the return type isn't found in the registry does it fall back to
 * the metadata entity name.
 *
 * Usage:
 *   npx tsx scripts/api/generate-privilege-mappings.ts [endpointFile]
 *
 * If endpointFile is omitted the script tries redfish.dist.ts first,
 * then falls back to redfish.gen.ts.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REGISTRY_FILE = resolve(
  projectRoot,
  'src/api/registries/PrivilegeRegistry.json',
);
const PRIVILEGES_FILE = resolve(
  projectRoot,
  'src/api/privilege/endpointPrivileges.ts',
);
const GEN_FILE = resolve(
  projectRoot,
  'src/api/endpoints/redfish.gen.ts',
);
const DIST_FILE = resolve(
  projectRoot,
  'src/api/endpoints/redfish.dist.ts',
);

// Markers in endpointPrivileges.ts
const START_MARKER = '// --- GENERATED PRIVILEGE_MAPPINGS START ---';
const END_MARKER = '// --- GENERATED PRIVILEGE_MAPPINGS END ---';

// HTTP methods relevant to the UI (skip HEAD)
const UI_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;

// ---------------------------------------------------------------------------
// Types for PrivilegeRegistry.json
// ---------------------------------------------------------------------------

interface PrivilegeSet {
  Privilege: string[];
}

interface OperationMap {
  GET?: PrivilegeSet[];
  HEAD?: PrivilegeSet[];
  POST?: PrivilegeSet[];
  PATCH?: PrivilegeSet[];
  PUT?: PrivilegeSet[];
  DELETE?: PrivilegeSet[];
}

interface RegistryMapping {
  Entity: string;
  OperationMap: OperationMap;
}

interface PrivilegeRegistry {
  Mappings: RegistryMapping[];
}

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

/** Build a lookup from entity name -> OperationMap. */
function buildRegistryMap(
  registry: PrivilegeRegistry,
): Map<string, OperationMap> {
  const map = new Map<string, OperationMap>();
  for (const mapping of registry.Mappings) {
    map.set(mapping.Entity, mapping.OperationMap);
  }
  return map;
}

/**
 * Convert a registry OperationMap to the PRIVILEGE_MAPPINGS format:
 * { GET: [['Login']], PATCH: [['ConfigureComponents']], ... }
 *
 * Only includes UI-relevant methods (skip HEAD).
 */
function convertOperationMap(
  opMap: OperationMap,
): Record<string, string[][]> {
  const result: Record<string, string[][]> = {};

  for (const method of UI_METHODS) {
    const sets = opMap[method];
    if (!sets || sets.length === 0) continue;
    result[method] = sets.map((s) => s.Privilege);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Extract function-name -> return-type mapping from endpoint file
// ---------------------------------------------------------------------------

/**
 * Build a map from endpoint function name to its apiInstance<ReturnType>.
 *
 * Scans for patterns like:
 *   export const getSystems = (...) => {
 *       return apiInstance<ComputerSystemCollection>({
 *
 * Returns: { "getSystems": "ComputerSystemCollection", ... }
 */
function buildFunctionReturnTypeMap(content: string): Map<string, string> {
  const map = new Map<string, string>();

  // Find each endpoint function and its apiInstance<Type> call.
  // The function declaration and apiInstance call may be several lines apart.
  const fnPattern = /export const (\w+) = [^]*?apiInstance<([^>]+)>/g;
  // That greedy pattern is too expensive on huge files. Instead, split by
  // export boundaries and parse each block.

  // Split content into blocks starting at each "export const"
  const blocks = content.split(/(?=^export const )/m);

  for (const block of blocks) {
    // Get function name
    const nameMatch = block.match(/^export const (\w+)\s*=/);
    if (!nameMatch) continue;
    const fnName = nameMatch[1];

    // Only care about endpoint functions (get/post/patch/put/delete + UpperCase)
    if (!/^(get|post|patch|put|delete)[A-Z]/.test(fnName)) continue;

    // Skip query/mutation helper functions
    if (/QueryKey$|QueryOptions$|MutationOptions$/.test(fnName)) continue;

    // Find apiInstance<ReturnType> in this block
    const returnTypeMatch = block.match(/apiInstance<(\w+)/);
    if (returnTypeMatch) {
      map.set(fnName, returnTypeMatch[1]);
    }
  }

  return map;
}

/**
 * Extract metadata entity names and their associated function names from
 * the privilege metadata block at the bottom of the endpoint file.
 *
 * Returns: Map<functionName, metadataEntity>
 *   e.g. { "getSystems": "SystemsCollection", ... }
 */
function extractMetadataFunctions(
  content: string,
): Map<string, string> {
  const map = new Map<string, string>();
  const re =
    /Object\.defineProperty\((\w+),\s*'privilegeMetadata',[\s\S]*?entity:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    map.set(m[1], m[2]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Generate and write
// ---------------------------------------------------------------------------

export function generatePrivilegeMappings(endpointFile: string): void {
  if (!existsSync(REGISTRY_FILE)) {
    console.log(
      '  ⚠ PrivilegeRegistry.json not found, skipping privilege mappings',
    );
    return;
  }
  if (!existsSync(endpointFile)) {
    console.log(`  ⚠ Endpoint file not found: ${endpointFile}`);
    return;
  }
  if (!existsSync(PRIVILEGES_FILE)) {
    console.log(`  ⚠ endpointPrivileges.ts not found: ${PRIVILEGES_FILE}`);
    return;
  }

  // 1. Load the registry
  const registry: PrivilegeRegistry = JSON.parse(
    readFileSync(REGISTRY_FILE, 'utf-8'),
  );
  const registryMap = buildRegistryMap(registry);

  // 2. Read endpoint file
  const content = readFileSync(endpointFile, 'utf-8');

  // 3. Build function -> return type map from the endpoint source
  const returnTypes = buildFunctionReturnTypeMap(content);

  // 4. Extract function -> metadata entity from privilege metadata block
  const metadataFunctions = extractMetadataFunctions(content);

  console.log(
    `  Found ${metadataFunctions.size} endpoint functions with metadata`,
  );

  // 5. For each metadata function, resolve the registry entity:
  //    - Primary: use the apiInstance<ReturnType> (exact Redfish schema type)
  //    - Fallback: use the metadata entity name directly
  const mappings: Map<string, Record<string, string[][]>> = new Map();
  const unmatched: string[] = [];

  for (const [fnName, metadataEntity] of [...metadataFunctions].sort(
    (a, b) => a[1].localeCompare(b[1]),
  )) {
    // Already have a mapping for this metadata entity? Skip.
    if (mappings.has(metadataEntity)) continue;

    // Try the return type first (e.g. ComputerSystemCollection)
    const returnType = returnTypes.get(fnName);
    let registryEntity: string | null = null;

    if (returnType && registryMap.has(returnType)) {
      registryEntity = returnType;
    }
    // Fallback: try the metadata entity name directly
    if (!registryEntity && registryMap.has(metadataEntity)) {
      registryEntity = metadataEntity;
    }

    if (registryEntity) {
      const opMap = registryMap.get(registryEntity)!;
      const converted = convertOperationMap(opMap);
      if (Object.keys(converted).length > 0) {
        mappings.set(metadataEntity, converted);
      }
    } else {
      unmatched.push(
        `${metadataEntity} (fn: ${fnName}, returnType: ${returnType ?? 'unknown'})`,
      );
    }
  }

  console.log(
    `  Matched ${mappings.size} entities, ${unmatched.length} unmatched`,
  );
  if (unmatched.length > 0) {
    for (const e of unmatched) {
      console.log(`    ⚠ No registry match: ${e}`);
    }
  }

  // 6. Build the TypeScript source for PRIVILEGE_MAPPINGS
  const lines: string[] = [];
  lines.push(START_MARKER);
  lines.push(
    '// Auto-generated from PrivilegeRegistry.json by scripts/api/generate-privilege-mappings.ts',
  );
  lines.push(
    '// Do not edit manually -- run `npm run generate-api` or commit to regenerate.',
  );
  lines.push(
    'const PRIVILEGE_MAPPINGS: Record<string, Record<string, string[][]>> = {',
  );

  for (const [entity, methods] of mappings) {
    lines.push(`  ${entity}: {`);
    for (const [method, sets] of Object.entries(methods)) {
      const setsStr = sets
        .map((s) => `[${s.map((p) => `'${p}'`).join(', ')}]`)
        .join(', ');
      lines.push(`    ${method}: [${setsStr}],`);
    }
    lines.push('  },');
  }

  lines.push('};');
  lines.push(END_MARKER);

  const newBlock = lines.join('\n');

  // 7. Replace the block between markers in endpointPrivileges.ts
  const fileContent = readFileSync(PRIVILEGES_FILE, 'utf-8');
  const startIdx = fileContent.indexOf(START_MARKER);
  const endIdx = fileContent.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error(
      '  ✗ Could not find generation markers in endpointPrivileges.ts',
    );
    process.exit(1);
  }

  const updated =
    fileContent.slice(0, startIdx) +
    newBlock +
    fileContent.slice(endIdx + END_MARKER.length);

  writeFileSync(PRIVILEGES_FILE, updated, 'utf-8');
  console.log(`  ✓ Updated PRIVILEGE_MAPPINGS (${mappings.size} entities)`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (
  process.argv[1] &&
  resolve(process.argv[1]) ===
    resolve(__dirname, 'generate-privilege-mappings.ts')
) {
  const endpointFile =
    process.argv[2] ??
    (existsSync(DIST_FILE)
      ? DIST_FILE
      : existsSync(GEN_FILE)
        ? GEN_FILE
        : '');

  if (!endpointFile) {
    console.error(
      'No endpoint file found (neither redfish.gen.ts nor redfish.dist.ts)',
    );
    process.exit(1);
  }

  console.log('Generating privilege mappings...');
  console.log(`  Source: ${endpointFile}`);
  generatePrivilegeMappings(endpointFile);
  console.log('Done.');
}
