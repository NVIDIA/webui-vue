/**
 * useSSEInit - Initialize SSE connection based on authentication state
 *
 * This composable should be used in the main app layout to establish
 * the SSE connection after the user logs in.
 */
import { computed, watch } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { useSSE, buildSSEFilter } from './useSSE';
import { useSSEQueryInvalidation, invalidateAllSSEQueries } from './useSSEQueryInvalidation';
import { useSSEStore } from '@/stores/sse';
import { useAuthStore } from '@/stores/auth';
import { useFirmwareStore } from '@/stores/firmware';
import { useGlobalStore } from '@/stores/global';
import { apiInstance } from '@/api/mutator/axios-instance';
import type { EventRecord } from '@/api/model/EventRecord';
import { getOriginUri } from './parseSSEEvent';

export interface UseSSEInitOptions {
  /**
   * Enable SSE connection
   * @default true
   */
  enabled?: boolean;

  /**
   * Event types to subscribe to (empty = all events)
   */
  eventTypes?: string[];

  /**
   * Registry prefixes to filter (empty = all registries)
   */
  registryPrefixes?: string[];
}

/**
 * Initialize SSE connection with Vue Query integration.
 *
 * Call this once in the main layout component (AppLayout.vue).
 */
export function useSSEInit(options: UseSSEInitOptions = {}) {
  const {
    enabled = true,
    // Subscribe to ALL events by default (no filtering)
    eventTypes = [],
    registryPrefixes = [],
  } = options;

  const authStore = useAuthStore();
  const sseStore = useSSEStore();
  const firmwareStore = useFirmwareStore();
  const queryClient = useQueryClient();

  // Build SSE filter - empty arrays = no filtering (receive all events)
  const filter = eventTypes.length > 0 || registryPrefixes.length > 0
    ? buildSSEFilter({
        EventType: eventTypes,
        RegistryPrefix: registryPrefixes,
      })
    : undefined;

  // Watch authentication state from Pinia auth store
  const isAuthenticated = computed(() => {
    const loggedIn = authStore.isLoggedIn;
    console.log('[SSE] Auth check - isLoggedIn:', loggedIn);
    return loggedIn;
  });

  /**
   * Handle power state events and invalidate the managed system query.
   * Watches for ResetType changes and power-related messages.
   */
  function handlePowerEvent(Event: EventRecord): boolean {
    const MessageId = Event.MessageId ?? '';
    const Message = Event.Message ?? '';
    const Args = Event.MessageArgs ?? [];

    let IsPowerEvent = false;

    // Check for ResetType property changes (e.g., "ResetType" → "Off" or "On")
    if (MessageId.endsWith('.PropertyValueModified') && Args[0] === 'ResetType') {
      const ResetType = Args[1];
      console.log(`[SSE] Power event: ResetType changed to ${ResetType}`);
      IsPowerEvent = true;
    }

    // Check for direct power messages
    if (
      Message.includes('Host Powered ON') ||
      Message.includes('Host Powered OFF') ||
      Message.includes('ChassisPowerOnStarted') ||
      Message.includes('ChassisPowerOff')
    ) {
      console.log(`[SSE] Power event: ${Message}`);
      IsPowerEvent = true;
    }

    // Invalidate managed system query to refetch PowerState
    if (IsPowerEvent) {
      const globalStore = useGlobalStore();
      globalStore.refetchManagedSystem();
      return true;
    }

    return false;
  }

  /**
   * Handle firmware update events.
   * Watches for Update.* and TaskEvent.* MessageIds related to firmware operations.
   *
   * When a TaskStarted event is received, fetches the task to check if it's
   * firmware-related (by checking Payload.TargetUri), then attaches to the
   * FirmwareStore to track progress in the UI.
   */
  function handleFirmwareEvent(Event: EventRecord): boolean {
    const MessageId = Event.MessageId ?? '';
    const Message = Event.Message ?? '';
    const OriginOfCondition = getOriginUri(Event) ?? '';

    // Check for firmware update related MessageIds
    const IsFirmwareEvent =
      MessageId.startsWith('Update.') ||
      MessageId.startsWith('TaskEvent.');

    if (!IsFirmwareEvent) {
      return false;
    }

    // Log firmware events with more detail
    console.log('[SSE] Firmware/Task event:', {
      MessageId,
      Message,
      MessageArgs: Event.MessageArgs,
      Resolution: Event.Resolution,
      OriginOfCondition,
    });

    // Invalidate firmware-related queries
    queryClient.invalidateQueries({ queryKey: ['redfish', 'UpdateService'] });
    queryClient.invalidateQueries({ queryKey: ['redfish', 'TaskService'] });

    // When a task starts, check if it's a firmware update task
    if (
      MessageId.endsWith('.TaskStarted') &&
      OriginOfCondition.includes('/TaskService/Tasks/')
    ) {
      const TaskHandle = OriginOfCondition;
      // Async check - don't block event processing
      checkAndAttachFirmwareTask(TaskHandle);
    }

    return true;
  }

  /**
   * Check if a task is firmware-related and attach to the firmware store.
   *
   * A task is considered firmware-related if its Payload.TargetUri matches
   * one of the firmware update endpoints:
   * - /redfish/v1/UpdateService/update (HttpPushUri)
   * - /redfish/v1/UpdateService/update-multipart (MultipartHttpPushUri)
   * - /redfish/v1/UpdateService/Actions/UpdateService.SimpleUpdate
   */
  async function checkAndAttachFirmwareTask(taskHandle: string): Promise<void> {
    try {
      // Fetch task details to check TargetUri
      const taskInfo = await apiInstance<{
        Payload?: { TargetUri?: string };
        TaskState?: string;
      }>({
        url: taskHandle,
        method: 'GET',
      });

      const targetUri = taskInfo?.Payload?.TargetUri ?? '';

      // Check if TargetUri matches firmware update endpoints
      const isFirmwareTask =
        targetUri.includes('/UpdateService/update') ||
        targetUri.includes('/UpdateService/Actions/UpdateService.SimpleUpdate') ||
        targetUri.includes('/UpdateService/Actions/UpdateService.StartUpdate');

      if (!isFirmwareTask) {
        console.log('[SSE] Task is not firmware-related, ignoring:', taskHandle, 'TargetUri:', targetUri);
        return;
      }

      console.log('[SSE] Firmware update task confirmed, attaching to progress tracker:', taskHandle);

      // Use Pinia FirmwareStore to start tracking this task
      // Initiator: false because we're observing via SSE (someone else started it)
      firmwareStore.setFirmwareUpdateTask({
        TaskHandle: taskHandle,
        Initiator: false,
      });
    } catch (error) {
      console.warn('[SSE] Failed to check task details:', taskHandle, error);
    }
  }

  /**
   * Handle SSE authentication failure.
   * Logs out the user when SSE connection fails due to auth issues.
   */
  function handleAuthFailed(): void {
    console.warn('[SSE] Authentication failed - logging out');
    // logout(true) handles navigation to /login
    authStore.logout(true);
  }

  /**
   * Send a test event to verify SSE is working.
   * Called when SSE starts connecting to prime the stream.
   * EventSource.onopen may not fire until data arrives, so we send
   * a test event to trigger data flow.
   */
  function sendTestEvent(): void {
    console.log('[SSE] Sending test event to prime SSE stream...');
    apiInstance({
      url: '/redfish/v1/EventService/Actions/EventService.SubmitTestEvent',
      method: 'POST',
      data: {
        // Use standard HeartbeatEvent registry message
        // https://github.com/DMTF/Redfish-Publications/blob/main/registries/HeartbeatEvent.1.1.1.json
        MessageId: 'HeartbeatEvent.1.1.RedfishServiceFunctional',
      },
    })
      .then(() => console.log('[SSE] Test event sent successfully'))
      .catch((error) => console.warn('[SSE] Failed to send test event:', error));
  }

  // Initialize SSE connection
  const sse = useSSE({
    autoConnect: enabled,
    isAuthenticated,
    filter,
    onEvent: (Events) => {
      // Process each received event
      for (const Event of Events) {
        // Skip heartbeat events - they're for connection health, not data changes
        if (Event.MessageId?.startsWith('HeartbeatEvent.')) {
          console.log('[SSE] Heartbeat received - connection confirmed');
          continue;
        }

        // Log event
        console.log('[SSE] Event received:', {
          EventId: Event.EventId,
          EventType: Event.EventType,
          MessageId: Event.MessageId,
          Message: Event.Message,
          MessageSeverity: Event.MessageSeverity,
          OriginOfCondition: getOriginUri(Event),
          EventTimestamp: Event.EventTimestamp,
          MessageArgs: Event.MessageArgs,
          Resolution: Event.Resolution,
        });

        // Handle power state events
        handlePowerEvent(Event);

        // Handle firmware update events
        handleFirmwareEvent(Event);
      }
    },
    onBufferExceeded: () => {
      // Buffer exceeded - invalidate all queries to refresh data
      console.warn('[SSE] EventBufferExceeded - refreshing all data');
      invalidateAllSSEQueries(queryClient);
    },
    onStatusChange: (status) => {
      // Log status changes
      console.log(`[SSE] Status: ${status}`);
    },
    onAuthFailed: handleAuthFailed,
  });

  // Set up query invalidation
  useSSEQueryInvalidation({
    Events: sse.Events,
    onBufferExceeded: () => {
      invalidateAllSSEQueries(queryClient);
    },
  });

  // Watch for logout and cleanup
  watch(isAuthenticated, (authenticated) => {
    if (!authenticated) {
      sseStore.reset();
    }
  });

  // Watch SSE status and send test event when connecting
  // This primes the SSE stream so we don't wait for a real event
  let testEventSent = false;
  watch(sse.status, (status, oldStatus) => {
    // Send test event when transitioning to 'connecting'
    if (status === 'connecting' && oldStatus !== 'connecting' && !testEventSent) {
      testEventSent = true;
      // Small delay to ensure EventSource is fully initialized
      setTimeout(sendTestEvent, 200);
    }

    // Reset flag when disconnected so we send again on reconnect
    if (status === 'disconnected' || status === 'error') {
      testEventSent = false;
    }
  }, { immediate: true });

  return {
    // Connection controls
    connect: sse.connect,
    disconnect: sse.disconnect,

    // Status
    status: sse.status,
    isConnected: sse.isConnected,
    errorMessage: sse.errorMessage,

    // Events (Redfish EventRecord)
    Events: sse.Events,
    bufferExceeded: sse.bufferExceeded,

    // Store access
    sseStore,
  };
}
