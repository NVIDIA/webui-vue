/**
 * useSSE Composable - Manage SSE EventSource lifecycle
 *
 * Provides reactive SSE connection with:
 * - Automatic reconnection with exponential backoff
 * - Last-Event-Id replay support
 * - Auth failure handling (verifies 401/403 before logout)
 * - Integration with Pinia SSE store
 *
 * Uses browser-native EventSource (no external dependencies).
 *
 * Note: EventSource doesn't expose HTTP status codes on error, so after
 * 5 failed reconnection attempts, we make a separate API call to verify
 * if the session is still valid before triggering logout.
 */
import { watch, computed, type Ref } from 'vue';
import { useSSEStore } from '@/stores/sse';
import { parseSSEEventData, type ParseResult } from './parseSSEEvent';
import { apiInstance } from '@/api/mutator/axios-instance';
import type { EventRecord } from '@/api/model/EventRecord';

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
  onEvent?: (Events: EventRecord[]) => void;

  /**
   * Callback when connection status changes.
   */
  onStatusChange?: (status: string) => void;

  /**
   * Callback when buffer exceeded is detected.
   * UI should trigger a full refresh.
   */
  onBufferExceeded?: () => void;

  /**
   * Callback when authentication failure is detected.
   * UI should trigger logout.
   */
  onAuthFailed?: () => void;
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
  /** Latest received events (Redfish EventRecord) */
  Events: Ref<EventRecord[]>;
  /** Whether buffer exceeded was detected */
  bufferExceeded: Ref<boolean>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_ENDPOINT = '/redfish/v1/EventService/SSE';
const MIN_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MIN_STABLE_CONNECTION_MS = 5000;

// ============================================================================
// Module-level singleton state (survives HMR updates)
// ============================================================================

// These are module-level to persist across HMR updates and component re-mounts
let singletonEventSource: EventSource | null = null;
let singletonReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let singletonShouldReconnect = true;
let singletonAuthFailed = false;
let singletonConnectionOpenedAt: number | null = null;
let singletonInitialized = false;
let singletonWatchersCreated = false;

// Store callbacks from the current active composable instance
let activeOnEvent: ((Events: EventRecord[]) => void) | undefined;
let activeOnStatusChange: ((status: string) => void) | undefined;
let activeOnBufferExceeded: (() => void) | undefined;
let activeOnAuthFailed: (() => void) | undefined;

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
    onAuthFailed,
  } = options;

  // Store callbacks in module-level variables so they can be updated on HMR
  // without recreating watchers
  activeOnEvent = onEvent;
  activeOnStatusChange = onStatusChange;
  activeOnBufferExceeded = onBufferExceeded;
  activeOnAuthFailed = onAuthFailed;

  // Store
  const sseStore = useSSEStore();

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
    if (singletonEventSource?.readyState === EventSource.CONNECTING ||
        singletonEventSource?.readyState === EventSource.OPEN) {
      console.log('[SSE] Connect skipped - already connecting/connected');
      return;
    }

    // Don't connect if auth failed
    if (singletonAuthFailed) {
      console.log('[SSE] Connect skipped - auth failed');
      return;
    }

    // Don't connect if not authenticated
    if (isAuthenticated && !isAuthenticated.value) {
      console.log('[SSE] Connect skipped - not authenticated');
      return;
    }

    // Don't connect if a reconnect is already scheduled (prevents HMR race)
    if (singletonReconnectTimeout) {
      console.log('[SSE] Connect skipped - reconnect already scheduled');
      return;
    }

    sseStore.setStatus('connecting');
    activeOnStatusChange?.('connecting');

    const url = buildSSEUrl();

    // Create EventSource with withCredentials for cookie auth
    const es = new EventSource(url, { withCredentials: true });

    // -----------------------------------------------------------------------
    // EventSource event handlers
    // -----------------------------------------------------------------------

    es.onopen = () => {
      singletonConnectionOpenedAt = Date.now();
      sseStore.setStatus('connected');
      // Don't reset reconnect attempts immediately - wait for stable connection
      // This prevents infinite reconnect loops when connection opens but fails quickly
      activeOnStatusChange?.('connected');
      singletonAuthFailed = false;

      // Send Last-Event-Id header on reconnection
      // Note: EventSource automatically sends Last-Event-Id if we've received events
    };

    es.onmessage = (event: MessageEvent) => {
      // Reset attempts on successful message - connection is working
      if (sseStore.reconnectAttempts > 0) {
        console.log('[SSE] Message received, resetting reconnect attempts');
        sseStore.resetReconnectAttempts();
      }
      handleSSEMessage(event);
    };

    es.onerror = (error: Event) => {
      const readyState = es.readyState;
      const connectionDuration = singletonConnectionOpenedAt
        ? Date.now() - singletonConnectionOpenedAt
        : 0;

      // Try to get more error details
      const target = error.target as EventSource | null;
      console.warn('[SSE] Error occurred', {
        readyState: readyState === 0 ? 'CONNECTING' : readyState === 1 ? 'OPEN' : 'CLOSED',
        connectionDurationMs: connectionDuration,
        reconnectAttempts: sseStore.reconnectAttempts,
        url: target?.url,
        withCredentials: target?.withCredentials,
        // If readyState is CONNECTING, the HTTP request itself failed
        // This could be: 401/403, wrong content-type, or proxy issue
        hint: readyState === 0
          ? 'HTTP handshake failed - check Network tab for response status/headers'
          : 'Connection established but then failed',
      });
      handleSSEError(error, es);
    };

    singletonEventSource = es;
  }

  // -------------------------------------------------------------------------
  // Handle incoming SSE message
  // -------------------------------------------------------------------------

  function handleSSEMessage(event: MessageEvent) {
    const Result: ParseResult = parseSSEEventData(
      event.data as string,
      event.lastEventId,
    );

    if (Result.Error) {
      console.warn('SSE parse error:', Result.Error);
      return;
    }

    // Handle special events
    if (Result.SpecialEvent) {
      sseStore.handleSpecialEvent(Result.SpecialEvent);

      if (Result.SpecialEvent === 'EventBufferExceeded') {
        activeOnBufferExceeded?.();
      }
    }

    // Add events to store
    for (const Event of Result.Events) {
      sseStore.addEvent(Event);
    }

    // Callback
    if (Result.Events.length > 0) {
      activeOnEvent?.(Result.Events);
    }
  }

  // -------------------------------------------------------------------------
  // Verify auth status before logging out
  // -------------------------------------------------------------------------

  async function verifyAuthAndMaybeLogout(): Promise<void> {
    try {
      // Make a simple API call to check if session is still valid
      await apiInstance({
        url: '/redfish/v1/SessionService/Sessions',
        method: 'GET',
      });
      // Session is valid - SSE failure was not auth-related
      console.log('[SSE] Session verified - SSE failure is not auth-related');
      // Don't log out, just leave SSE in error state
    } catch (error) {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError?.response?.status === 401 || axiosError?.response?.status === 403) {
        // Confirmed auth failure - trigger logout
        console.warn('[SSE] Session invalid (401/403) - triggering logout');
        activeOnAuthFailed?.();
      } else {
        // Other error (network, server, etc.) - don't log out
        console.log('[SSE] Session check failed with non-auth error:', axiosError?.response?.status);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Handle SSE error
  // -------------------------------------------------------------------------

  function handleSSEError(_error: Event, es: EventSource) {
    // EventSource doesn't provide HTTP status codes directly
    // We infer auth errors from the readyState and connection behavior

    es.close();
    singletonEventSource = null;

    // Check if connection was stable (lasted more than MIN_STABLE_CONNECTION_MS)
    const wasStable = singletonConnectionOpenedAt !== null &&
      (Date.now() - singletonConnectionOpenedAt) >= MIN_STABLE_CONNECTION_MS;

    singletonConnectionOpenedAt = null;

    // If connection was stable, reset attempts (genuine network interruption)
    if (wasStable) {
      sseStore.resetReconnectAttempts();
    }

    // Check if we should attempt reconnection
    if (!singletonShouldReconnect) {
      sseStore.setStatus('disconnected');
      activeOnStatusChange?.('disconnected');
      return;
    }

    // Count this as a failure attempt
    sseStore.incrementReconnectAttempts();

    if (sseStore.reconnectAttempts >= 5) {
      // Stop reconnecting after 5 failed attempts
      sseStore.setStatus('error', 'SSE connection failed after multiple attempts');
      singletonAuthFailed = true;
      activeOnStatusChange?.('error');
      console.warn('[SSE] Stopping reconnection after 5 failed attempts');

      // Don't automatically log out - verify auth status first
      // SSE failures can happen for reasons other than auth (proxy issues, etc.)
      verifyAuthAndMaybeLogout();
      return;
    }

    sseStore.setStatus('reconnecting', 'Connection lost, reconnecting...');
    activeOnStatusChange?.('reconnecting');

    // Schedule reconnection with backoff
    const delay = getReconnectDelay();
    console.log(`[SSE] Reconnecting in ${Math.round(delay)}ms (attempt ${sseStore.reconnectAttempts}/5)`);
    singletonReconnectTimeout = setTimeout(() => {
      singletonReconnectTimeout = null;
      if (singletonShouldReconnect && (!isAuthenticated || isAuthenticated.value)) {
        connect();
      }
    }, delay);
  }

  // -------------------------------------------------------------------------
  // Disconnect from SSE endpoint
  // -------------------------------------------------------------------------

  function disconnect() {
    singletonShouldReconnect = false;

    if (singletonReconnectTimeout) {
      clearTimeout(singletonReconnectTimeout);
      singletonReconnectTimeout = null;
    }

    if (singletonEventSource) {
      singletonEventSource.close();
      singletonEventSource = null;
    }

    sseStore.setStatus('disconnected');
    activeOnStatusChange?.('disconnected');
  }

  // -------------------------------------------------------------------------
  // Watch authentication state (only create watchers once)
  // -------------------------------------------------------------------------

  // Only create watchers once to prevent HMR issues with stale component references
  if (!singletonWatchersCreated && isAuthenticated) {
    singletonWatchersCreated = true;

    watch(isAuthenticated, (authenticated) => {
      if (authenticated && autoConnect && sseStore.enabled) {
        singletonAuthFailed = false;
        singletonShouldReconnect = true;
        connect();
      } else if (!authenticated) {
        // User logged out - this is the ONLY time we truly disconnect
        disconnect();
        sseStore.reset();
        singletonAuthFailed = false;
        singletonInitialized = false;
        singletonWatchersCreated = false; // Allow watchers to be recreated after logout
      }
    }, { immediate: autoConnect && !singletonInitialized });

    // Mark as initialized to prevent re-running on HMR
    if (autoConnect) {
      singletonInitialized = true;
    }

    // Watch SSE enabled state (inside the same guard)
    watch(() => sseStore.enabled, (enabled) => {
      if (enabled && autoConnect && (!isAuthenticated || isAuthenticated.value)) {
        singletonShouldReconnect = true;
        connect();
      } else if (!enabled) {
        disconnect();
      }
    });
  } else if (autoConnect && !singletonInitialized) {
    // No auth tracking, connect immediately (only once)
    singletonInitialized = true;
    connect();
  }

  // -------------------------------------------------------------------------
  // Cleanup on unmount - DON'T disconnect during HMR
  // -------------------------------------------------------------------------

  // Note: We intentionally do NOT disconnect on unmount.
  // The SSE connection is a singleton that should persist across HMR updates.
  // Only explicit logout or disable should disconnect.

  // -------------------------------------------------------------------------
  // Return public API
  // -------------------------------------------------------------------------

  return {
    connect,
    disconnect,
    status: computed(() => sseStore.status),
    isConnected: computed(() => sseStore.isConnected),
    errorMessage: computed(() => sseStore.errorMessage),
    Events: computed(() => sseStore.events),
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
