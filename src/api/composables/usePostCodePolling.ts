/**
 * usePostCodePolling - Vue composable for POST code log polling
 *
 * Polls /LogServices/PostCodes/Entries during boot with incremental
 * fetching via $skip. Driven by the global store's PowerState —
 * starts polling when the system powers on, stops when OSRunning + On
 * or when powered off.
 *
 * On reboot, the BMC does NOT clear old entries. This composable tracks
 * Members@odata.count so that after a power cycle it uses $skip to
 * fetch only entries appended after the previous boot. A dirtyCutoff
 * timestamp provides a display-side safety net.
 *
 * State is shared at module level so that multiple consumers (e.g. the
 * BootProgressBanner with polling enabled and the BootProgress page
 * with polling disabled) always see the same accumulated entries.
 */
import { ref, watch, computed, onUnmounted } from 'vue';
import { apiInstance } from '@/api/mutator/axios-instance';
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

/** Poll interval when new entries are arriving */
const POLL_FAST = 1000;
/** Poll interval when waiting for first entries after power-on */
const POLL_WAITING = 5000;
/** Max backoff during active boot (never slower than this) */
const POLL_BACKOFF_MAX = 5000;
/**
 * Number of entries to fetch from the tail on each poll when the buffer
 * is full (rotating). Sized to cover 2+ boot cycles (~85 entries each).
 */
const TAIL_SIZE = 200;

// ---------------------------------------------------------------------------
// Module-level shared state
//
// All composable instances share a single set of accumulated entries so
// that the polling instance (BootProgressBanner) and passive consumers
// (BootProgress page) always see the same data.
// ---------------------------------------------------------------------------

const accumulatedEntries = ref<LogEntry[]>([]);
const latestId = ref<string | null>(null);
const isLoading = ref(true);
const isError = ref(false);
const error = ref<Error | null>(null);
let initialFetchDone = false;
let bootstrapInProgress = false;

/**
 * The last known Members@odata.count from the Entries collection.
 * Used as $skip value to fetch only newly appended entries.
 * This is the ONLY reliable incremental fetch mechanism — the BMC's
 * $filter uses string comparison on IDs (B10 < B2 in string order),
 * making it useless for multi-digit boot counts.
 */
let lastKnownCount = 0;

/**
 * Cutoff timestamp from the last power-off cycle. Entries with
 * Created <= this value are "dirty" (from the previous boot) and
 * filtered out of CurrentBootEntries. Uses the BMC's own timestamp
 * (ISO string, sorts correctly) so there's no browser clock skew.
 *
 * This is the primary safety net — even if $skip leaks stale
 * entries, the timestamp filter catches them.
 */
let dirtyCutoff = '';

// Polling state (singleton — only one loop runs at a time)
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollInterval = POLL_WAITING;
let isPollingActive = false;
/** Tracks whether entries have started arriving in the current boot */
let entriesFlowing = false;
/** Whether the initial tail-fetch has been done for this polling session */
let tailFetchDone = false;

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
  const { enablePolling = true } = options;

  // -----------------------------------------------------------------------
  // Build entries URI from global store
  // -----------------------------------------------------------------------

  const entriesUri = computed(() => {
    const systemUri = globalStore.ManagedSystemURI;
    if (!systemUri) return null;
    return `${systemUri}/LogServices/PostCodes/Entries`;
  });

  // -----------------------------------------------------------------------
  // Bootstrap: one-time initial fetch (first-ever page load only)
  //
  // On the very first load (no latestId yet), we need all entries to
  // establish the baseline. On subsequent reboots, latestId persists
  // in module scope and $filter-based incremental fetches are used.
  // -----------------------------------------------------------------------

  async function bootstrapFetch() {
    if (initialFetchDone || bootstrapInProgress || !entriesUri.value) return;
    bootstrapInProgress = true;
    isLoading.value = true;

    try {
      const response = await apiInstance<LogEntryCollection>({
        url: entriesUri.value,
        method: 'GET',
      });

      const members = [...(response.Members ?? [])];
      accumulatedEntries.value = members;

      // Track the total count — this becomes the $skip baseline for
      // incremental fetches. New entries appended after this point
      // will be at positions > lastKnownCount.
      const count = (response as unknown as Record<string, unknown>)['Members@odata.count'] as number | undefined;
      if (typeof count === 'number') {
        lastKnownCount = count;
      } else {
        lastKnownCount = members.length;
      }

      // Track latest ID for display purposes
      const latest = getLatestPostCodeId(members);
      if (latest) latestId.value = latest;

      initialFetchDone = true;
    } catch (err) {
      console.warn('[PostCodePolling] Bootstrap fetch failed:', err);
      isError.value = true;
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      isLoading.value = false;
      bootstrapInProgress = false;
    }
  }

  // Trigger bootstrap when the URI becomes available (first load only)
  watch(entriesUri, (uri) => {
    if (uri && !initialFetchDone) {
      bootstrapFetch();
    }
  }, { immediate: true });

  // -----------------------------------------------------------------------
  // Parsed entries (reactive, derived from accumulatedEntries ref)
  // -----------------------------------------------------------------------

  const Entries = computed<PostCodeEntry[]>(() => {
    const parsed = accumulatedEntries.value
      .map((member) => parseLogEntry(member))
      .filter((entry): entry is PostCodeEntry => entry !== null)
      // Discard sentinel/padding codes (e.g. 0xFFFFFFFF) — not real POST codes
      .filter((entry) => entry.decoded.processor !== 'padding');

    return parsed;
  });

  /**
   * Entries for the current (highest) boot count only.
   * Entries created before the dirtyCutoff timestamp are excluded —
   * they belong to a previous power cycle and should not be displayed.
   */
  const CurrentBootEntries = computed<PostCodeEntry[]>(() => {
    // Filter out dirty (pre-reboot) entries by BMC timestamp
    const fresh = dirtyCutoff
      ? Entries.value.filter((e) => {
          const created = e.logEntry.Created;
          return !created || created > dirtyCutoff;
        })
      : Entries.value;
    if (fresh.length === 0) return [];

    // Find highest boot count among fresh entries
    let maxBoot = 0;
    for (const entry of fresh) {
      if (entry.bootCount > maxBoot) maxBoot = entry.bootCount;
    }

    return fresh.filter((e) => e.bootCount === maxBoot);
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
  // Incremental fetch via $skip + Members@odata.count
  //
  // The BMC's $filter uses STRING comparison on IDs (so 'B10' < 'B2'),
  // making it useless for incremental fetching once boot counts reach
  // double digits. Instead, we track Members@odata.count and use
  // $skip={lastKnownCount} to fetch only newly appended entries.
  // -----------------------------------------------------------------------

  /**
   * Helper: extract Members@odata.count from a response.
   */
  function getResponseCount(response: LogEntryCollection): number | undefined {
    return (response as unknown as Record<string, unknown>)['Members@odata.count'] as number | undefined;
  }

  /**
   * Helper: deduplicate and append new members into accumulatedEntries.
   * Returns the number of new entries added.
   */
  function appendNewEntries(members: readonly LogEntry[]): number {
    if (members.length === 0) return 0;

    // Update latest ID for display purposes
    const latest = getLatestPostCodeId(members);
    if (latest && (!latestId.value || comparePostCodeIds(latest, latestId.value) > 0)) {
      latestId.value = latest;
    }

    // Deduplicate by Id
    const existingIds = new Set(accumulatedEntries.value.map((e) => e.Id));
    const unique = members.filter((e) => e.Id && !existingIds.has(e.Id));
    if (unique.length > 0) {
      accumulatedEntries.value = [...accumulatedEntries.value, ...unique];
    }
    return unique.length;
  }

  /**
   * Fetch new entries incrementally.
   *
   * Strategy:
   *   1. Try $skip={lastKnownCount} — efficient for a growing buffer
   *      (new entries are at positions > lastKnownCount).
   *   2. If that returns empty, fall back to a tail fetch:
   *      $skip={count - TAIL_SIZE} to get the last TAIL_SIZE entries,
   *      then deduplicate client-side. This handles a full/rotating
   *      buffer where count stays constant but entries are replaced.
   *
   * Returns true if new data was found, false if empty.
   */
  async function fetchNewEntries(): Promise<boolean> {
    if (!entriesUri.value) return false;

    try {
      // Phase 1: try $skip past what we've already seen (fast path)
      const skipUrl = lastKnownCount > 0
        ? `${entriesUri.value}?$skip=${lastKnownCount}`
        : entriesUri.value;

      const response = await apiInstance<LogEntryCollection>({
        url: skipUrl,
        method: 'GET',
      });

      const count = getResponseCount(response);
      const members = response.Members ?? [];

      if (members.length > 0) {
        // Growing buffer — new entries found at the end.
        // ONLY update lastKnownCount here (when we actually got data).
        // Updating on empty responses risks jumping past entries that
        // were added between polls but returned empty due to timing.
        if (typeof count === 'number') lastKnownCount = count;
        appendNewEntries(members);
        return true;
      }

      // Phase 2: one-time tail fetch to seed the dedup set after
      // power-on. Only runs once per polling session — subsequent
      // polls rely solely on Phase 1 ($skip) for efficiency.
      // The dirtyCutoff timestamp filter handles display correctness
      // regardless of what old entries leak into accumulatedEntries.
      if (!tailFetchDone && lastKnownCount > 0 && typeof count === 'number' && count > 0) {
        tailFetchDone = true;
        const tailSkip = Math.max(0, count - TAIL_SIZE);
        const tailResponse = await apiInstance<LogEntryCollection>({
          url: `${entriesUri.value}?$skip=${tailSkip}`,
          method: 'GET',
        });

        const tailMembers = tailResponse.Members ?? [];
        appendNewEntries(tailMembers);
        // Don't return true — old entries in the tail shouldn't
        // trigger "entriesFlowing" mode or affect poll cadence.
      }

      return false;
    } catch (err) {
      console.warn('[PostCodePolling] Incremental fetch failed:', err);
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Polling control: PowerState-driven
  //
  // Power Off / PoweringOff:
  //   Save latestId (baseline for next boot), clear entries, stop polling.
  //
  // PoweringOn / On (not yet OSRunning):
  //   Poll at POLL_WAITING (5s). When entries arrive, switch to POLL_FAST
  //   (1s) with linear backoff (+1s per empty) capped at POLL_BACKOFF_MAX.
  //
  // On + OSRunning:
  //   Stop polling — boot is complete.
  // -----------------------------------------------------------------------

  if (enablePolling) {
    async function pollLoop() {
      if (!isPollingActive) return;

      const hasNew = await fetchNewEntries();

      if (hasNew) {
        // New data arrived — poll fast
        entriesFlowing = true;
        isLoading.value = false;
        pollInterval = POLL_FAST;
      } else if (entriesFlowing) {
        // Was receiving data but got an empty response — linear backoff
        pollInterval = Math.min(pollInterval + 1000, POLL_BACKOFF_MAX);
      }
      // If !entriesFlowing and no data yet, stay at POLL_WAITING

      if (isPollingActive) {
        pollTimer = setTimeout(pollLoop, pollInterval);
      }
    }

    function startPolling() {
      if (isPollingActive) return;
      console.log('[PostCodePolling] Polling started');
      isPollingActive = true;
      entriesFlowing = false;
      tailFetchDone = false;
      pollInterval = POLL_WAITING;
      isLoading.value = true;
      // Fire first poll immediately, then POLL_WAITING between subsequent empty polls
      pollTimer = setTimeout(pollLoop, 0);
    }

    function stopPolling() {
      if (!isPollingActive) return;
      console.log('[PostCodePolling] Polling stopped');
      isPollingActive = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      // One final fetch to capture any trailing entries
      fetchNewEntries();
    }

    /**
     * Handle power-off: save the current entry count as the $skip
     * baseline, then clear entries so the UI resets.
     *
     * On the next power-on, fetchNewEntries will use
     * $skip={lastKnownCount} to get only entries appended after this
     * point — no old boot data leaks through.
     *
     * Does one final fetch to update the count to the true latest
     * before saving the baseline.
     */
    async function handlePowerOff() {
      stopPolling();

      // Do one final incremental fetch to update lastKnownCount
      if (entriesUri.value) {
        try {
          await fetchNewEntries();
        } catch {
          // If fetch fails (system shutting down), keep what we have
        }
      }

      // Mark all current entries as dirty using the BMC timestamp of
      // the newest entry. Entries created after this timestamp belong
      // to the next boot and will pass the filter.
      const allEntries = accumulatedEntries.value;
      let maxTimestamp = '';
      for (const entry of allEntries) {
        const created = entry.Created;
        if (created && created > maxTimestamp) {
          maxTimestamp = created;
        }
      }
      if (maxTimestamp) {
        dirtyCutoff = maxTimestamp;
      }

      console.log(
        '[PostCodePolling] Power off — cutoff:',
        dirtyCutoff,
        'baseline skip:',
        lastKnownCount,
      );
      // Clear the displayed entries but keep lastKnownCount and
      // dirtyCutoff intact for the next power-on cycle.
      accumulatedEntries.value = [];
      isLoading.value = false;
    }

    /**
     * Handle power-on: start polling for new entries using $skip
     * from the saved lastKnownCount baseline.
     */
    function handlePowerOn() {
      console.log(
        '[PostCodePolling] Power on — polling from skip:',
        lastKnownCount,
      );
      // If we've never fetched (no latestId), do a bootstrap first
      if (!latestId.value && !initialFetchDone) {
        bootstrapFetch();
      }
      startPolling();
    }

    // Watch PowerState to drive polling lifecycle
    watch(
      () => globalStore.PowerState,
      (power, prevPower) => {
        // PowerState not known yet (ManagedSystem hasn't loaded) — wait
        if (!power) return;

        const isOff = power === 'Off' || power === 'PoweringOff';
        const wasOff = prevPower === 'Off' || prevPower === 'PoweringOff';

        if (isOff) {
          handlePowerOff();
          return;
        }

        // First run (page load / HMR): if system is already stable
        // (On + OSRunning), just bootstrap to show existing data — don't poll.
        if (prevPower === undefined) {
          const boot = globalStore.BootProgressState;
          if (power === 'On' && boot === 'OSRunning') {
            if (!initialFetchDone) bootstrapFetch();
            return;
          }
        }

        // Transition from off/poweringOff → anything else: start polling
        if (wasOff || prevPower === undefined) {
          handlePowerOn();
          return;
        }
      },
      { immediate: true },
    );

    // Stop polling when boot completes (OSRunning + On).
    // immediate: true so it catches the already-stable case on mount.
    watch(
      [() => globalStore.PowerState, () => globalStore.BootProgressState],
      ([power, boot]) => {
        if (power === 'On' && boot === 'OSRunning' && isPollingActive) {
          console.log('[PostCodePolling] Boot complete (OSRunning + On) — stopping');
          stopPolling();
          isLoading.value = false;
        }
      },
      { immediate: true },
    );

    onUnmounted(() => {
      isPollingActive = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    });
  }

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
