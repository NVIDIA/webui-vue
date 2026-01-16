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
import { useMutation, useQueryClient, useQueries } from '@tanstack/vue-query';
import { apiInstance } from '@/api/mutator/axios-instance';
import { useSSEStore } from '@/stores/sse';
import { getOriginUri } from './parseSSEEvent';
import type { LogEntry } from '@/api/model/LogEntry';
import type { LogEntryCollection } from '@/api/model/LogEntryCollection';
import type { LogServiceCollection } from '@/api/model/LogServiceCollection';
import type { EventRecord } from '@/api/model/EventRecord';
import {
  useGetSystems,
  getGetSystemLogServicesQueryOptions,
  getGetSystemLogServiceEntriesQueryOptions,
  getGetSystemLogServiceEntriesQueryKey,
} from '@/api/endpoints/redfish.gen';
import i18n from '@/i18n';

// ============================================================================
// Types - Following Redfish naming conventions (PascalCase)
// ============================================================================

// Re-export LogEntry for consumers
export type { LogEntry };


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

/**
 * Get the newest (largest) log Id from cache.
 */
function getLatestLogId(events: LogEntry[]): string | null {
  if (!events.length) return null;

  let latestId: string | null = null;
  let latestNumeric = Number.NEGATIVE_INFINITY;
  let hasNumeric = false;

  for (const event of events) {
    const id = event.Id;
    if (!id) continue;
    const numeric = Number(id);
    if (!Number.isNaN(numeric)) {
      hasNumeric = true;
      if (numeric > latestNumeric) {
        latestNumeric = numeric;
        latestId = id;
      }
    } else if (!hasNumeric) {
      latestId = id;
    }
  }

  return latestId;
}

function extractIdFromUri(uri?: string): string | null {
  if (!uri) return null;
  const parts = uri.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

function getEventLogServiceIds(collection: LogServiceCollection | undefined): string[] {
  const members = collection?.Members ?? [];
  return members
    .map((member) => extractIdFromUri(member['@odata.id']))
    .filter((id): id is string => !!id && id === 'EventLog');
}

function getEntriesUri(systemId: string, logServiceId: string): string {
  return `/redfish/v1/Systems/${encodeURIComponent(systemId)}/LogServices/${encodeURIComponent(logServiceId)}/Entries`;
}

type QueryResult<T> = Record<string, unknown>;

function normalizeQueries<T>(queries: unknown): QueryResult<T>[] {
  if (Array.isArray(queries)) return queries as QueryResult<T>[];
  const maybeRef = queries as { value?: QueryResult<T>[] };
  return Array.isArray(maybeRef.value) ? maybeRef.value : [];
}

function unwrapRefValue<T>(value: T | Ref<T | undefined> | undefined): T | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && 'value' in (value as object)) {
    return (value as Ref<T>).value;
  }
  return value as T;
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

  // -------------------------------------------------------------------------
  // Query: Fetch system log services + entries (endpoint keys)
  // -------------------------------------------------------------------------

  const systemsQuery = useGetSystems({
    query: {
      staleTime: 30 * 1000,
    },
  });

  const systemIds = computed(() => {
    const members = systemsQuery.data.value?.Members ?? [];
    return members
      .map((member) => extractIdFromUri(member['@odata.id']))
      .filter((id): id is string => !!id);
  });

  const logServicesQueries = useQueries({
    queries: computed(() =>
      systemIds.value.map((systemId) =>
        getGetSystemLogServicesQueryOptions(systemId, {
          query: { staleTime: 30 * 1000 },
        }),
      ),
    ),
  });

  const logServicesResults = computed(() =>
    normalizeQueries<LogServiceCollection>(logServicesQueries),
  );

  const entryTargets = computed(() => {
    const targets: { systemId: string; logServiceId: string }[] = [];
    const results = logServicesResults.value;

    if (results.length < systemIds.value.length) {
      return targets;
    }

    const hasPending = results.some((q) =>
      unwrapRefValue<boolean>(q.isPending as Ref<boolean> | boolean),
    );
    if (hasPending) {
      return targets;
    }

    systemIds.value.forEach((systemId, index) => {
      const collection = unwrapRefValue<LogServiceCollection>(
        results[index]?.data as Ref<LogServiceCollection | undefined> | LogServiceCollection | undefined,
      );
      const logServiceIds = getEventLogServiceIds(collection);
      for (const logServiceId of logServiceIds) {
        targets.push({ systemId, logServiceId });
      }
    });

    return targets;
  });

  const entriesQueries = useQueries({
    queries: computed(() =>
      entryTargets.value.map((target) =>
        getGetSystemLogServiceEntriesQueryOptions(
          target.systemId,
          target.logServiceId,
          {
            query: {
              staleTime: 30 * 1000,
              refetchOnWindowFocus: true,
            },
          },
        ),
      ),
    ),
  });

  const entriesResults = computed(() =>
    normalizeQueries<LogEntryCollection>(entriesQueries),
  );

  // -------------------------------------------------------------------------
  // SSE Integration: Watch for new log events
  // -------------------------------------------------------------------------

  if (enableSSE) {
    const fetchNewEntries = async () => {
      const targets = entryTargets.value;
      if (targets.length === 0) {
        invalidateEntryQueries();
        return;
      }

      try {
        await Promise.all(
          targets.map(async (target) => {
            const queryKey = getGetSystemLogServiceEntriesQueryKey(
              target.systemId,
              target.logServiceId,
            );
            const currentCollection = queryClient.getQueryData<LogEntryCollection>(queryKey);
            const currentEntries = Array.from(currentCollection?.Members ?? []);
            const latestId = getLatestLogId(currentEntries);
            const url = latestId
              ? `${getEntriesUri(target.systemId, target.logServiceId)}?$filter=Id gt '${latestId}'`
              : getEntriesUri(target.systemId, target.logServiceId);
            const response = await apiInstance<LogEntryCollection>({
              url,
              method: 'GET',
            });

            const newEntries = Array.from(response.Members ?? []);
            if (newEntries.length === 0) return;

            const existingIds = new Set(currentEntries.map((entry) => entry['@odata.id']));
            const merged = [...currentEntries];
            for (const entry of newEntries) {
              const id = entry['@odata.id'];
              if (id && existingIds.has(id)) continue;
              if (id) existingIds.add(id);
              merged.push(entry);
            }

            queryClient.setQueryData<LogEntryCollection>(queryKey, (old) => ({
              ...(old ?? response),
              Members: merged,
              'Members@odata.count': merged.length,
            }));
          }),
        );
      } catch (error) {
        console.warn('[EventLog] Tail fetch failed, falling back to refetch:', error);
        invalidateEntryQueries();
      }
    };

    // Watch SSE events for EventLog-related entries
    watch(
      () => sseStore.events,
      (events) => {
        if (events.length === 0) return;

        const latestEvent = events[events.length - 1];

        // Check if this is an EventLog-related event
        const OriginUri = getOriginUri(latestEvent);
        const isEventLogEvent =
          OriginUri?.includes('/LogServices/EventLog/Entries');

        if (isEventLogEvent) {
          if (latestEvent.MessageId?.includes('ResourceRemoved')) {
            invalidateEntryQueries();
          } else {
            fetchNewEntries();
          }
        }
      },
      { deep: true },
    );

    // Watch for buffer exceeded - need full refresh
    watch(
      () => sseStore.bufferExceeded,
      (exceeded) => {
        if (exceeded) {
          invalidateEntryQueries();
        }
      },
    );
  }

  // -------------------------------------------------------------------------
  // Computed: Derived data
  // -------------------------------------------------------------------------

  const entries = computed(() => {
    if (entriesResults.value.length < entryTargets.value.length) {
      return [] as LogEntry[];
    }
    const hasPending = entriesResults.value.some((q) =>
      unwrapRefValue<boolean>(q.isPending as Ref<boolean> | boolean),
    );
    if (hasPending) {
      return [] as LogEntry[];
    }

    const merged: LogEntry[] = [];
    const seen = new Set<string>();
    for (const result of entriesResults.value) {
      const collection = unwrapRefValue<LogEntryCollection>(
        result.data as Ref<LogEntryCollection | undefined> | LogEntryCollection | undefined,
      );
      const members = Array.from(collection?.Members ?? []);
      for (const entry of members) {
        const id = entry['@odata.id'];
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        merged.push(entry);
      }
    }
    return merged;
  });

  const highPriorityEvents = computed(() => getHighPriorityEvents(entries.value));

  const isLoading = computed(() =>
    systemsQuery.isPending.value ||
    logServicesResults.value.some((q) => unwrapRefValue<boolean>(q.isPending as Ref<boolean> | boolean)) ||
    entriesResults.value.some((q) => unwrapRefValue<boolean>(q.isPending as Ref<boolean> | boolean)),
  );
  const isError = computed(() =>
    systemsQuery.isError.value ||
    logServicesResults.value.some((q) => unwrapRefValue<boolean>(q.isError as Ref<boolean> | boolean)) ||
    entriesResults.value.some((q) => unwrapRefValue<boolean>(q.isError as Ref<boolean> | boolean)),
  );
  const error = computed<Error | null>(() => {
    const rawError =
      systemsQuery.error.value ||
      unwrapRefValue<Error | null>(logServicesResults.value.find((q) =>
        unwrapRefValue<boolean>(q.isError as Ref<boolean> | boolean),
      )?.error as Ref<Error | null> | Error | null) ||
      unwrapRefValue<Error | null>(entriesResults.value.find((q) =>
        unwrapRefValue<boolean>(q.isError as Ref<boolean> | boolean),
      )?.error as Ref<Error | null> | Error | null) ||
      null;

    if (!rawError) return null;
    if (rawError instanceof Error) return rawError;
    const message =
      (rawError as { message?: string }).message ?? 'Unknown error';
    return new Error(message);
  });
  const isFetching = computed(() =>
    systemsQuery.isFetching.value ||
    logServicesResults.value.some((q) => unwrapRefValue<boolean>(q.isFetching as Ref<boolean> | boolean)) ||
    entriesResults.value.some((q) => unwrapRefValue<boolean>(q.isFetching as Ref<boolean> | boolean)),
  );

  const healthStatus = computed(() =>
    getHealthStatus(entries.value, !isLoading.value),
  );

  const isSSEConnected = computed(() => sseStore.isConnected);
  const SSEEvents = computed(() => sseStore.events);

  // -------------------------------------------------------------------------
  // Mutations: CRUD operations
  // -------------------------------------------------------------------------

  function invalidateEntryQueries() {
    for (const target of entryTargets.value) {
      const queryKey = getGetSystemLogServiceEntriesQueryKey(
        target.systemId,
        target.logServiceId,
      );
      queryClient.invalidateQueries({ queryKey });
    }
  }

  /**
   * Delete a single log entry
   */
  async function deleteLog(uri: string): Promise<string> {
    await apiInstance({ url: uri, method: 'DELETE' });
    invalidateEntryQueries();
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

    invalidateEntryQueries();

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
    const targets = entryTargets.value;
    if (targets.length === 0) {
      throw new Error('EventLog entries not available');
    }

    await Promise.all(
      targets.map((target) => {
        const base = getEntriesUri(target.systemId, target.logServiceId)
          .replace(/\/Entries\/?$/, '');
        const url = `${base}/Actions/LogService.ClearLog`;
        return apiInstance({ url, method: 'POST' });
      }),
    );
    invalidateEntryQueries();
    return i18n.global.t('pageEventLogs.toast.successDelete', entries.value.length);
  }

  /**
   * Resolve a single log entry
   */
  async function resolveLog(uri: string): Promise<string> {
    await apiInstance({ url: uri, method: 'PATCH', data: { Resolved: true } });
    invalidateEntryQueries();
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

    invalidateEntryQueries();

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
    invalidateEntryQueries();
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

    invalidateEntryQueries();

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
    invalidateEntryQueries();

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
    refetch: async () => {
      invalidateEntryQueries();
      return Promise.resolve();
    },
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
