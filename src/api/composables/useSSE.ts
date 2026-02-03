/**
 * useSSE Composable - Manage SSE EventSource lifecycle
 *
 * Provides reactive SSE connection with:
 * - Automatic reconnection with exponential backoff
 * - Last-Event-Id replay support
 * - Auth failure handling (401/403 stops reconnection)
 * - Integration with Pinia SSE store
 *
 * Uses browser-native EventSource (no external dependencies).
 */
import { ref, watch, onUnmounted, computed, type Ref } from 'vue';
import { useSSEStore, type RedfishSSEEvent } from '@/stores/sse';
import { parseSSEEventData, type ParseResult } from './parseSSEEvent';

// ============================================================================
// Types
// ============================================================================

export interface UseSSEOptions {
  /**
   * Whether SSE should auto-connect when enabled.
   * @default true
   */
  autoConnect?: boolean;

  /**
   * Whether the user is authenticated.
   * SSE only connects when authenticated.
   */
  isAuthenticated?: Ref<boolean>;

  /**
   * Custom SSE endpoint URL.
   * @default '/redfish/v1/EventService/SSE'
   */
  endpoint?: string;

  /**
   * $filter query parameter for server-side filtering.
   * See Redfish EventService for supported properties.
   */
  filter?: string;

  /**
   * Callback when events are received.
   */
  onEvent?: (events: RedfishSSEEvent[]) => void;

  /**
   * Callback when connection status changes.
   */
  onStatusChange?: (status: string) => void;

  /**
   * Callback when buffer exceeded is detected.
   * UI should trigger a full refresh.
   */
  onBufferExceeded?: () => void;
}

export interface UseSSEReturn {
  /** Connect to SSE endpoint */
  connect: () => void;
  /** Disconnect from SSE endpoint */
  disconnect: () => void;
  /** Current connection status */
  status: Ref<string>;
  /** Whether currently connected */
  isConnected: Ref<boolean>;
  /** Error message if any */
  errorMessage: Ref<string | null>;
  /** Latest received events */
  events: Ref<RedfishSSEEvent[]>;
  /** Whether buffer exceeded was detected */
  bufferExceeded: Ref<boolean>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_ENDPOINT = '/redfish/v1/EventService/SSE';
const MIN_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const AUTH_ERROR_CODES = [401, 403];

// ============================================================================
// Composable Implementation
// ============================================================================

export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const {
    autoConnect = true,
    isAuthenticated,
    endpoint = DEFAULT_ENDPOINT,
    filter,
    onEvent,
    onStatusChange,
    onBufferExceeded,
  } = options;

  // Store
  const sseStore = useSSEStore();

  // Local state
  const eventSource = ref<EventSource | null>(null);
  const reconnectTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnect = ref(true);
  const authFailed = ref(false);

  // -------------------------------------------------------------------------
  // Build SSE URL with query parameters
  // -------------------------------------------------------------------------

  function buildSSEUrl(): string {
    const params = new URLSearchParams();

    // Add filter if provided
    if (filter) {
      params.set('$filter', filter);
    }

    const queryString = params.toString();
    return queryString ? `${endpoint}?${queryString}` : endpoint;
  }

  // -------------------------------------------------------------------------
  // Calculate reconnection delay with exponential backoff
  // -------------------------------------------------------------------------

  function getReconnectDelay(): number {
    const attempts = sseStore.reconnectAttempts;
    const delay = Math.min(
      MIN_RECONNECT_DELAY_MS * Math.pow(2, attempts),
      MAX_RECONNECT_DELAY_MS,
    );
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000;
  }

  // -------------------------------------------------------------------------
  // Connect to SSE endpoint
  // -------------------------------------------------------------------------

  function connect() {
    // Don't connect if already connecting/connected
    if (eventSource.value?.readyState === EventSource.CONNECTING ||
        eventSource.value?.readyState === EventSource.OPEN) {
      return;
    }

    // Don't connect if auth failed
    if (authFailed.value) {
      return;
    }

    // Don't connect if not authenticated
    if (isAuthenticated && !isAuthenticated.value) {
      return;
    }

    // Clear any pending reconnect
    if (reconnectTimeout.value) {
      clearTimeout(reconnectTimeout.value);
      reconnectTimeout.value = null;
    }

    sseStore.setStatus('connecting');
    onStatusChange?.('connecting');

    const url = buildSSEUrl();

    // Create EventSource with withCredentials for cookie auth
    const es = new EventSource(url, { withCredentials: true });

    // -----------------------------------------------------------------------
    // EventSource event handlers
    // -----------------------------------------------------------------------

    es.onopen = () => {
      sseStore.setStatus('connected');
      sseStore.resetReconnectAttempts();
      onStatusChange?.('connected');
      authFailed.value = false;

      // Send Last-Event-Id header on reconnection
      // Note: EventSource automatically sends Last-Event-Id if we've received events
    };

    es.onmessage = (event: MessageEvent) => {
      handleSSEMessage(event);
    };

    es.onerror = (error: Event) => {
      handleSSEError(error, es);
    };

    eventSource.value = es;
  }

  // -------------------------------------------------------------------------
  // Handle incoming SSE message
  // -------------------------------------------------------------------------

  function handleSSEMessage(event: MessageEvent) {
    const result: ParseResult = parseSSEEventData(
      event.data as string,
      event.lastEventId,
    );

    if (result.error) {
      console.warn('SSE parse error:', result.error);
      return;
    }

    // Handle special events
    if (result.specialEvent) {
      sseStore.handleSpecialEvent(result.specialEvent);

      if (result.specialEvent === 'EventBufferExceeded') {
        onBufferExceeded?.();
      }
    }

    // Add events to store
    for (const evt of result.events) {
      sseStore.addEvent(evt);
    }

    // Callback
    if (result.events.length > 0) {
      onEvent?.(result.events);
    }
  }

  // -------------------------------------------------------------------------
  // Handle SSE error
  // -------------------------------------------------------------------------

  function handleSSEError(_error: Event, es: EventSource) {
    // EventSource doesn't provide HTTP status codes directly
    // We infer auth errors from the readyState and connection behavior

    es.close();
    eventSource.value = null;

    // Check if we should attempt reconnection
    if (!shouldReconnect.value) {
      sseStore.setStatus('disconnected');
      onStatusChange?.('disconnected');
      return;
    }

    // If we were never connected, this might be an auth error
    // After multiple quick failures, assume auth error
    sseStore.incrementReconnectAttempts();

    if (sseStore.reconnectAttempts >= 5) {
      // Likely an auth error or server issue
      sseStore.setStatus('error', 'Connection failed after multiple attempts');
      authFailed.value = true;
      onStatusChange?.('error');
      return;
    }

    sseStore.setStatus('error', 'Connection lost, reconnecting...');
    onStatusChange?.('reconnecting');

    // Schedule reconnection with backoff
    const delay = getReconnectDelay();
    reconnectTimeout.value = setTimeout(() => {
      if (shouldReconnect.value && (!isAuthenticated || isAuthenticated.value)) {
        connect();
      }
    }, delay);
  }

  // -------------------------------------------------------------------------
  // Disconnect from SSE endpoint
  // -------------------------------------------------------------------------

  function disconnect() {
    shouldReconnect.value = false;

    if (reconnectTimeout.value) {
      clearTimeout(reconnectTimeout.value);
      reconnectTimeout.value = null;
    }

    if (eventSource.value) {
      eventSource.value.close();
      eventSource.value = null;
    }

    sseStore.setStatus('disconnected');
    onStatusChange?.('disconnected');
  }

  // -------------------------------------------------------------------------
  // Watch authentication state
  // -------------------------------------------------------------------------

  if (isAuthenticated) {
    watch(isAuthenticated, (authenticated) => {
      if (authenticated && autoConnect && sseStore.enabled) {
        authFailed.value = false;
        shouldReconnect.value = true;
        connect();
      } else if (!authenticated) {
        // User logged out
        disconnect();
        sseStore.reset();
        authFailed.value = false;
      }
    }, { immediate: autoConnect });
  } else if (autoConnect) {
    // No auth tracking, connect immediately
    connect();
  }

  // -------------------------------------------------------------------------
  // Watch SSE enabled state
  // -------------------------------------------------------------------------

  watch(() => sseStore.enabled, (enabled) => {
    if (enabled && autoConnect && (!isAuthenticated || isAuthenticated.value)) {
      shouldReconnect.value = true;
      connect();
    } else if (!enabled) {
      disconnect();
    }
  });

  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------

  onUnmounted(() => {
    disconnect();
  });

  // -------------------------------------------------------------------------
  // Return public API
  // -------------------------------------------------------------------------

  return {
    connect,
    disconnect,
    status: computed(() => sseStore.status),
    isConnected: computed(() => sseStore.isConnected),
    errorMessage: computed(() => sseStore.errorMessage),
    events: computed(() => sseStore.events),
    bufferExceeded: computed(() => sseStore.bufferExceeded),
  };
}

// ============================================================================
// Helper: Create SSE filter string
// ============================================================================

/**
 * Build a $filter query string for SSE subscriptions.
 *
 * @example
 * buildSSEFilter({
 *   EventType: ['Alert', 'ResourceAdded'],
 *   RegistryPrefix: ['ResourceEvent', 'SensorEvent'],
 * })
 * // Returns: "(EventType eq 'Alert' or EventType eq 'ResourceAdded') and (RegistryPrefix eq 'ResourceEvent' or RegistryPrefix eq 'SensorEvent')"
 */
export function buildSSEFilter(filters: Record<string, string[]>): string {
  const conditions: string[] = [];

  for (const [property, values] of Object.entries(filters)) {
    if (values.length === 0) continue;

    const propertyConditions = values.map(
      (value) => `${property} eq '${value}'`,
    );

    if (propertyConditions.length === 1) {
      conditions.push(propertyConditions[0]);
    } else {
      conditions.push(`(${propertyConditions.join(' or ')})`);
    }
  }

  return conditions.join(' and ');
}
