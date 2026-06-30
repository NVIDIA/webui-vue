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
import { useGlobalStore } from '@/stores/global';
import { apiInstance } from '@/api/mutator/axios-instance';
import store from '@/store';
import eventBus from '@/eventBus';
import type { EventRecord } from '@/api/model/EventRecord';
import { getOriginUri } from './parseSSEEvent';
import { isFirmwareUpdateTargetUri } from '@/utilities/firmwareUpdateTargetUri';

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
    const MessageLower = Message.toLowerCase();
    const OriginOfCondition = getOriginUri(Event) ?? '';

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
      Message.includes('ChassisPowerOff') ||
      MessageLower.includes('chassis power on') ||
      MessageLower.includes('chassis power off')
    ) {
      console.log(`[SSE] Power event: ${Message}`);
      IsPowerEvent = true;
    }

    // BIOS events mean the system is booting — the BMC won't touch BIOS
    // resources while powered off. Start boot polling directly; we can't
    // rely on refetching the System resource because the BMC reports
    // PowerState=On + BootProgress=None before BootProgress updates.
    if (!IsPowerEvent && OriginOfCondition.includes('/Bios')) {
      console.log('[SSE] BIOS event — starting boot polling');
      IsPowerEvent = true;
    }

    // Start boot polling to track the power transition / boot sequence.
    // The Pinia store will poll rapidly until the system reaches a stable
    // state (On + OSRunning, or Off) and then stop automatically.
    if (IsPowerEvent) {
      const globalStore = useGlobalStore();
      globalStore.startBootPolling();
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
    queryClient.invalidateQueries({ queryKey: ['UpdateService'] });
    queryClient.invalidateQueries({ queryKey: ['TaskService'] });

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
      // Load UpdateService URIs for exact TargetUri matching.
      await store.dispatch('firmware/getUpdateServiceSettings').catch(() => {});

      const TASK_ATTACH_RETRIES = 5;
      const TASK_ATTACH_DELAY_MS = 1000;

      for (let attempt = 0; attempt < TASK_ATTACH_RETRIES; attempt++) {
        const taskInfo = await apiInstance<{
          Payload?: { TargetUri?: string };
          TaskState?: string;
        }>({
          url: taskHandle,
          method: 'GET',
        });

        const targetUri = taskInfo?.Payload?.TargetUri ?? '';

        if (isFirmwareUpdateTargetUri(targetUri, store.state.firmware)) {
          if (store.getters['firmware/isFirmwareUpdateInProgress']) {
            console.log(
              '[SSE] Firmware update already tracked, ignoring task:',
              taskHandle,
            );
            return;
          }

          console.log(
            '[SSE] Firmware update task confirmed, attaching to progress tracker:',
            taskHandle,
          );

          await store.dispatch('firmware/setFirmwareUpdateTask', {
            taskHandle,
            initiator: false,
          });
          return;
        }

        // TaskStarted may arrive before Payload.TargetUri is populated.
        if (!targetUri && attempt < TASK_ATTACH_RETRIES - 1) {
          console.log(
            '[SSE] Task payload not ready, retrying:',
            taskHandle,
            `(attempt ${attempt + 1}/${TASK_ATTACH_RETRIES})`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, TASK_ATTACH_DELAY_MS),
          );
          continue;
        }

        console.log(
          '[SSE] Task is not firmware-related, ignoring:',
          taskHandle,
          'TargetUri:',
          targetUri || '(empty)',
        );
        return;
      }
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

        // Notify listeners when any task completes successfully.
        // Pattern: *.TaskCompletedOK (e.g., TaskEvent.1.0.TaskCompletedOK)
        if (Event.MessageId?.endsWith('.TaskCompletedOK')) {
          eventBus.$emit('sse-task-completed-ok', Event);
        }
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
  let testEventRetrySent = false;
  let testEventRetryTimer: ReturnType<typeof setTimeout> | null = null;
  watch(sse.status, (status, oldStatus) => {
    // Send test event when transitioning to 'connecting'
    if (status === 'connecting' && oldStatus !== 'connecting' && !testEventSent) {
      testEventSent = true;
      testEventRetrySent = false;
      if (testEventRetryTimer) {
        clearTimeout(testEventRetryTimer);
        testEventRetryTimer = null;
      }
      // Small delay to ensure EventSource is fully initialized
      setTimeout(sendTestEvent, 200);
      // If still not connected after 5s, send one more test event
      testEventRetryTimer = setTimeout(() => {
        if (sse.status.value !== 'connected' && !testEventRetrySent) {
          testEventRetrySent = true;
          sendTestEvent();
        }
      }, 5000);
    }

    if (status === 'connected' && testEventRetryTimer) {
      clearTimeout(testEventRetryTimer);
      testEventRetryTimer = null;
    }

    // Reset flag when disconnected so we send again on reconnect
    if (status === 'disconnected' || status === 'error') {
      testEventSent = false;
      testEventRetrySent = false;
      if (testEventRetryTimer) {
        clearTimeout(testEventRetryTimer);
        testEventRetryTimer = null;
      }
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
