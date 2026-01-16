/**
 * Post-processing script: strip the redundant ['redfish', 'v1'] prefix
 * from all Orval-generated Vue Query keys.
 *
 * Orval generates query keys from the full URL path, e.g.:
 *   /redfish/v1/AccountService → ['redfish', 'v1', 'AccountService']
 *
 * Since every API path starts with /redfish/v1, the first two segments are
 * wasted. This script strips them so keys become:
 *   ['AccountService']
 *
 * Patterns handled:
 *   return ['redfish', 'v1', ...rest] as const;  →  return [...rest] as const;
 *   return ['infinite', 'redfish', 'v1', ...rest] as const;  →  return ['infinite', ...rest] as const;
 *
 * Run as part of the generate-api pipeline, after Orval generates redfish.gen.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const targetFile =
  process.argv[2] ||
  path.join(process.cwd(), 'src/api/endpoints/redfish.gen.ts');

function stripQueryKeyPrefix(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    console.error(`  ✗ File not found: ${filePath}`);
    process.exit(1);
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  let replacements = 0;

  // Pattern 1: Infinite query keys
  //   ['infinite', 'redfish', 'v1', ...rest]  →  ['infinite', ...rest]
  //   ['infinite', 'redfish', 'v1']           →  ['infinite']
  content = content.replace(
    /\[\s*'infinite',\s*'redfish',\s*'v1',\s*/g,
    () => {
      replacements++;
      return "['infinite', ";
    },
  );
  content = content.replace(
    /\[\s*'infinite',\s*'redfish',\s*'v1'\s*\]/g,
    () => {
      replacements++;
      return "['infinite']";
    },
  );

  // Pattern 2: Regular query keys with content after prefix
  //   ['redfish', 'v1', ...rest]  →  [...rest]
  content = content.replace(
    /\[\s*'redfish',\s*'v1',\s*/g,
    () => {
      replacements++;
      return '[';
    },
  );

  // Pattern 3: Bare prefix only (service root edge case)
  //   ['redfish', 'v1']  →  []
  // This only occurs in getGetServiceRootQueryKey which is not imported
  // by any consumer code. The empty key is valid for TanStack Query.
  content = content.replace(
    /\[\s*'redfish',\s*'v1'\s*\]/g,
    () => {
      replacements++;
      return '[]';
    },
  );

  fs.writeFileSync(filePath, content);
  console.log(
    `  ✓ Stripped 'redfish','v1' prefix from ${replacements} query keys in ${path.basename(filePath)}`,
  );
}

stripQueryKeyPrefix(targetFile);
