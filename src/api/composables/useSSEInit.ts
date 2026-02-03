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
import { useSSEStore, type RedfishSSEEvent } from '@/stores/sse';
import { useAuthStore } from '@/stores/auth';
import { managedSystemKeys } from './useManagedSystem';

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
  function handlePowerEvent(event: RedfishSSEEvent): boolean {
    const messageId = event.MessageId ?? '';
    const message = event.Message ?? '';
    const args = event.MessageArgs ?? [];

    let isPowerEvent = false;

    // Check for ResetType property changes (e.g., "ResetType" → "Off" or "On")
    if (messageId.endsWith('.PropertyValueModified') && args[0] === 'ResetType') {
      const resetType = args[1];
      console.log(`[SSE] Power event: ResetType changed to ${resetType}`);
      isPowerEvent = true;
    }

    // Check for direct power messages
    if (
      message.includes('Host Powered ON') ||
      message.includes('Host Powered OFF') ||
      message.includes('ChassisPowerOnStarted') ||
      message.includes('ChassisPowerOff')
    ) {
      console.log(`[SSE] Power event: ${message}`);
      isPowerEvent = true;
    }

    // Invalidate managed system query to refetch PowerState
    if (isPowerEvent) {
      queryClient.invalidateQueries({ queryKey: managedSystemKeys.system() });
      return true;
    }

    return false;
  }

  // Initialize SSE connection
  const sse = useSSE({
    autoConnect: enabled,
    isAuthenticated,
    filter,
    onEvent: (events) => {
      // Process each received event
      for (const event of events) {
        // Log event
        console.log('[SSE] Event received:', {
          EventId: event.EventId,
          EventType: event.EventType,
          MessageId: event.MessageId,
          Message: event.Message,
          Severity: event.Severity,
          OriginOfCondition: event.OriginOfCondition,
          EventTimestamp: event.EventTimestamp,
          MessageArgs: event.MessageArgs,
          Resolution: event.Resolution,
        });

        // Handle power state events
        handlePowerEvent(event);
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
  });

  // Set up query invalidation
  useSSEQueryInvalidation({
    events: sse.events,
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

  return {
    // Connection controls
    connect: sse.connect,
    disconnect: sse.disconnect,

    // Status
    status: sse.status,
    isConnected: sse.isConnected,
    errorMessage: sse.errorMessage,

    // Events
    events: sse.events,
    bufferExceeded: sse.bufferExceeded,

    // Store access
    sseStore,
  };
}
