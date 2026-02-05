/**
 * useEventLog - Vue Query composable for Event Log management
 *
 * Provides event log data with real-time SSE updates:
 * - Fetches historical log entries via Vue Query
 * - Receives real-time updates via SSE integration
 * - Provides CRUD operations for log management
 *
 * Follows Redfish-first naming conventions.
 */
import { computed, watch, type Ref, type ComputedRef } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { apiInstance } from '@/api/mutator/axios-instance';
import { useGlobalStore } from '@/stores/global';
import { useSSEStore } from '@/stores/sse';
import { getOriginUri } from './parseSSEEvent';
import type { LogEntry } from '@/api/model/LogEntry';
import type { EventRecord } from '@/api/model/EventRecord';
import i18n from '@/i18n';

// ============================================================================
// Types - Following Redfish naming conventions (PascalCase)
// ============================================================================

// Re-export LogEntry for consumers
export type { LogEntry };

/**
 * Log collection response
 */
interface LogEntryCollection {
  '@odata.id': string;
  '@odata.type'?: string;
  Members?: LogEntry[];
  'Members@odata.count'?: number;
}

// ============================================================================
// Query Keys
// ============================================================================

export const eventLogKeys = {
  all: ['eventLog'] as const,
  entries: () => ['eventLog', 'entries'] as const,
  entry: (id: string) => ['eventLog', 'entry', id] as const,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate health status from events
 */
function getHealthStatus(events: LogEntry[], loadedEvents: boolean): string {
  let status = loadedEvents ? 'OK' : '';
  for (const event of events) {
    if (!event.Resolved) {
      if (event.Severity === 'Warning') {
        status = 'Warning';
      }
      if (event.Severity === 'Critical') {
        status = 'Critical';
        break;
      }
    }
  }
  return status;
}

/**
 * Get high priority (Critical) events
 */
function getHighPriorityEvents(events: LogEntry[]): LogEntry[] {
  return events.filter(({ Severity }) => Severity === 'Critical');
}

// ============================================================================
// Composable
// ============================================================================

export interface UseEventLogOptions {
  /**
   * Whether to enable real-time SSE updates
   * @default true
   */
  enableSSE?: boolean;
}

export interface UseEventLogReturn {
  // Data
  entries: ComputedRef<LogEntry[]>;
  highPriorityEvents: ComputedRef<LogEntry[]>;
  healthStatus: ComputedRef<string>;

  // Query state
  isLoading: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
  error: ComputedRef<Error | null>;
  isFetching: ComputedRef<boolean>;

  // SSE state
  isSSEConnected: ComputedRef<boolean>;
  SSEEvents: ComputedRef<EventRecord[]>;

  // Actions
  refetch: () => Promise<unknown>;
  deleteLog: (uri: string) => Promise<string>;
  deleteLogs: (uris: string[]) => Promise<{ type: 'success' | 'error'; message: string }[]>;
  deleteAllLogs: () => Promise<string>;
  resolveLog: (uri: string) => Promise<string>;
  resolveLogs: (entries: LogEntry[]) => Promise<{ type: 'success' | 'error'; message: string }[]>;
  unresolveLog: (uri: string) => Promise<string>;
  unresolveLogs: (entries: LogEntry[]) => Promise<{ type: 'success' | 'error'; message: string }[]>;
  updateLogStatus: (entry: { uri: string; Resolved: boolean }) => Promise<string>;
  downloadEntry: (uri: string) => Promise<Blob>;
}

export function useEventLog(options: UseEventLogOptions = {}): UseEventLogReturn {
  const { enableSSE = true } = options;

  const queryClient = useQueryClient();
  const sseStore = useSSEStore();
  const globalStore = useGlobalStore();
  const { ManagedSystemURI } = storeToRefs(globalStore);

  // -------------------------------------------------------------------------
  // Query: Fetch event log entries
  // -------------------------------------------------------------------------

  const entriesQuery = useQuery({
    queryKey: eventLogKeys.entries(),
    queryFn: async (): Promise<LogEntry[]> => {
      const systemUri = ManagedSystemURI.value;
      if (!systemUri) {
        throw new Error('System URI not available');
      }

      const url = `${systemUri}/LogServices/EventLog/Entries`;
      const response = await apiInstance<LogEntryCollection>({
        url,
        method: 'GET',
      });

      return response.Members ?? [];
    },
    enabled: computed(() => !!ManagedSystemURI.value),
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  // -------------------------------------------------------------------------
  // SSE Integration: Watch for new log events
  // -------------------------------------------------------------------------

  if (enableSSE) {
    // Watch SSE events for EventLog-related entries
    watch(
      () => sseStore.events,
      (events) => {
        if (events.length === 0) return;

        const latestEvent = events[events.length - 1];

        // Check if this is an EventLog-related event
        const OriginUri = getOriginUri(latestEvent);
        const isEventLogEvent =
          OriginUri?.includes('/LogServices/EventLog/Entries') ||
          latestEvent.MessageId?.includes('ResourceCreated') ||
          latestEvent.MessageId?.includes('ResourceRemoved');

        if (isEventLogEvent) {
          // Invalidate the query to refetch
          queryClient.invalidateQueries({ queryKey: eventLogKeys.entries() });
        }
      },
      { deep: true },
    );

    // Watch for buffer exceeded - need full refresh
    watch(
      () => sseStore.bufferExceeded,
      (exceeded) => {
        if (exceeded) {
          queryClient.invalidateQueries({ queryKey: eventLogKeys.entries() });
        }
      },
    );
  }

  // -------------------------------------------------------------------------
  // Computed: Derived data
  // -------------------------------------------------------------------------

  const entries = computed(() => entriesQuery.data.value ?? []);

  const highPriorityEvents = computed(() => getHighPriorityEvents(entries.value));

  const healthStatus = computed(() =>
    getHealthStatus(entries.value, !entriesQuery.isPending.value),
  );

  const isLoading = computed(() => entriesQuery.isPending.value);
  const isError = computed(() => entriesQuery.isError.value);
  const error = computed(() => entriesQuery.error.value);
  const isFetching = computed(() => entriesQuery.isFetching.value);

  const isSSEConnected = computed(() => sseStore.isConnected);
  const SSEEvents = computed(() => sseStore.events);

  // -------------------------------------------------------------------------
  // Mutations: CRUD operations
  // -------------------------------------------------------------------------

  /**
   * Delete a single log entry
   */
  async function deleteLog(uri: string): Promise<string> {
    await apiInstance({ url: uri, method: 'DELETE' });
    await queryClient.invalidateQueries({ queryKey: eventLogKeys.entries() });
    return i18n.global.t('pageEventLogs.toast.successDelete', 1);
  }

  /**
   * Delete multiple log entries
   */
  async function deleteLogs(uris: string[]): Promise<{ type: 'success' | 'error'; message: string }[]> {
    const results = await Promise.all(
      uris.map(async (uri) => {
        try {
          await apiInstance({ url: uri, method: 'DELETE' });
          return { success: true };
        } catch (error) {
          console.error('Failed to delete log:', uri, error);
          return { success: false };
        }
      }),
    );

    await queryClient.invalidateQueries({ queryKey: eventLogKeys.entries() });

    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.filter((r) => !r.success).length;

    const messages: { type: 'success' | 'error'; message: string }[] = [];

    if (successCount > 0) {
      messages.push({
        type: 'success',
        message: i18n.global.t('pageEventLogs.toast.successDelete', successCount),
      });
    }

    if (errorCount > 0) {
      messages.push({
        type: 'error',
        message: i18n.global.t('pageEventLogs.toast.errorDelete', errorCount),
      });
    }

    return messages;
  }

  /**
   * Delete all log entries (clear log)
   */
  async function deleteAllLogs(): Promise<string> {
    const systemUri = ManagedSystemURI.value;
    if (!systemUri) {
      throw new Error('System URI not available');
    }

    const url = `${systemUri}/LogServices/EventLog/Actions/LogService.ClearLog`;
    await apiInstance({ url, method: 'POST' });
    await queryClient.invalidateQueries({ queryKey: eventLogKeys.entries() });
    return i18n.global.t('pageEventLogs.toast.successDelete', entries.value.length);
  }

  /**
   * Resolve a single log entry
   */
  async function resolveLog(uri: string): Promise<string> {
    await apiInstance({ url: uri, method: 'PATCH', data: { Resolved: true } });
    await queryClient.invalidateQueries({ queryKey: eventLogKeys.entries() });
    return i18n.global.t('pageEventLogs.toast.successResolveLogs', 1);
  }

  /**
   * Resolve multiple log entries
   */
  async function resolveLogs(
    logEntries: LogEntry[],
  ): Promise<{ type: 'success' | 'error'; message: string }[]> {
    const results = await Promise.all(
      logEntries.map(async (log) => {
        try {
          await apiInstance({ url: log['@odata.id'], method: 'PATCH', data: { Resolved: true } });
          return { success: true };
        } catch (error) {
          console.error('Failed to resolve log:', log['@odata.id'], error);
          return { success: false };
        }
      }),
    );

    await queryClient.invalidateQueries({ queryKey: eventLogKeys.entries() });

    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.filter((r) => !r.success).length;

    const messages: { type: 'success' | 'error'; message: string }[] = [];

    if (successCount > 0) {
      messages.push({
        type: 'success',
        message: i18n.global.t('pageEventLogs.toast.successResolveLogs', successCount),
      });
    }

    if (errorCount > 0) {
      messages.push({
        type: 'error',
        message: i18n.global.t('pageEventLogs.toast.errorResolveLogs', errorCount),
      });
    }

    return messages;
  }

  /**
   * Unresolve a single log entry
   */
  async function unresolveLog(uri: string): Promise<string> {
    await apiInstance({ url: uri, method: 'PATCH', data: { Resolved: false } });
    await queryClient.invalidateQueries({ queryKey: eventLogKeys.entries() });
    return i18n.global.t('pageEventLogs.toast.successUnresolveLogs', 1);
  }

  /**
   * Unresolve multiple log entries
   */
  async function unresolveLogs(
    logEntries: LogEntry[],
  ): Promise<{ type: 'success' | 'error'; message: string }[]> {
    const results = await Promise.all(
      logEntries.map(async (log) => {
        try {
          await apiInstance({ url: log['@odata.id'], method: 'PATCH', data: { Resolved: false } });
          return { success: true };
        } catch (error) {
          console.error('Failed to unresolve log:', log['@odata.id'], error);
          return { success: false };
        }
      }),
    );

    await queryClient.invalidateQueries({ queryKey: eventLogKeys.entries() });

    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.filter((r) => !r.success).length;

    const messages: { type: 'success' | 'error'; message: string }[] = [];

    if (successCount > 0) {
      messages.push({
        type: 'success',
        message: i18n.global.t('pageEventLogs.toast.successUnresolveLogs', successCount),
      });
    }

    if (errorCount > 0) {
      messages.push({
        type: 'error',
        message: i18n.global.t('pageEventLogs.toast.errorUnresolveLogs', errorCount),
      });
    }

    return messages;
  }

  /**
   * Update a single log entry's status
   */
  async function updateLogStatus(entry: { uri: string; Resolved: boolean }): Promise<string> {
    await apiInstance({
      url: entry.uri,
      method: 'PATCH',
      data: { Resolved: entry.Resolved },
    });
    await queryClient.invalidateQueries({ queryKey: eventLogKeys.entries() });

    if (entry.Resolved) {
      return i18n.global.t('pageEventLogs.toast.successResolveLogs', 1);
    } else {
      return i18n.global.t('pageEventLogs.toast.successUnresolveLogs', 1);
    }
  }

  /**
   * Download additional data for a log entry
   */
  async function downloadEntry(uri: string): Promise<Blob> {
    const response = await apiInstance<ArrayBuffer>({
      url: uri,
      method: 'GET',
      headers: {
        Accept: 'application/octet-stream',
      },
      responseType: 'arraybuffer',
    });

    return new Blob([response], { type: 'application/octet-stream' });
  }

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    // Data
    entries,
    highPriorityEvents,
    healthStatus,

    // Query state
    isLoading,
    isError,
    error,
    isFetching,

    // SSE state
    isSSEConnected,
    SSEEvents,

    // Actions
    refetch: () => entriesQuery.refetch(),
    deleteLog,
    deleteLogs,
    deleteAllLogs,
    resolveLog,
    resolveLogs,
    unresolveLog,
    unresolveLogs,
    updateLogStatus,
    downloadEntry,
  };
}
