# Summary of Vite Migration Changes

## 1. Cherry-pick the Vite migration commit
- Executed `git cherry-pick -s 063a8e0efc946b319300c610a3fb44dde4433d31`
- Resolved all merge conflicts

## 2. Fix CommonJS scripts for ESM compatibility
- Renamed `.js` files to `.cjs` because `package.json` has `"type": "module"`:
  - `download-openapi.js` → `download-openapi.cjs`
  - `generate-version-info.js` → `generate-version-info.cjs`
  - `validate-translations.js` → `validate-translations.cjs`
  - `init-schema.js` → `init-schema.cjs`
  - `mcp-server.js` → `mcp-server.cjs`
  - `schema-indexer.js` → `schema-indexer.cjs`

## 3. Fix duplicate imports
- Removed duplicate `import eventBus from '@/eventBus'` lines in 15+ Vue files

## 4. Fix environment variables
- Changed all `process.env.VUE_APP_*` to `import.meta.env.VITE_*` in 20+ files
- Vite uses `import.meta.env` instead of `process.env`

## 5. Fix SCSS imports
- Removed `~` prefix from Bootstrap imports (Vite doesn't need it):
  - `~bootstrap/scss/...` → `bootstrap/scss/...`

## 6. Fix font imports
- Removed `~` prefix from font URLs in vendor SCSS files:
  - `url('~@/env/assets/fonts/...')` → `url('@/env/assets/fonts/...')`

## 7. Fix PowerIcon SVG
- Changed from `<img svg-inline>` (Webpack) to `v-html` with `?raw` import (Vite)
- Used non-scoped CSS with specific class names to style SVG content
- Added dynamic class binding to the SVG element

## 8. Fix const reassignment error
- Fixed `FirmwareFormUpdate.vue` where a `const` variable was being reassigned

## 9. Fix checkbox display issue
- Moved `v-if` from `<template>` slot to `<b-form-checkbox>` component in `FirmwareInventory.vue`
- This fixed reactivity issue when toggling "Show advanced"

## Result
- `npm install` works
- `npm run build` works
- `npm run dev` works
- Application runs correctly
