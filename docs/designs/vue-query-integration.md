# Vue Query Integration for webui-vue

Author: Jason Westover (Discord: jasonwestover)

Created: February 8, 2026

## Problem Description

The webui-vue project currently manages server state through 36+ Vuex store
modules that each manually fetch, cache, and synchronize Redfish data.  This
approach duplicates caching logic across every store, provides no automatic
cache invalidation when the BMC pushes SSE events, and forces the UI to
poll or manually refetch after mutations.  The project needs a structured
migration to Vue Query (TanStack Query) for server-state management so that
Redfish data is fetched once, cached with deterministic keys, and
automatically refreshed when SSE events signal resource changes.

## Background and References

- [TanStack Query for Vue](https://tanstack.com/query/latest/docs/vue/overview)
  provides declarative data fetching with built-in caching, background
  refetching, and cache invalidation via query keys.
- [Orval](https://orval.dev/) can optionally generate type-safe Vue Query
  composables from OpenAPI specifications, producing deterministic query
  keys tied to Redfish resource URIs.  Orval is not yet in the core project;
  the query key convention and caching architecture work equally well with
  hand-written Vue Query hooks.
- [Redfish DSP0266 - Redfish Specification](https://www.dmtf.org/dsp/DSP0266)
  defines the Server-Sent Events (SSE) mechanism used for real-time event
  delivery.
- [Pinia](https://pinia.vuejs.org/) is the recommended Vue 3 state manager,
  used here exclusively for client-side state (UI preferences, session
  info, derived computations over server data).
- The existing Vuex store lives in `src/store/modules/` (36+ modules).  The
  new Pinia stores live in `src/stores/`.

## Requirements

1. All Redfish resource reads MUST participate in the Vue Query cache so
   that SSE-driven invalidation can trigger automatic re-fetches.

2. Query keys MUST follow a deterministic, path-based convention derived
   from the Redfish URI so that the SSE invalidation engine can match
   `OriginOfCondition` URIs to cached queries.

3. Vuex stores MUST be migrated incrementally; each migrated page/feature
   replaces its Vuex store with either a Vue Query hook (ideally
   Orval-generated, but hand-written is fine), a composable from
   `src/api/composables/`, or a focused Pinia store that wraps Vue
   Query for client-derived state.

4. Redfish types and property names MUST use PascalCase Redfish names
   directly.  Do not create intermediate UI-layer interfaces when the
   view component can use the Redfish model types directly (e.g. from
   `src/api/model/` when Orval-generated models are available, or
   from hand-written type definitions that mirror the Redfish schema).

5. The solution MUST work across BMC implementations with varying levels
   of OData query support ($expand, $select, $filter).

## Proposed Design

### Architecture Overview

```
 ┌──────────────────────────────────────────────────────────────┐
 │                     Vue Components                          │
 │                                                              │
 │  useGetManagersById()    useRedfishCollection()              │
 │  useAllSubResources()    useEventLog()                       │
 │  useGlobalStore()        useFirmwareStore()                  │
 └──────────┬────────────────────┬──────────────────────────────┘
            │                    │
            ▼                    ▼
 ┌──────────────────┐  ┌────────────────────┐
 │  Vue Query Hooks │  │  Vue Query         │
 │  (generated or   │  │  Composables       │
 │   hand-written)  │  │  (useRedfishColl., │
 │  useGetSystems() │  │   useEventLog, …)  │
 └────────┬─────────┘  └────────┬───────────┘
          │                     │
          ▼                     ▼
 ┌──────────────────────────────────────────┐
 │           Vue Query Cache                │
 │                                          │
 │  ['Systems']                             │
 │  ['Systems', 'system0']                  │
 │  ['Chassis', 'BMC_0', 'Sensors']         │
 │  ['TaskService', 'Tasks', '42']          │
 │  ['redfish-collection', path, params]    │
 └──────────────────┬───────────────────────┘
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
 ┌─────────────────┐  ┌────────────────────┐
 │  Axios Instance  │  │  SSE EventSource   │
 │  + ETag Cache    │  │                    │
 │  + Response      │  │  useSSEQuery       │
 │    Interceptor   │  │  Invalidation()    │
 └─────────────────┘  └────────────────────┘
```

### Query Key Convention

Query keys mirror the Redfish URI path with the `/redfish/v1/` prefix
stripped.  Each remaining path segment becomes an element in the key array.

| Redfish URI                                      | Query Key                                    |
|--------------------------------------------------|----------------------------------------------|
| `/redfish/v1/Systems`                            | `['Systems']`                                |
| `/redfish/v1/Systems/system0`                    | `['Systems', 'system0']`                     |
| `/redfish/v1/Chassis/BMC_0/Sensors/temp1`        | `['Chassis', 'BMC_0', 'Sensors', 'temp1']`   |
| `/redfish/v1/TaskService/Tasks`                  | `['TaskService', 'Tasks']`                   |
| `/redfish/v1/AccountService`                     | `['AccountService']`                         |
| `/redfish/v1`  (ServiceRoot)                     | `[]`  (exact match only)                     |

This convention preserves TanStack Query's hierarchical prefix matching:
invalidating `['Systems']` automatically invalidates all child queries
such as `['Systems', 'system0']`.  For the rare case where the entire
cache needs to be flushed (e.g. an SSE `EventBufferExceeded` event),
`queryClient.invalidateQueries()` with no arguments achieves that
without relying on a shared prefix.

When Orval is used, a post-generation script
(`scripts/api/strip-query-key-prefix.ts`) strips the redundant
`['redfish', 'v1']` prefix from the raw Orval output to produce
these keys automatically.  Hand-written hooks should follow the same
convention directly.

#### Custom Query Key Namespaces

Composables that aggregate or transform Redfish data beyond a single
resource use their own namespace prefix to avoid collisions with the
path-based keys:

| Composable              | Key Format                                           | Purpose                            |
|-------------------------|------------------------------------------------------|------------------------------------|
| `useRedfishCollection`  | `['redfish-collection', path, normalizedParams]`     | Generic collection with $expand    |
| `useAllSubResources`    | `['allSubResources', path, subResource]`              | Cross-collection aggregation       |
| `useHealthMetrics`      | `['redfish', 'MetricReport', uri]`                   | Individual MetricReport fetch      |
| `useFirmwareInventory`  | `['firmware', 'activeBmc']`                          | Active BMC firmware tracking       |
| `useRedfishRoot`        | `['ServiceRoot']`                                    | ServiceRoot with manual key        |

**`useRedfishCollection` examples:**

| Call                                                                     | Query Key                                                                       |
|--------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `useRedfishCollection('/redfish/v1/Chassis/BMC_0/Sensors')`              | `['redfish-collection', '/redfish/v1/Chassis/BMC_0/Sensors', undefined]`        |
| `useRedfishCollection('/redfish/v1/Systems', { $select: 'PowerState' })` | `['redfish-collection', '/redfish/v1/Systems', { $select: 'PowerState', ... }]` |

**`useAllSubResources` examples:**

| Call                                                    | Query Key                                                          |
|---------------------------------------------------------|--------------------------------------------------------------------|
| `useAllSubResources('/redfish/v1/Chassis', 'Sensors')`  | `['allSubResources', '/redfish/v1/Chassis', 'Sensors']` |
| `useAllSubResources('/redfish/v1/Chassis', 'Power')`    | `['allSubResources', '/redfish/v1/Chassis', 'Power']`   |

Note that these custom-namespace keys embed the **full URI** (including
`/redfish/v1/`) as a single string element rather than splitting it
into path segments.  This is intentional — these queries are only
invalidated explicitly, not via SSE prefix matching on path-based keys.

### Dual Cache Population

Every Redfish GET request populates the Vue Query cache through two
independent paths, ensuring that both Vue Query hooks and raw
`apiInstance` calls produce queryable cache entries:

1. **Vue Query hooks** (`useGetSystems()`, etc. — whether generated by
   Orval or hand-written) register queries directly with Vue Query
   using the path-based key.

2. **Axios response interceptor** (`src/api/mutator/axios-instance.ts`)
   intercepts every successful `GET /redfish/*` response and calls
   `queryClient.setQueryData(deriveQueryKey(url), data)`.  The
   `deriveQueryKey` function strips `/redfish/v1/` and query parameters,
   then splits the remaining path into segments — producing the same key
   format as the Vue Query hooks.

This means that when `useRedfishCollection` fetches
`/redfish/v1/Chassis/BMC_0/Sensors/temp1` via raw `apiInstance`, the
response interceptor caches it under `['Chassis', 'BMC_0', 'Sensors',
'temp1']`.  Any live component with a `useQuery` hook watching that
same key receives the updated data reactively — no additional fetch
required.  If a Vue Query hook for the same resource mounts later, it
finds the data already warm in the cache.

An additional HTTP-level cache (axios-cache-interceptor with ETag
support) prevents redundant network transfers when the BMC returns
`304 Not Modified`.

### SSE-Driven Cache Invalidation

Note: The SSE integration is covered in more detail in a separate design
document (`docs/designs/sse-firmware-update-tracking.md`) which is still
under review.

The `useSSEQueryInvalidation` composable watches the SSE event stream and
invalidates Vue Query cache entries when Redfish resources change.  Two
mechanisms work together:

**Dynamic path-based invalidation** (primary): Extracts the
`OriginOfCondition` URI from each event, converts it to a query key
using the same stripping logic, and invalidates the exact resource.
For `ResourceCreated` / `ResourceRemoved` events, the parent collection
key is also invalidated.

```
SSE Event:
  MessageId: ResourceEvent.1.0.ResourceChanged
  OriginOfCondition: /redfish/v1/Chassis/BMC_0/Sensors/temp1

  → invalidateQueries({ queryKey: ['Chassis','BMC_0','Sensors','temp1'] })
```

**Static rule-based invalidation** (supplementary): Predefined rules
match `MessageId` patterns and `ResourceType` values to additional
query keys that should be invalidated.  For example, a `TaskEvent`
invalidates both `['TaskService']` and `['TaskService', 'Tasks']`.

### Collection Fetching Strategy

The `useRedfishCollection` composable implements a progressive
enhancement strategy that adapts to each BMC's OData query support:

1. Check `ServiceRoot.ProtocolFeaturesSupported.ExpandQuery.MaxLevels`
2. If `$expand` is supported, fetch the collection with `?$expand=.` in
   a single request
3. If `$expand` is not supported, returns an error, or only returns
   `@odata.id` refs, fall back to fetching the collection listing then
   individually GETting each member in parallel

The `useAllSubResources` composable extends this with a two-phase
approach for cross-collection aggregation (e.g. all Sensors across all
Chassis):

1. Discover sub-resource URIs — uses `$select` optimization if
   supported, otherwise fetches each parent member individually
2. Fetch each sub-resource collection using `fetchRedfishCollection`
   (which applies its own `$expand` fallback)

Every intermediate GET request flows through the axios response
interceptor, populating the Vue Query cache.  This means that even in
the worst-case fallback (no `$select`, no `$expand`), every individual
resource response is cached and available to Vue Query hooks that may
mount later.

### Store Migration Pattern

The migration from Vuex to Vue Query follows a three-tier model:

**Tier 1 — Vue Query hooks** (preferred): For standard Redfish resource
reads where the URI is known at build time.  Ideally these are
Orval-generated (e.g. `useGetSystems()`, `useGetManagersById(id)`) for
type safety and automatic cache keys, but hand-written `useQuery` hooks
that follow the query key convention work equally well.

**Tier 2 — Vue Query composables** (`src/api/composables/`): For
dynamic URIs discovered at runtime, collection expansion, or
cross-collection aggregation.  These wrap `apiInstance` calls inside
`useQuery` so results participate in the cache.

**Tier 3 — Pinia stores** (`src/stores/`): For client-derived state
that computes over server data or manages UI-only state.  Pinia stores
may wrap Vue Query hooks internally (as `global.ts` does) when
multiple components need the same derived values.  Server state itself
is never stored in Pinia — the Vue Query cache is the single source of
truth.

Example: the `global.ts` Pinia store wraps five Vue Query hooks
(`useGetServiceRoot`, `useGetManagers`, `useGetManagersById`,
`useGetSystems`, `useGetSystemsById`) and exposes computed properties
like `PowerState`, `BootProgressState`, and `HealthStatus` that derive
from the Vue Query cached data.  The store does not duplicate the
Redfish responses — it holds `computed()` refs that point into the
Vue Query cache.

#### Migration Checklist per Vuex Store

For each Vuex store module being migrated:

1. Identify the Redfish resources it reads (GET) and writes
   (PATCH/POST/DELETE)
2. Replace reads with Vue Query hooks (Orval-generated or hand-written)
   or composables
3. Replace writes with mutation hooks (`useMutation`) — Orval can
   generate these, or they can be written by hand
4. Move any client-derived state (computed values, UI preferences) to
   a Pinia store that consumes the Vue Query data
5. Delete the Vuex store module
6. Update components to import from the new location
7. Verify SSE invalidation triggers refetch for the affected resources

#### Current Migration Status

| Category               | Vuex Modules | Migrated | Remaining |
|------------------------|-------------|----------|-----------|
| Global / Core          | 1           | 1        | 0         |
| Authentication         | 1           | 1        | 0         |
| Firmware               | 1           | 1        | 0         |
| Hardware Status        | 12          | 0        | 12        |
| Operations             | 6           | 0        | 6         |
| Logs                   | 6           | 1*       | 5         |
| Settings               | 4           | 0        | 4         |
| Security & Access      | 5           | 0        | 5         |
| Resource Management    | 1           | 0        | 1         |
| Other                  | 1           | 0        | 1         |
| **Total**              | **38**      | **4**    | **34**    |

*Event Logs migrated to `useEventLog` composable; Vuex store retained
for non-migrated pages.

### Redfish-First Philosophy

All new code MUST follow Redfish-first conventions:

- **Use Redfish (PascalCase) names** for types and properties.  Import
  types from `src/api/model/` (e.g. `ServiceRoot`, `ComputerSystem`,
  `Sensor`).  Do not create intermediate UI-layer interfaces when the
  component can use the Redfish model directly.

- **Use Vue Query hooks** for standard resource reads.  Prefer
  Orval-generated endpoint functions when available; never use raw
  `apiInstance` for a resource that has a generated or hand-written
  hook.  If a generated endpoint is missing from `redfish.dist.ts`,
  add it by running the dist generator or write the hook by hand.

- **Use Redfish navigation links** to discover resources at runtime
  rather than constructing URIs from string templates.  Follow the
  pattern in `global.ts`: ServiceRoot → ManagerProvidingService →
  ManagerForServers[0] → System.

## Alternatives Considered

**Keep Vuex for server state**: Rejected because Vuex stores duplicate
caching logic, cannot participate in SSE-driven invalidation, and
require manual refetch orchestration.  Vue Query provides all of this
out of the box with its query key system.

**Use Pinia for server state (without Vue Query)**: Rejected because
Pinia would still require manual caching, deduplication, and refetch
logic.  Vue Query's cache is purpose-built for server state and
integrates directly with the SSE invalidation system.  Pinia remains
the right choice for client-only state.

**Use operation IDs as query keys** (`useOperationIdAsQueryKey` in
Orval): Rejected because operation-ID keys (e.g. `['getAccountService']`)
lose TanStack Query's hierarchical prefix matching.  Path-based keys
allow invalidating `['Systems']` to automatically cascade to all
system-related queries.

**Keep `['redfish', 'v1']` prefix on query keys**: Rejected because
every single query key carried the same two redundant segments.  The
prefix serves no distinguishing purpose (all API queries are Redfish)
and adds visual noise in code and debug logs.

## Impacts

**API impact**: None.  The Redfish API is unchanged.  The change is
entirely in the client-side data management layer.

**Security impact**: None.  Authentication and authorization continue to
use the existing X-Auth-Token / XSRF cookie mechanism.

**Documentation impact**: This design document and the existing
Redfish-first rule (`.cursor/rules/redfish-first-api-calls.mdc`)
serve as the primary references.  Component-level documentation is
provided in JSDoc comments within each composable.

**Performance impact**: Positive.  Vue Query deduplicates in-flight
requests, caches responses, and uses the axios ETag cache to avoid
redundant data transfers.  SSE-driven invalidation replaces polling
with event-driven refetch.

**Developer impact**: Moderate.  Contributors must learn Vue Query
patterns and follow the query key convention.  When available,
Orval-generated hooks reduce boilerplate significantly, but the
architecture does not depend on Orval.

**Upgradability impact**: Low.  Vue Query is actively maintained and
the query key convention is project-specific, independent of library
internals.  Orval is an optional build-time dependency.

### Organizational

- Does this proposal require a new repository? No
- Who will be the initial maintainer(s) of this repository? Existing
  webui-vue maintainers
- Which repositories are expected to be modified to execute this design?
  `openbmc/webui-vue` only

## Testing

- **Unit tests**: Each composable should have unit tests verifying query
  key construction, cache population, and SSE invalidation behavior.
  Use `@tanstack/vue-query`'s `QueryClient` in test mode.

- **Integration tests**: Verify the full SSE → cache invalidation →
  refetch cycle using mock SSE events and a test QueryClient.

- **Component tests**: Migrated components should test that they render
  data from Vue Query hooks and respond to cache invalidation.

- **CI impact**: The existing Vitest configuration supports Vue Query
  testing.  No new CI infrastructure is required.
