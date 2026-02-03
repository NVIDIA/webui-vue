/**
 * SSE Store - Pinia store for Server-Sent Events state management
 *
 * Manages SSE connection state, event buffering, and localStorage backup
 * for browser refresh recovery. Follows Redfish-first naming conventions.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ============================================================================
// Types - Following Redfish naming conventions (PascalCase)
// ============================================================================

export type SSEConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/**
 * Normalized Redfish Event from SSE stream.
 * Preserves Redfish field names per workspace conventions.
 */
export interface RedfishSSEEvent {
  // --- Identity ---
  /** Unique event ID from the SSE stream */
  EventId: string;
  /** ISO 8601 timestamp when event occurred */
  EventTimestamp?: string;
  /** Event type from Redfish EventType registry */
  EventType?: string;

  // --- Message ---
  /** Message registry identifier (e.g., "ResourceEvent.1.0.ResourceCreated") */
  MessageId?: string;
  /** Human-readable message */
  Message?: string;
  /** Arguments to substitute into the message template */
  MessageArgs?: string[];

  // --- Context ---
  /** URI of the resource that originated the event (extracted from @odata.id) */
  OriginOfCondition?: string;
  /** Event severity: OK, Warning, Critical (normalized from Severity or MessageSeverity) */
  Severity?: string;
  /** Suggested resolution for the event */
  Resolution?: string;

  // --- Extended ---
  /** Reference to log entry if event was logged */
  LogEntry?: unknown;
  /** OEM-specific extensions */
  Oem?: object;

  // --- Internal ---
  /** Raw event data for debugging */
  _raw?: unknown;
}

/**
 * Special event types that require specific handling
 */
export type SpecialEventType = 'Heartbeat' | 'EventBufferExceeded';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY_LAST_EVENT_ID = 'sse_lastEventId';
const STORAGE_KEY_EVENTS = 'sse_events';
const MAX_EVENTS_BUFFER = 100;

// ============================================================================
// Store Definition
// ============================================================================

export const useSSEStore = defineStore('sse', () => {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Current connection status */
  const status = ref<SSEConnectionStatus>('disconnected');

  /** Circular buffer of received events (bounded to MAX_EVENTS_BUFFER) */
  const events = ref<RedfishSSEEvent[]>([]);

  /** Last event ID for replay support */
  const lastEventId = ref<string | null>(null);

  /** Error message when status is 'error' */
  const errorMessage = ref<string | null>(null);

  /** Timestamp of last successful connection */
  const lastConnectedAt = ref<Date | null>(null);

  /** Number of reconnection attempts */
  const reconnectAttempts = ref(0);

  /** Whether SSE is enabled (can be disabled via configuration) */
  const enabled = ref(true);

  /** Whether EventBufferExceeded was received (requires full refresh) */
  const bufferExceeded = ref(false);

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /** Whether SSE is currently connected */
  const isConnected = computed(() => status.value === 'connected');

  /** Whether SSE is attempting to connect */
  const isConnecting = computed(() => status.value === 'connecting');

  /** Whether SSE has an error */
  const hasError = computed(() => status.value === 'error');

  /** High priority events (Critical severity) */
  const criticalEvents = computed(() =>
    events.value.filter((e) => e.Severity === 'Critical'),
  );

  /** Warning events */
  const warningEvents = computed(() =>
    events.value.filter((e) => e.Severity === 'Warning'),
  );

  /** Most recent event */
  const latestEvent = computed(() =>
    events.value.length > 0 ? events.value[events.value.length - 1] : null,
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Set connection status
   */
  function setStatus(newStatus: SSEConnectionStatus, error?: string) {
    status.value = newStatus;
    errorMessage.value = error ?? null;

    if (newStatus === 'connected') {
      lastConnectedAt.value = new Date();
      reconnectAttempts.value = 0;
      bufferExceeded.value = false;
    }
  }

  /**
   * Add an event to the buffer (maintains bounded size)
   */
  function addEvent(event: RedfishSSEEvent) {
    // Update last event ID
    if (event.EventId) {
      lastEventId.value = event.EventId;
      saveToLocalStorage();
    }

    // Add to buffer, maintaining max size
    events.value.push(event);
    if (events.value.length > MAX_EVENTS_BUFFER) {
      events.value.shift();
    }
  }

  /**
   * Handle special event types
   */
  function handleSpecialEvent(eventType: SpecialEventType) {
    if (eventType === 'EventBufferExceeded') {
      bufferExceeded.value = true;
      // Clear local buffer since we missed events
      events.value = [];
    }
    // Heartbeat events are handled by updating lastConnectedAt
    if (eventType === 'Heartbeat') {
      lastConnectedAt.value = new Date();
    }
  }

  /**
   * Increment reconnection attempts
   */
  function incrementReconnectAttempts() {
    reconnectAttempts.value++;
  }

  /**
   * Reset reconnection attempts
   */
  function resetReconnectAttempts() {
    reconnectAttempts.value = 0;
  }

  /**
   * Clear all events
   */
  function clearEvents() {
    events.value = [];
    bufferExceeded.value = false;
  }

  /**
   * Enable or disable SSE
   */
  function setEnabled(value: boolean) {
    enabled.value = value;
  }

  /**
   * Reset store state (e.g., on logout)
   */
  function reset() {
    status.value = 'disconnected';
    events.value = [];
    lastEventId.value = null;
    errorMessage.value = null;
    lastConnectedAt.value = null;
    reconnectAttempts.value = 0;
    bufferExceeded.value = false;
    clearLocalStorage();
  }

  // ---------------------------------------------------------------------------
  // localStorage Persistence
  // ---------------------------------------------------------------------------

  /**
   * Save state to localStorage for browser refresh recovery
   */
  function saveToLocalStorage() {
    try {
      if (lastEventId.value) {
        localStorage.setItem(STORAGE_KEY_LAST_EVENT_ID, lastEventId.value);
      }
      // Only save last few events for recovery
      const eventsToSave = events.value.slice(-10);
      localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(eventsToSave));
    } catch (e) {
      console.warn('Failed to save SSE state to localStorage:', e);
    }
  }

  /**
   * Load state from localStorage
   */
  function loadFromLocalStorage() {
    try {
      const savedEventId = localStorage.getItem(STORAGE_KEY_LAST_EVENT_ID);
      if (savedEventId) {
        lastEventId.value = savedEventId;
      }

      const savedEvents = localStorage.getItem(STORAGE_KEY_EVENTS);
      if (savedEvents) {
        const parsed = JSON.parse(savedEvents) as RedfishSSEEvent[];
        events.value = parsed;
      }
    } catch (e) {
      console.warn('Failed to load SSE state from localStorage:', e);
    }
  }

  /**
   * Clear localStorage
   */
  function clearLocalStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY_LAST_EVENT_ID);
      localStorage.removeItem(STORAGE_KEY_EVENTS);
    } catch (e) {
      console.warn('Failed to clear SSE localStorage:', e);
    }
  }

  // Load from localStorage on store initialization
  loadFromLocalStorage();

  // ---------------------------------------------------------------------------
  // Return public API
  // ---------------------------------------------------------------------------

  return {
    // State
    status,
    events,
    lastEventId,
    errorMessage,
    lastConnectedAt,
    reconnectAttempts,
    enabled,
    bufferExceeded,

    // Getters
    isConnected,
    isConnecting,
    hasError,
    criticalEvents,
    warningEvents,
    latestEvent,

    // Actions
    setStatus,
    addEvent,
    handleSpecialEvent,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    clearEvents,
    setEnabled,
    reset,
    saveToLocalStorage,
    loadFromLocalStorage,
  };
});
