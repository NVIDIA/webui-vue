# AppHeader Composition API Rewrite

Author: Jason Westover (Discord: jasonwestover)

Other contributors: None

Created: February 4, 2026

## Problem Description

The existing `AppHeader.vue` component uses the Vue Options API with Vuex for
state management. This creates tight coupling to legacy patterns, makes
TypeScript adoption difficult, and results in a monolithic component that is
hard to maintain and test.

This design describes a complete rewrite of AppHeader using Vue 3 Composition
API with Pinia for authentication state and Vue Query (TanStack Query) for
Redfish data fetching. The rewrite modularizes the header into focused
sub-components with clear responsibilities.

## Background and References

### Vue 3 Composition API

The Composition API provides better TypeScript support, improved code
organization through composables, and more flexible logic reuse compared to
the Options API with mixins.

- [Vue 3 Composition API Guide](https://vuejs.org/guide/extras/composition-api-faq.html)

### TanStack Query (Vue Query)

Vue Query provides declarative data fetching with automatic caching,
background refetching, and cache invalidation. It replaces manual Vuex
actions for API calls.

- [TanStack Query Vue](https://tanstack.com/query/latest/docs/framework/vue/overview)

### Pinia

Pinia is the official Vue 3 state management solution, replacing Vuex with
a simpler API and full TypeScript support.

- [Pinia Documentation](https://pinia.vuejs.org/)

### Redfish-First Naming Convention

This project follows a "Redfish-First" naming convention where Redfish
property names are preserved exactly (PascalCase) throughout the codebase,
rather than converting to JavaScript conventions (camelCase).

```typescript
// ✅ Correct - Preserve Redfish names
const { PowerState, Status } = System;
const HealthRollup = Status?.HealthRollup;

// ❌ Incorrect - Converting to JS conventions  
const { powerState, status } = system;
const healthRollup = status?.healthRollup;
```

## Requirements

### Functional Requirements

1. **Server Status Display**: Show system health status with color-coded icon
   (OK=green, Warning=yellow, Critical=red) and detailed component health
   in a tooltip.

2. **Power State Display**: Show current power state with appropriate icon
   and provide power control actions (On, Off, Restart, etc.) in a dropdown.

3. **User Menu**: Display logged-in username with dropdown for profile,
   preferences, and logout actions.

4. **Navigation Toggle**: Toggle sidebar navigation visibility on mobile.

5. **Health Rollup Logic**: Determine overall health using fallback chain:
   - Primary: `System.Status.HealthRollup`
   - Secondary: TelemetryService MetricReports (HealthMetrics)
   - Tertiary: Event Log rollup (count of active Critical/Warning events)

6. **Component Health Grid**: Display per-component health (GPU, CPU, Module,
   Baseboard) in tooltip when MetricReports data is available.

### Non-Functional Requirements

1. **Composition API**: All components use `<script setup lang="ts">`.

2. **No Vuex Dependencies**: Replace all Vuex store access with Pinia stores
   or Vue Query composables.

3. **Redfish Types**: Use generated Redfish model types directly without
   creating intermediate UI types.

4. **Modular Architecture**: Split monolithic AppHeader into focused
   sub-components.

5. **SSE Integration**: Health and power state should update in real-time
   when SSE events arrive.

## Proposed Design

### Component Architecture

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                AppHeader.vue                                   │
│  ┌──────────┐ ┌─────────────┐ ┌────────────────┐ ┌──────────────┐ ┌──────────┐│
│  │ NavToggle│ │SSEStatus    │ │HealthRollupIcon│ │PowerStateIcon│ │ UserMenu ││
│  │  Button  │ │Indicator    │ │                │ │              │ │          ││
│  └──────────┘ └─────────────┘ └────────────────┘ └──────────────┘ └──────────┘│
└────────────────────────────────────────────────────────────────────────────────┘
       │              │                │                  │               │
       │              │                │                  │               │
       ▼              ▼                ▼                  ▼               ▼
   eventBus      useSseStore    useHealthRollup    useGlobalStore    useAuthStore
                  (Pinia)       useHealthMetrics     (Pinia)           (Pinia)
                                 (Vue Query)       + ActionInfo
                                                   (Vue Query)
```

### File Structure

```
src/components/AppHeader/
├── index.js              # Barrel export
├── AppHeader.vue         # Main container component
├── HealthRollupIcon.vue  # Health status icon with tooltip
├── PowerStateIcon.vue    # Power state icon with dropdown
├── PowerIcon.vue         # Custom power SVG icon component
└── UserMenu.vue          # User dropdown menu
```

### Component Specifications

#### AppHeader.vue

Main container that orchestrates sub-components. Includes:

- **SSEStatusIndicator**: Shows SSE connection status (visible when disconnected)
- **HealthRollupIcon**: Overall system health with tooltip breakdown
- **PowerStateIcon**: Power state icon with action dropdown
- **Refresh button**: Manual data refresh triggering Vue Query refetch
- **UserMenu**: User account dropdown with logout

```vue
<script setup lang="ts">
import eventBus from '@/eventBus';
import { useGlobalStore } from '@/stores/global';
import HealthRollupIcon from './HealthRollupIcon.vue';
import PowerStateIcon from './PowerStateIcon.vue';
import UserMenu from './UserMenu.vue';
import SSEStatusIndicator from '@/components/Global/SSEStatusIndicator.vue';

function toggleNavigation() {
  eventBus.$emit('toggle-navigation');
}
</script>

<template>
  <header>
    <button @click="toggleNavigation">☰</button>
    <div class="header-actions">
      <SSEStatusIndicator />
      <HealthRollupIcon />
      <PowerStateIcon />
      <UserMenu />
    </div>
  </header>
</template>
```

#### HealthRollupIcon.vue

Displays overall system health with detailed component breakdown.

**Data Sources:**
- `useHealthRollup()` - Overall health status with fallback logic
- `useHealthMetrics()` - Per-component health from MetricReports

**Visual States:**

| Health | Icon Color | Animation |
|--------|------------|-----------|
| OK | Green | None |
| Warning | Amber | Pulse |
| Critical | Red | Pulse |
| Unknown | Gray | None |
| Loading | Gray | Spin |

**Tooltip Content:**

```
System Health: OK

Component      Health  Rollup
─────────────────────────────
GPU 0          OK      OK
GPU 1          OK      OK
CPU 0          OK      OK
CPU 1          OK      OK
Module 0       OK      OK
Baseboard 0    OK      OK
```

Component sort order: GPU → CPU → Module → Baseboard

#### PowerStateIcon.vue

Displays power state with power control dropdown.

**Design Rationale:**

The previous implementation had several UX problems:

1. **Reused Health Icon**: The power indicator used a `StatusIcon` (checkmark/warning
   triangle) which is semantically a health indicator. Users were confused—does
   green mean "power is healthy" or "power is on"?

2. **Conflated Power + Status**: The icon combined `PowerState` (On/Off) with
   `System.Status.State` (Enabled/Disabled/StandbyOffline) into a single visual.
   This didn't match the literal Redfish API separation and created ambiguity.
   For example, a system could be `PowerState: On` but `Status.State: Starting`,
   and the old icon couldn't represent both clearly.

3. **No Visual Distinction**: Power state is fundamentally different from health
   status. Power is about energy flow; health is about component condition.
   They deserve distinct iconography.

**New Design:**

This design introduces a **custom Power SVG** (`PowerIcon.vue`) with:

- **Dedicated power symbol (⏻)**: Universally recognized IEC 5009 power icon
- **Configurable fill color**: Green (On/transitioning), Red (Off), Gray (unknown)
- **Configurable blink animation**: Slow blink for PoweringOn, fast blink (1Hz) for Paused
- **Clear separation**: Power state shown via icon color; System.Status.State
  shown in tooltip/dropdown as supplementary information

**Data Sources:**
- `useGlobalStore()` → `ManagedSystem.PowerState`, `ManagedSystem.Status.State`
- `ActionInfo` query → Dynamically fetches `AllowableValues` for `ResetType`

**ActionInfo Integration:**

The component fetches the system's `ComputerSystem.Reset` ActionInfo to determine
which power actions are actually supported by the BMC. Uses the generated
`ActionInfoParameters` type from the Redfish schema. Power actions are
conditionally shown based on `AllowableResetTypes` - only actions supported by
the BMC appear in the dropdown. Graceful degradation: if ActionInfo is
unavailable, all actions are shown.

**Visual States:**

| PowerState | Icon | Color | Animation |
|------------|------|-------|-----------|
| On | ⏻ Power symbol | Green | None |
| Off | ⏻ Power symbol | Red | None |
| PoweringOn | ⏻ Power symbol | Green | Slow blink |
| PoweringOff | ⏻ Power symbol | Green | None |
| Paused | ⏻ Power symbol | Green | Fast blink (1Hz) |

**Dropdown Actions (conditional on ActionInfo):**

```
Power: On
System Status: Enabled
────────────────────
⏻ Power On
⏻ Graceful Shutdown
🔄 Graceful Restart
────────────────────
Force Actions (warning style)
⏻ Force On
⏻ Force Off
🔄 Force Restart
🔄 Power Cycle
```

Each action is conditionally shown based on whether `ActionInfo.Parameters[ResetType].AllowableValues`
includes that action type. Force actions are grouped separately with a warning header.

**Tooltip (on hover):**
```
Power State: On
System State: Enabled
```

The tooltip shows both values explicitly, allowing users to see the full
picture without conflating the two concepts in a single icon.

#### UserMenu.vue

User account dropdown menu.

**Data Sources:**
- `useAuthStore()` (Pinia) - `UserName` from session
- `useGetAccountServiceAccountById()` - Fetches account details to get `RoleId`

**Menu Items:**
- Username display with role subtitle (non-clickable header)
- Profile Settings (link)
- Logout (action)

### Composables

#### useHealthRollup

```typescript
interface UseHealthRollupReturn {
  HealthRollup: ComputedRef<ResourceHealth | 'Unknown'>;
  isLoading: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
}
```

Fallback chain implementation:

```typescript
const HealthRollup = computed(() => {
  // 1. System.Status.HealthRollup (most authoritative - NEW)
  //    Many modern BMCs provide this directly on the System resource
  if (SystemHealthRollup.value) {
    return SystemHealthRollup.value;
  }
  
  // 2. MetricReports aggregate (NEW)
  //    TelemetryService provides per-component health via HealthMetrics report
  if (MetricHealthValues.value.length > 0) {
    return calculateWorstCaseHealth(MetricHealthValues.value);
  }
  
  // 3. Event Log rollup (LEGACY - what current implementation does)
  //    Count active Critical/Warning events to derive health status
  //    This is the least accurate as it depends on event retention policies
  if (EventLogHealth.value) {
    return EventLogHealth.value;
  }
  
  return 'Unknown';
});
```

**Note:** The legacy implementation only used option 3 (Event Log rollup), which
derives health by counting unresolved Critical/Warning events. This approach is
imprecise because it depends on event retention policies and doesn't reflect
real-time component status. The new implementation prefers authoritative sources
(System.Status.HealthRollup, MetricReports) and only falls back to Event Log
when those aren't available.

#### useHealthMetrics

Fetches per-component health from TelemetryService MetricReports.

```typescript
interface ComponentHealthInfo {
  Name: string;       // e.g., "GPU_0"
  Health: string;     // e.g., "OK"
  HealthRollup: string;
}

interface UseHealthMetricsReturn {
  ComponentHealth: ComputedRef<ComponentHealthInfo[]>;
  hasMetrics: ComputedRef<boolean>;
  isLoading: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
}
```

**Fetch Strategy:**

Due to BMC `$expand` implementation variations, fetch in two steps:
1. GET `/redfish/v1/TelemetryService/MetricReports` (collection listing)
2. Find member URI containing "HealthMetrics"
3. GET that specific MetricReport

```typescript
// Step 1: Get collection listing
const listing = await apiInstance({
  url: '/redfish/v1/TelemetryService/MetricReports',
  method: 'GET',
});

// Step 2: Find HealthMetrics URI
const healthMetricsUri = listing.Members
  .find(m => m['@odata.id']?.includes('HealthMetrics'))
  ?.['@odata.id'];

// Step 3: Fetch the report
const report = await apiInstance({ url: healthMetricsUri });
```

#### useGlobalStore (Pinia)

The global store provides reactive access to the managed system, backed by Vue Query.

```typescript
const globalStore = useGlobalStore();
const { PowerState, SystemState, ManagedSystem, AssetTag, Model, SerialNumber } = storeToRefs(globalStore);

// PowerState: ResourcePowerState | undefined
// SystemState: ResourceState | undefined
// ManagedSystem: ComputerSystem | undefined
// AssetTag, Model, SerialNumber: string | undefined
```

The store exposes `refetch()` and `refetchManagedSystem()` methods to trigger
Vue Query refetch on demand (e.g., after power actions or manual refresh).

### SSE Integration

Components automatically update when SSE events trigger Vue Query cache
invalidation:

| SSE Event | Invalidated Query Keys |
|-----------|------------------------|
| `ResourceEvent.*.ResourceChanged` on `/Systems/*` | `['redfish', 'Systems']` |
| `ResourceEvent.*.ResourceChanged` on `/Chassis/*` | `['redfish', 'Chassis']` |
| `Alert.*` | `['redfish', 'Systems']`, `['redfish', 'EventLog']` |

### Styling

Components use scoped SCSS with Bootstrap 5 variables:

```scss
<style lang="scss" scoped>
.health-icon {
  &.status-ok { color: var(--bs-success); }
  &.status-warning { color: var(--bs-warning); }
  &.status-critical { color: var(--bs-danger); }
}
</style>
```

Tooltips render in a portal outside component scope, requiring global styles:

```scss
<style lang="scss">
// Global styles for tooltip content
.tooltip-inner .health-tooltip-grid {
  display: grid;
  grid-template-columns: auto auto auto;
  gap: 2px 12px;
}
</style>
```

## Alternatives Considered

### 1. Keep Options API with TypeScript

**Rejected** because:
- Mixins don't compose well with TypeScript
- Options API requires `this` context which complicates type inference
- Composition API is the recommended pattern for Vue 3

### 2. Single Monolithic AppHeader

**Rejected** because:
- Difficult to test individual features
- Large component file (500+ lines)
- Cannot lazy-load unused features
- Harder for multiple developers to work on simultaneously

### 3. Normalize Redfish Data to UI Types

**Rejected** because:
- Creates unnecessary mapping layer
- Loses type safety from generated models
- Violates project's Redfish-First convention
- Extra maintenance burden keeping types in sync

### 4. Vuex for All State

**Rejected** because:
- Vuex is legacy for Vue 3 projects
- Poor TypeScript support
- Verbose boilerplate (mutations + actions)
- Vue Query handles server state better

## Impacts

### API Impact

None. Uses existing Redfish APIs:
- `GET /redfish/v1/Systems/{SystemId}`
- `GET /redfish/v1/Systems/{SystemId}/ResetActionInfo` (for AllowableValues)
- `GET /redfish/v1/TelemetryService/MetricReports`
- `POST /redfish/v1/Systems/{SystemId}/Actions/ComputerSystem.Reset`

### Security Impact

- Power control actions respect Redfish privilege requirements
- User menu shows authenticated user from session
- Logout action clears session properly

### Documentation Impact

- Component documentation in this design doc
- JSDoc comments on composables
- Storybook stories for visual testing (future)

### Performance Impact

- Vue Query caching reduces redundant API calls
- Components only fetch data they need
- SSE provides real-time updates without polling

### Developer Impact

- New component structure requires learning
- Composable pattern enables code reuse
- TypeScript provides better IDE support
- Smaller, focused components are easier to understand

### Organizational

- Does this proposal require a new repository? No
- Who will be the initial maintainer(s)? WebUI maintainers
- Which repositories are modified? `openbmc/webui-vue` only

## Testing

### Unit Tests

- `useHealthRollup` fallback chain logic
- `useHealthMetrics` component extraction and sorting
- `useGlobalStore` system state management
- Power control action dispatching with ActionInfo validation

### Component Tests

- HealthRollupIcon renders correct color for each health state
- PowerStateIcon dropdown shows appropriate actions
- UserMenu displays username and handles logout

### Integration Tests

- Full header renders with mocked API responses
- SSE events trigger visual updates
- Power control actions call correct API endpoints

### Manual Testing Checklist

1. [ ] Health icon shows green when system healthy
2. [ ] Health icon shows red when system critical
3. [ ] Health tooltip shows component breakdown
4. [ ] Power icon shows current power state with correct color/animation
5. [ ] Power dropdown shows only supported actions (based on ActionInfo)
6. [ ] Power actions execute successfully with loading state
7. [ ] Force actions grouped separately with warning styling
7. [ ] User menu shows logged-in username
8. [ ] Logout clears session and redirects
9. [ ] Mobile nav toggle works
10. [ ] SSE events update icons in real-time
