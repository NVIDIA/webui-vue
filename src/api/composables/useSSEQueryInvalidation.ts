/**
 * SSE Query Invalidation - Invalidate Vue Query caches based on SSE events
 *
 * Maps Redfish events to Vue Query cache keys and triggers invalidation
 * when resources change. This enables real-time UI updates without polling.
 */
import { watch, type Ref } from 'vue';
import { useQueryClient, type QueryClient } from '@tanstack/vue-query';
import type { EventRecord } from '@/api/model/EventRecord';
import { extractResourceType, matchesMessageId, getOriginUri } from './parseSSEEvent';
import { useGlobalStore } from '@/stores/global';

// ============================================================================
// Types
// ============================================================================

export interface InvalidationRule {
  /**
   * MessageId pattern to match (string for includes, RegExp for full match)
   */
  MessageIdPattern?: string | RegExp;

  /**
   * Resource types from OriginOfCondition to match
   */
  ResourceTypes?: string[];

  /**
   * Query keys to invalidate when rule matches
   */
  QueryKeys: readonly unknown[][];

  /**
   * Optional: Extract additional query key segments from event
   */
  ExtractKeys?: (Event: EventRecord) => unknown[][];
}

export interface UseSSEQueryInvalidationOptions {
  /**
   * Events to watch for invalidation (Redfish EventRecord)
   */
  Events: Ref<EventRecord[]>;

  /**
   * Custom invalidation rules (merged with defaults)
   */
  Rules?: InvalidationRule[];

  /**
   * Whether to invalidate on buffer exceeded (triggers full refresh)
   */
  onBufferExceeded?: () => void;
}

// ============================================================================
// Default Invalidation Rules
// ============================================================================

const SYSTEM_LOG_ENTRIES_RE = /\/redfish\/v1\/Systems\/[^/]+\/LogServices\/[^/]+\/Entries/i;
const CHASSIS_LOG_ENTRIES_RE = /\/redfish\/v1\/Chassis\/[^/]+\/LogServices\/[^/]+\/Entries/i;
const CHASSIS_SENSORS_RE = /\/redfish\/v1\/Chassis\/[^/]+\/Sensors/i;
const CHASSIS_THERMAL_RE = /\/redfish\/v1\/Chassis\/[^/]+\/Thermal/i;
const CHASSIS_POWER_RE = /\/redfish\/v1\/Chassis\/[^/]+\/Power/i;

/**
 * Build a query key from an OriginOfCondition URI.
 * Example: /redfish/v1/Systems/1 -> ['Systems','1']
 */
function toOriginQueryKey(origin?: string): unknown[] | null {
  if (!origin) return null;
  const path = origin.replace(/^\/redfish\/v1\//, '');
  const segments = path.split('/').filter(Boolean);
  return segments.length > 0 ? segments : null;
}

/**
 * Build a query key for the parent of an OriginOfCondition URI.
 * Example: /redfish/v1/Systems/1/LogServices/SEL/Entries
 * -> ['Systems','1','LogServices','SEL']
 */
function toOriginParentQueryKey(origin?: string): unknown[] | null {
  if (!origin) return null;
  const path = origin.replace(/^\/redfish\/v1\//, '');
  const segments = path.split('/').filter(Boolean);
  if (segments.length <= 1) return null;
  return segments.slice(0, -1);
}

/**
 * Build a query key for a collection segment within OriginOfCondition.
 * Example: /redfish/v1/Chassis/BMC/Sensors/Temp1
 * -> ['Chassis','BMC','Sensors']
 */
function toOriginCollectionQueryKey(collection: string, origin?: string): unknown[] | null {
  const key = toOriginQueryKey(origin);
  if (!key) return null;
  const parts = key.slice(0, key.length - 1);
  const idx = parts.lastIndexOf(collection);
  if (idx === -1) return null;
  return parts.slice(0, idx + 1);
}

/**
 * Default rules mapping common Redfish events to query keys.
 * Query keys should match those used in Vue Query composables.
 */
const DEFAULT_RULES: InvalidationRule[] = [
  // Sensor events - invalidate sensor queries
  {
    ResourceTypes: ['Sensors'],
    MessageIdPattern: /ResourceEvent\.\d+\.\d+\.Resource(Created|Removed|Changed)/i,
    QueryKeys: [],
    ExtractKeys: (Event) => {
      const origin = getOriginUri(Event);
      if (!origin || !CHASSIS_SENSORS_RE.test(origin)) return [];
      const key = toOriginCollectionQueryKey('Sensors', origin);
      return key ? [key] : [];
    },
  },

  // Thermal events (fans, temperatures)
  {
    ResourceTypes: ['Thermal', 'Fans', 'Temperatures'],
    QueryKeys: [],
    ExtractKeys: (Event) => {
      const origin = getOriginUri(Event);
      if (!origin || !CHASSIS_THERMAL_RE.test(origin)) return [];
      const key = toOriginCollectionQueryKey('Thermal', origin);
      return key ? [key] : [];
    },
  },

  // Power events
  {
    ResourceTypes: ['Power', 'PowerSupplies', 'Voltages'],
    QueryKeys: [],
    ExtractKeys: (Event) => {
      const origin = getOriginUri(Event);
      if (!origin || !CHASSIS_POWER_RE.test(origin)) return [];
      const key = toOriginCollectionQueryKey('Power', origin);
      return key ? [key] : [];
    },
  },

  // Event log entries - invalidate event log queries (removals only)
  {
    ResourceTypes: ['Entries', 'EventLog'],
    MessageIdPattern: /ResourceEvent\.\d+\.\d+\.ResourceRemoved/i,
    QueryKeys: [],
    ExtractKeys: (Event) => {
      const origin = getOriginUri(Event);
      if (!origin) return [];
      if (SYSTEM_LOG_ENTRIES_RE.test(origin) || CHASSIS_LOG_ENTRIES_RE.test(origin)) {
        const key = toOriginParentQueryKey(origin);
        return key ? [key] : [];
      }
      return [];
    },
  },

  // System state changes - includes managed system for power state
  {
    ResourceTypes: ['Systems'],
    MessageIdPattern: /ResourceEvent\.\d+\.\d+\.StateChanged/i,
    QueryKeys: [
      ['Systems'],
    ],
    // Dynamically get the managed system's query key
    ExtractKeys: (Event) => {
      const origin = getOriginUri(Event);
      const key = toOriginQueryKey(origin);
      return key ? [key] : [];
    },
  },

  // Chassis state changes
  {
    ResourceTypes: ['Chassis'],
    MessageIdPattern: /ResourceEvent\.\d+\.\d+\.StateChanged/i,
    QueryKeys: [
      ['Chassis'],
    ],
    ExtractKeys: (Event) => {
      const origin = getOriginUri(Event);
      const key = toOriginQueryKey(origin);
      return key ? [key] : [];
    },
  },

  // Manager/BMC state changes
  {
    ResourceTypes: ['Managers'],
    QueryKeys: [
      ['Managers'],
    ],
    ExtractKeys: (Event) => {
      const origin = getOriginUri(Event);
      const key = toOriginQueryKey(origin);
      return key ? [key] : [];
    },
  },

  // Alert/Critical events - might affect health status
  {
    MessageIdPattern: /Alert/i,
    QueryKeys: [
      ['Systems'],
      ['Chassis'],
    ],
    ExtractKeys: (Event) => {
      const origin = getOriginUri(Event);
      const key = toOriginQueryKey(origin);
      return key ? [key] : [];
    },
  },

  // Task events
  {
    ResourceTypes: ['Tasks'],
    MessageIdPattern: /TaskEvent\.\d+\.\d+\.Task/i,
    QueryKeys: [
      ['TaskService'],
      ['TaskService', 'Tasks'],
    ],
  },
];

// ============================================================================
// Composable Implementation
// ============================================================================

/**
 * Watch SSE events and invalidate Vue Query caches.
 */
export function useSSEQueryInvalidation(Options: UseSSEQueryInvalidationOptions) {
  const { Events, Rules = [], onBufferExceeded } = Options;

  const queryClient = useQueryClient();

  // Merge custom rules with defaults
  const AllRules = [...DEFAULT_RULES, ...Rules];

  // Track last processed event to avoid duplicates
  let LastProcessedEventId: string | null = null;

  // Watch for new events
  watch(
    Events,
    (NewEvents) => {
      if (NewEvents.length === 0) return;

      // Process only new events
      const LatestEvent = NewEvents[NewEvents.length - 1];
      if (LatestEvent.EventId === LastProcessedEventId) {
        return;
      }

      LastProcessedEventId = LatestEvent.EventId ?? null;

      const MessageId = LatestEvent.MessageId ?? '';

      // Skip heartbeat events - they're for connection health, not data changes
      if (MessageId.startsWith('HeartbeatEvent.')) {
        return;
      }

      // Handle EventBufferExceeded - invalidate ALL queries
      if (MessageId.endsWith('.EventBufferExceeded')) {
        console.warn('[SSE] EventBufferExceeded - invalidating all queries');
        queryClient.invalidateQueries();
        onBufferExceeded?.();
        return;
      }

      processEvent(LatestEvent, queryClient, AllRules);
    },
    { deep: true },
  );
}

/**
 * Process a single event and invalidate matching queries.
 *
 * Uses dynamic path-based invalidation (Phase 13 pattern):
 * 1. Invalidate the exact resource path from OriginOfCondition
 * 2. For add/remove events, also invalidate parent collection
 * 3. Fall back to static rules for additional invalidations
 */
function processEvent(
  Event: EventRecord,
  queryClient: QueryClient,
  Rules: InvalidationRule[],
) {
  const InvalidatedKeys = new Set<string>();

  // -------------------------------------------------------------------------
  // Dynamic path-based invalidation (primary mechanism)
  // -------------------------------------------------------------------------
  const OriginUri = getOriginUri(Event);
  if (OriginUri) {
    // Invalidate the exact resource path
    // e.g., "/redfish/v1/Chassis/BMC_0/Sensors/temp1" → ['Chassis', 'BMC_0', 'Sensors', 'temp1']
    const Path = OriginUri.replace(/^\/redfish\/v1\//, '');
    const PathSegments = Path.split('/').filter(Boolean);
    const ResourceKey = [...PathSegments];

    const KeyString = JSON.stringify(ResourceKey);
    if (!InvalidatedKeys.has(KeyString)) {
      InvalidatedKeys.add(KeyString);
      queryClient.invalidateQueries({ queryKey: ResourceKey });
    }

    // For add/remove events, also invalidate parent collection
    const MessageId = Event.MessageId ?? '';
    if (
      MessageId.includes('ResourceAdded') ||
      MessageId.includes('ResourceRemoved') ||
      MessageId.includes('ResourceCreated')
    ) {
      const ParentSegments = PathSegments.slice(0, -1);
      if (ParentSegments.length > 0) {
        const ParentKey = [...ParentSegments];
        const ParentKeyString = JSON.stringify(ParentKey);
        if (!InvalidatedKeys.has(ParentKeyString)) {
          InvalidatedKeys.add(ParentKeyString);
          queryClient.invalidateQueries({ queryKey: ParentKey });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Static rule-based invalidation (supplementary)
  // -------------------------------------------------------------------------
  const ResourceType = extractResourceType(OriginUri);

  for (const Rule of Rules) {
    if (!ruleMatches(Event, Rule, ResourceType)) {
      continue;
    }

    // Invalidate static query keys
    for (const QueryKey of Rule.QueryKeys) {
      const KeyString = JSON.stringify(QueryKey);
      if (!InvalidatedKeys.has(KeyString)) {
        InvalidatedKeys.add(KeyString);
        queryClient.invalidateQueries({ queryKey: QueryKey as unknown[] });
      }
    }

    // Invalidate dynamic query keys from rule
    if (Rule.ExtractKeys) {
      const DynamicKeys = Rule.ExtractKeys(Event);
      for (const QueryKey of DynamicKeys) {
        const KeyString = JSON.stringify(QueryKey);
        if (!InvalidatedKeys.has(KeyString)) {
          InvalidatedKeys.add(KeyString);
          queryClient.invalidateQueries({ queryKey: QueryKey });
        }
      }
    }
  }

  // Log invalidations for debugging
  if (InvalidatedKeys.size > 0 && import.meta.env.DEV) {
    console.log(
      `[SSE] Cache invalidation: ${Event.MessageId || Event.EventId} invalidated ${InvalidatedKeys.size} query keys:`,
      [...InvalidatedKeys].map((k) => JSON.parse(k)),
    );
  }
}

/**
 * Check if an event matches a rule.
 */
function ruleMatches(
  Event: EventRecord,
  Rule: InvalidationRule,
  ResourceType?: string,
): boolean {
  // Check resource type match
  if (Rule.ResourceTypes && Rule.ResourceTypes.length > 0) {
    if (!ResourceType || !Rule.ResourceTypes.includes(ResourceType)) {
      return false;
    }
  }

  // Check message ID pattern match
  if (Rule.MessageIdPattern && !matchesMessageId(Event, Rule.MessageIdPattern)) {
    return false;
  }

  return true;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Manually invalidate queries for a specific resource.
 * Useful when you know a mutation affected a resource.
 */
export function invalidateResourceQueries(
  queryClient: QueryClient,
  ResourceUri: string,
) {
  const ResourceType = extractResourceType(ResourceUri);

  // Find matching rules and invalidate
  for (const Rule of DEFAULT_RULES) {
    if (Rule.ResourceTypes?.includes(ResourceType ?? '')) {
      for (const QueryKey of Rule.QueryKeys) {
        queryClient.invalidateQueries({ queryKey: QueryKey as unknown[] });
      }
    }
  }
}

/**
 * Invalidate all SSE-related queries (used on buffer exceeded).
 */
export function invalidateAllSSEQueries(queryClient: QueryClient) {
  // Collect all unique query keys from rules
  const AllKeys = new Set<string>();

  for (const Rule of DEFAULT_RULES) {
    for (const QueryKey of Rule.QueryKeys) {
      AllKeys.add(JSON.stringify(QueryKey));
    }
  }

  // Invalidate all
  for (const KeyString of AllKeys) {
    const QueryKey = JSON.parse(KeyString) as unknown[];
    queryClient.invalidateQueries({ queryKey: QueryKey });
  }
}
