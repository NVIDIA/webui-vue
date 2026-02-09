/**
 * usePostCodePolling - Vue Query composable for POST code log polling
 *
 * Polls /LogServices/PostCodes/Entries during boot with incremental
 * fetching via $filter (when supported). Driven by the global store's
 * IsBooting reactive state.
 *
 * Pattern modeled after useEventLog.ts fetchNewEntries().
 */
import { ref, watch, computed, onUnmounted } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { apiInstance } from '@/api/mutator/axios-instance';
import { checkFilterSupport } from './useRedfishCollection';
import { useGlobalStore } from '@/stores/global';
import type { LogEntry } from '@/api/model/LogEntry';
import type { LogEntryCollection } from '@/api/model/LogEntryCollection';
import {
  decodePostCode,
  comparePostCodeIds,
  type DecodedPostCode,
} from '@/utilities/PostCodeDecoder';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed POST code entry — extends the Redfish LogEntry with decoded fields. */
export interface PostCodeEntry {
  /** The original Redfish LogEntry */
  logEntry: LogEntry;
  /** Boot count parsed from MessageArgs[0] */
  bootCount: number;
  /** Time stamp offset in seconds from MessageArgs[1] */
  timeOffset: number;
  /** Raw hex POST code from MessageArgs[2] */
  hexCode: string;
  /** Decoded processor/type/label info */
  decoded: DecodedPostCode;
}

export interface UsePostCodePollingOptions {
  /**
   * Enable adaptive polling for new POST code entries.
   * Use false for secondary consumers to avoid duplicate loops.
   * @default true
   */
  enablePolling?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_FAST = 1000; // 1s when new entries are arriving
const POLL_INTERVAL_MAX = 15000; // 15s ceiling after backoff
const POLL_BACKOFF_FACTOR = 2; // double interval on each empty response

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Redfish LogEntry into a PostCodeEntry with decoded fields.
 */
function parseLogEntry(entry: LogEntry): PostCodeEntry | null {
  const MessageArgs = entry.MessageArgs;
  if (!MessageArgs || MessageArgs.length < 3) return null;
  if (!entry.Id) return null;

  return {
    logEntry: entry,
    bootCount: parseInt(MessageArgs[0], 10) || 0,
    timeOffset: parseFloat(MessageArgs[1]) || 0,
    hexCode: MessageArgs[2],
    decoded: decodePostCode(MessageArgs[2]),
  };
}

/**
 * Get the newest (largest) POST code Id from raw entries.
 */
function getLatestPostCodeId(entries: ReadonlyArray<{ Id?: string }>): string | null {
  const ids = entries.map((entry) => entry.Id).filter((id): id is string => !!id);
  if (ids.length === 0) return null;

  let latest = ids[0];
  for (let i = 1; i < ids.length; i++) {
    if (comparePostCodeIds(ids[i], latest) > 0) {
      latest = ids[i];
    }
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function usePostCodePolling(options: UsePostCodePollingOptions = {}) {
  const globalStore = useGlobalStore();
  const queryClient = useQueryClient();
  const { enablePolling = true } = options;

  const latestId = ref<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollInterval = POLL_INTERVAL_FAST;

  // -----------------------------------------------------------------------
  // Build entries URI from global store
  // -----------------------------------------------------------------------

  const entriesUri = computed(() => {
    const systemUri = globalStore.ManagedSystemURI;
    if (!systemUri) return null;
    return `${systemUri}/LogServices/PostCodes/Entries`;
  });

  // -----------------------------------------------------------------------
  // Initial fetch: get all entries
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // Accumulated entries — owned by this ref, NOT by Vue Query cache.
  //
  // Vue Query is only used for the initial bootstrap fetch. After that,
  // fetchNewEntries() appends directly into this ref. This avoids Vue
  // Query cache replacement issues (stale refetch, query key changes,
  // multiple composable instances sharing the same key, etc.).
  // -----------------------------------------------------------------------

  const accumulatedEntries = ref<LogEntry[]>([]);
  const isLoading = ref(true);
  const isError = ref(false);
  const error = ref<Error | null>(null);
  let initialFetchDone = false;

  /**
   * One-time bootstrap: fetch the initial page of entries.
   */
  async function bootstrapFetch() {
    if (initialFetchDone || !entriesUri.value) return;
    isLoading.value = true;

    try {
      const response = await apiInstance<LogEntryCollection>({
        url: entriesUri.value,
        method: 'GET',
      });

      const members = [...(response.Members ?? [])];
      accumulatedEntries.value = members;

      // Track latest ID for incremental fetches
      const latest = getLatestPostCodeId(members);
      if (latest) latestId.value = latest;

      initialFetchDone = true;
    } catch (err) {
      console.warn('[PostCodePolling] Bootstrap fetch failed:', err);
      isError.value = true;
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      isLoading.value = false;
    }
  }

  // Trigger bootstrap when the URI becomes available
  watch(entriesUri, (uri) => {
    if (uri && !initialFetchDone) {
      bootstrapFetch();
    }
  }, { immediate: true });

  // -----------------------------------------------------------------------
  // Parsed entries (reactive, derived from accumulatedEntries ref)
  // -----------------------------------------------------------------------

  const Entries = computed<PostCodeEntry[]>(() =>
    accumulatedEntries.value
      .map((member) => parseLogEntry(member))
      .filter((entry): entry is PostCodeEntry => entry !== null),
  );

  /**
   * Entries for the current (highest) boot count only.
   */
  const CurrentBootEntries = computed<PostCodeEntry[]>(() => {
    const all = Entries.value;
    if (all.length === 0) return [];

    // Find highest boot count
    let maxBoot = 0;
    for (const entry of all) {
      if (entry.bootCount > maxBoot) maxBoot = entry.bootCount;
    }

    return all.filter((e) => e.bootCount === maxBoot);
  });

  /**
   * Current boot count (highest seen).
   */
  const CurrentBootCount = computed(() => {
    const all = Entries.value;
    if (all.length === 0) return 0;
    let max = 0;
    for (const entry of all) {
      if (entry.bootCount > max) max = entry.bootCount;
    }
    return max;
  });

  // -----------------------------------------------------------------------
  // Incremental tail fetch (modeled after useEventLog.ts:276-278)
  // -----------------------------------------------------------------------

  /**
   * Fetch new entries incrementally. Returns true if new data was found,
   * false if the response was empty (signals the polling loop to back off).
   */
  async function fetchNewEntries(): Promise<boolean> {
    if (!entriesUri.value) return false;

    try {
      const canFilter = await checkFilterSupport(queryClient);

      // Without $filter support, incremental fetching isn't possible —
      // the base URL returns paginated results that could be incomplete.
      if (!canFilter || !latestId.value) return false;

      const url = `${entriesUri.value}?$filter=Id gt '${latestId.value}'`;

      const response = await apiInstance<LogEntryCollection>({
        url,
        method: 'GET',
      });

      const newMembers = response.Members ?? [];
      if (newMembers.length === 0) return false;

      // Update latest ID
      const latest = getLatestPostCodeId(newMembers);
      if (latest && (!latestId.value || comparePostCodeIds(latest, latestId.value) > 0)) {
        latestId.value = latest;
      }

      // Append into our ref (deduplicate by Id)
      const existingIds = new Set(accumulatedEntries.value.map((e) => e.Id));
      const unique = newMembers.filter((e) => e.Id && !existingIds.has(e.Id));
      if (unique.length > 0) {
        accumulatedEntries.value = [...accumulatedEntries.value, ...unique];
      }

      return true;
    } catch (err) {
      console.warn('[PostCodePolling] Incremental fetch failed:', err);
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Polling control: adaptive backoff driven by globalStore.IsBooting
  //
  // Starts at POLL_INTERVAL_FAST (1s). When fetchNewEntries() returns
  // empty (no new data), the interval doubles up to POLL_INTERVAL_MAX.
  // When new data arrives, the interval resets to POLL_INTERVAL_FAST.
  // -----------------------------------------------------------------------

  let isPollingActive = false;

  async function pollLoop() {
    if (!isPollingActive) return;

    const hasNew = await fetchNewEntries();

    if (hasNew) {
      // New data arrived — poll fast
      pollInterval = POLL_INTERVAL_FAST;
    } else {
      // Empty response — back off
      pollInterval = Math.min(pollInterval * POLL_BACKOFF_FACTOR, POLL_INTERVAL_MAX);
    }

    if (isPollingActive) {
      pollTimer = setTimeout(pollLoop, pollInterval);
    }
  }

  function startPolling() {
    if (isPollingActive) return;
    isPollingActive = true;
    pollInterval = POLL_INTERVAL_FAST;
    // Start immediately
    pollTimer = setTimeout(pollLoop, 0);
  }

  function stopPolling() {
    isPollingActive = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    // One final fetch to capture any trailing entries
    fetchNewEntries();
  }

  if (enablePolling) {
    watch(
      () => globalStore.IsBooting,
      (booting) => {
        if (booting) {
          startPolling();
        } else {
          stopPolling();
        }
      },
      { immediate: true },
    );
  }

  // Detect new boot cycle: when boot count jumps, reset accumulated
  // entries and re-bootstrap to get the new boot's entries
  watch(CurrentBootCount, (newCount, oldCount) => {
    if (oldCount && newCount > oldCount) {
      accumulatedEntries.value = [];
      latestId.value = null;
      pollInterval = POLL_INTERVAL_FAST;
      initialFetchDone = false;
      bootstrapFetch();
    }
  });

  onUnmounted(() => {
    isPollingActive = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  });

  // -----------------------------------------------------------------------
  // Return
  // -----------------------------------------------------------------------

  return {
    /** All POST code entries (all boot counts) */
    Entries,
    /** POST code entries for the current (latest) boot only */
    CurrentBootEntries,
    /** Current (highest) boot count */
    CurrentBootCount,
    /** Latest entry ID seen */
    LatestId: latestId,
    /** Loading state */
    isLoading: computed(() => isLoading.value),
    /** Error state */
    isError: computed(() => isError.value),
    /** Error object */
    error: computed(() => error.value),
    /** Manual re-bootstrap */
    refetch: bootstrapFetch,
  };
}
