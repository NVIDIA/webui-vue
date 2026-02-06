# SSE-Driven Firmware Update Tracking

Author: Jason Westover (Discord: jasonwestover)

Other contributors: None

Created: February 4, 2026

## Problem Description

When a firmware update is initiated on a BMC—whether by the current user,
another user, or an external tool—the WebUI should display real-time progress
to all connected clients. Currently, firmware update progress tracking is
tightly coupled to the initiating session and relies on Vuex state that doesn't
persist across page refreshes or share state between browser tabs/users.

This design addresses the need for resilient, event-driven firmware update
tracking that works across all scenarios: user-initiated updates, updates
started by other users, updates started by external tools, and page refreshes
during an active update.

## Background and References

### Redfish Server-Sent Events (SSE)

The Redfish specification defines an SSE endpoint for real-time event
notification. The BMC sends events for various system changes, including
firmware update progress via `TaskEvent` and `Update` registry messages.

- [Redfish Specification - Server Sent Events](https://www.dmtf.org/dsp/DSP0266)
- [Redfish Event Message Registries](https://redfish.dmtf.org/registries/)

### Relevant Event Types

```
TaskEvent.1.0.TaskStarted     - Task begins execution
TaskEvent.1.0.TaskProgressChanged - Task progress updated
TaskEvent.1.0.TaskCompletedOK - Task completed successfully
TaskEvent.1.0.TaskCompletedWarning - Task completed with warnings
TaskEvent.1.0.TaskAborted     - Task was aborted

Update.1.0.TargetDetermined   - Update target identified
Update.1.0.TransferringToComponent - Image transfer in progress
Update.1.0.VerifyingAtComponent - Image verification in progress
Update.1.0.UpdateSuccessful   - Update completed successfully
Update.1.0.AwaitToActivate    - Awaiting activation (reboot required)

HeartbeatEvent.1.1.RedfishServiceFunctional - Connection health check
```

The `HeartbeatEvent` is used to prime the SSE connection and confirm it's working.
See [Redfish HeartbeatEvent Registry](https://github.com/DMTF/Redfish-Publications/blob/main/registries/HeartbeatEvent.1.1.1.json).

### Related Work

- Existing downstream Vuex `FirmwareStore.js` implements task polling and
  state machine
- TanStack Query provides reactive data fetching with cache invalidation
- Pinia provides modern Vue 3 state management with better TypeScript support

### Redfish-First Naming Convention

This implementation follows the project's **Redfish-first** naming convention:
- Property names use PascalCase to match Redfish schema (e.g., `State`, `Initiator`)
- Types extend Redfish models directly rather than creating normalized UI types
- The `FirmwareUpdateInfo` interface extends `Partial<Task>` to inherit Redfish
  properties like `@odata.id`, `PercentComplete`, `Messages`, `TaskState`, etc.

## Requirements

### Functional Requirements

1. **Real-time Progress Display**: Show firmware update progress in the header
   with percentage completion, regardless of who initiated the update.

2. **Multi-User Awareness**: When User A starts a firmware update, User B
   (logged into the same BMC) should see the progress bar appear and track
   the update in real-time.

3. **Page Refresh Resilience**: If a user refreshes the page during an active
   firmware update, the UI should detect the in-progress update and resume
   tracking.

4. **State Machine**: Track firmware update lifecycle through defined states:
   - `null` → `TaskStarted` → `TaskCompleted` → `Done`
   - `TaskStarted` → `TaskFailed`
   - `TaskCompleted` → `ResetFailed` | `WaitReadyFailed`

5. **Initiator Tracking**: Distinguish between the user who initiated the
   update (initiator) and observers. Only the initiator should trigger
   post-update actions like BMC reset.

6. **Authentication Failure Handling**: If SSE connection fails repeatedly
   (indicating session expiration), trigger logout.

### Non-Functional Requirements

1. **No Polling Overhead**: Use SSE events as primary notification mechanism,
   with task polling only after a TaskStarted event is received.

2. **HMR Compatibility**: SSE connection must survive Vite Hot Module
   Replacement during development without creating duplicate connections.

3. **Vuex Migration Path**: Solution should use Pinia instead of Vuex,
   aligning with the project's Vue 3 migration strategy.

### Configuration

The following environment variables control polling behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_FIRMWARE_UPDATE_POLL_INTERVAL` | 4 | Seconds between task polls |
| `VITE_FIRMWARE_UPDATE_POLL_TIMEOUT` | 1200 | Max seconds to poll (20 min) |
| `VITE_WAIT_FOR_READY_INTERVAL` | 8 | Seconds between ready checks |
| `VITE_WAIT_FOR_READY_TIME` | 40 | Max ready check iterations |

## Proposed Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AppLayout.vue                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                       AppHeader                              ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ ││
│  │  │HealthRollup  │ │ PowerState   │ │ FirmwareProgress     │ ││
│  │  │    Icon      │ │    Icon      │ │ (when active)        │ ││
│  │  └──────────────┘ └──────────────┘ └──────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
         │                                        ▲
         │ useSSEInit()                           │ firmwareStore.firmwareUpdateInfo
         ▼                                        │
┌─────────────────────┐                  ┌────────┴────────┐
│      useSSE         │ ──SSE Events──► │  useFirmwareStore│
│  (EventSource)      │                  │     (Pinia)      │
└─────────────────────┘                  └─────────────────┘
         │                                        │
         │ Events                                 │ pollTask()
         ▼                                        ▼
┌─────────────────────┐                  ┌─────────────────┐
│ useSSEQuery         │                  │  Redfish API    │
│ Invalidation        │                  │  /TaskService/  │
└─────────────────────┘                  │  Tasks/{id}     │
         │                               └─────────────────┘
         ▼
┌─────────────────────┐
│   Vue Query Cache   │
│   Invalidation      │
└─────────────────────┘
```

### Component Responsibilities

#### 1. `useSSE` Composable

Manages the SSE connection lifecycle with:
- Module-level singleton state (survives HMR)
- Exponential backoff reconnection (max 5 attempts)
- Authentication failure detection after repeated failures
- Callbacks for events, status changes, and auth failures
- Returns `EventRecord[]` (Redfish-compliant event type)

SSE events are parsed using Redfish-compliant types from `src/api/model/`:
- `Event` - Container for array of `EventRecord` objects
- `EventRecord` - Individual event with `MessageId`, `OriginOfCondition`, etc.
- Events use native Redfish property names (PascalCase)

#### 2. `useSSEInit` Composable

Initializes SSE in `AppLayout.vue` and routes events:
- Watches auth state to connect/disconnect
- Routes events to `useSSEQueryInvalidation` for cache updates
- Detects firmware update events (`TaskEvent.*.TaskStarted`) and triggers `firmwareStore`
- Handles power state events for real-time power status updates
- Sends `HeartbeatEvent.1.1.RedfishServiceFunctional` test event to prime SSE connection
- Skips heartbeat events in event processing (they're for connection health only)
- Handles auth failure by calling `authStore.logout()`

#### 3. `useFirmwareStore` (Pinia)

Manages firmware update state machine. The `FirmwareUpdateInfo` interface follows
the **Redfish-first** naming convention, extending the Redfish `Task` model with
UI-specific fields:

```typescript
/**
 * Extends Redfish Task with UI-specific fields (PascalCase per Redfish-first).
 *
 * Redfish Task fields used:
 * - @odata.id: Task URI
 * - PercentComplete: Progress 0-100
 * - Messages: Error/status messages
 * - TaskState: Redfish task state
 * - TaskStatus: Redfish task health status
 */
interface FirmwareUpdateInfo extends Partial<Omit<Task, 'PercentComplete'>> {
  /** UI state machine state (not the same as Redfish TaskState) */
  State: FirmwareUpdateState;
  /** Whether this client initiated the update */
  Initiator: boolean;
  /** Toggle to trigger reactivity on updates */
  Touch: boolean;
  /** Upload progress (0-100) before task is created */
  UploadProgress: number;
  /** Task progress 0-100 (writable override of readonly Task.PercentComplete) */
  PercentComplete?: number;
}

type FirmwareUpdateState =
  | null              // No update in progress
  | 'TaskStarted'     // Task is running, polling active
  | 'TaskCompleted'   // Task finished, waiting for activation
  | 'Done'            // Update complete
  | 'TaskFailed'      // Task failed
  | 'ResetFailed'     // Post-update reset failed
  | 'WaitReadyFailed' // BMC didn't become ready after reset
```

Key actions:
- `setFirmwareUpdateTask({ TaskHandle, Initiator })` - Attach to a task
- `pollTask(TaskHandle)` - Poll until completion/failure
- `attachExistingUpdateTask()` - Find and attach to existing update on refresh

#### 4. SSE Event Flow

```
BMC sends: TaskEvent.1.0.TaskStarted
           OriginOfCondition: /redfish/v1/TaskService/Tasks/3
                    │
                    ▼
           useSSEInit receives event via onEvent callback
                    │
                    ▼
           handleFirmwareEvent() extracts TaskHandle from OriginOfCondition
                    │
                    ▼
           checkAndAttachFirmwareTask(TaskHandle) called async
                    │
                    ▼
           GET /redfish/v1/TaskService/Tasks/3
           Response: { Payload: { TargetUri: "/redfish/v1/UpdateService/update" } }
                    │
                    ▼
           Check if TargetUri matches firmware endpoints:
             - /UpdateService/update (HttpPushUri)
             - /UpdateService/update-multipart (MultipartHttpPushUri)
             - /UpdateService/Actions/UpdateService.SimpleUpdate
             - /UpdateService/Actions/UpdateService.StartUpdate
                    │
                    ├─► If NOT firmware-related → ignore task
                    │
                    ▼
           firmwareStore.setFirmwareUpdateTask({
             TaskHandle: '/redfish/v1/TaskService/Tasks/3',
             Initiator: false  // Observed via SSE, not initiated
           })
                    │
                    ▼
           firmwareStore.pollTask(TaskHandle) starts
           (polls every VITE_FIRMWARE_UPDATE_POLL_INTERVAL seconds)
                    │
                    ▼
           UI shows progress bar via firmwareUpdateInfo.PercentComplete
```

#### 5. Determining Firmware-Related Tasks

Not all `TaskEvent.*.TaskStarted` events are firmware updates. To distinguish:

1. **Fetch task details**: `GET /redfish/v1/TaskService/Tasks/{id}`
2. **Check `Payload.TargetUri`**: The task's target endpoint indicates its type
3. **Match against firmware endpoints**:
   - `*/UpdateService/update*` - HTTP Push updates
   - `*/UpdateService/Actions/UpdateService.SimpleUpdate` - Simple updates
   - `*/UpdateService/Actions/UpdateService.StartUpdate` - Staged updates

Tasks targeting other endpoints (e.g., `/Chassis/*/Actions/*`) are ignored.

### Initiator vs Observer

The `Initiator` flag (PascalCase per Redfish-first convention) determines
post-update behavior:

| Scenario | Initiator | Post-Update Behavior |
|----------|-----------|---------------------|
| User clicks "Update Firmware" | `true` | Triggers BMC reset if required |
| SSE detects another user's update | `false` | Only observes, no reset |
| Page refresh during update | `false`* | Observes only |

*Initiator status is persisted in `sessionStorage` (key: `firmwareUpdateInitiator`)
to survive refresh within the same tab, but not across tabs.

### Page Refresh Handling

On `AppLayout` mount, `attachExistingUpdateTask()` is called to:
1. Query `/redfish/v1/TaskService/Tasks` for active tasks
2. Check if any task's `Payload.TargetUri` matches update endpoints
3. If found, attach to the task with `Initiator: false`

Note: The firmware store also checks `sessionStorage` for `firmwareUpdateInitiator`
to restore initiator status if the user refreshes within the same tab.

## Alternatives Considered

### 1. Pure SSE Event Tracking (No Task Polling)

**Rejected** because not all BMCs send `TaskProgressChanged` events reliably.
Task polling ensures progress updates even when SSE events are sparse.

### 2. Vuex Store Migration

**Rejected** in favor of Pinia for:
- Better TypeScript support
- Simpler API (no mutations, just actions)
- Aligns with Vue 3 best practices
- DevTools integration improvements

### 3. Vue Query for Task Polling

**Considered** but kept task polling in Pinia because:
- Polling is a state machine, not data fetching
- Need fine-grained control over poll intervals
- State persists across component unmounts

## Impacts

### API Impact

None. Uses existing Redfish APIs:
- `GET /redfish/v1/TaskService/Tasks`
- `GET /redfish/v1/TaskService/Tasks/{id}`
- SSE endpoint at `/redfish/v1/EventService/SSE`

### Security Impact

- SSE connection requires valid session authentication
- Failed SSE reconnection after 5 attempts triggers logout
- Sensitive task data is only accessible to authenticated users

### Documentation Impact

- This design document added to `docs/designs/`
- JSDoc comments in source files

### Performance Impact

- SSE is a persistent connection (one per browser tab)
- Task polling only occurs during active updates (every 4s default)
- No polling when no update is in progress

### Developer Impact

- New composable `useFirmwareStore` replaces Vuex `firmware` module
- Components import from `@/stores/firmware` instead of Vuex
- Follow Redfish-first naming: use PascalCase for properties (`State`, `Initiator`)
- Use `FirmwareUpdateInfo` which extends `Partial<Task>` for type safety
- SSE events use native `EventRecord` type from `@/api/model/EventRecord`

### Upgradability Impact

None. This is a client-side change only.

### Organizational

- Does this proposal require a new repository? No
- Who will be the initial maintainer(s)? WebUI maintainers
- Which repositories are expected to be modified? `openbmc/webui-vue` only

## Testing

### Unit Tests

- `useFirmwareStore` state machine transitions
- SSE event parsing and routing
- Initiator flag persistence in sessionStorage

### Integration Tests

- Full firmware update flow with mocked SSE events
- Page refresh during active update
- Multi-tab behavior (initiator in one, observer in another)

### Manual Testing

1. Start firmware update, verify progress bar appears
2. Open second browser tab, verify progress appears there too
3. Refresh page during update, verify progress resumes
4. Start update from external tool (curl), verify WebUI shows progress
5. Let session expire, verify SSE triggers logout after failures
