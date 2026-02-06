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

/**
 * Default rules mapping common Redfish events to query keys.
 * Query keys should match those used in Vue Query composables.
 */
const DEFAULT_RULES: InvalidationRule[] = [
  // Sensor events - invalidate sensor queries
  {
    ResourceTypes: ['Sensors'],
    MessageIdPattern: /ResourceEvent\.\d+\.\d+\.Resource(Created|Removed|Changed)/i,
    QueryKeys: [
      ['redfish', 'allSubResources', '/redfish/v1/Chassis', 'Sensors'],
    ],
  },

  // Thermal events (fans, temperatures)
  {
    ResourceTypes: ['Thermal', 'Fans', 'Temperatures'],
    QueryKeys: [
      ['redfish', 'allSubResources', '/redfish/v1/Chassis', 'Thermal'],
    ],
  },

  // Power events
  {
    ResourceTypes: ['Power', 'PowerSupplies', 'Voltages'],
    QueryKeys: [
      ['redfish', 'allSubResources', '/redfish/v1/Chassis', 'Power'],
    ],
  },

  // Event log entries - invalidate event log queries
  {
    ResourceTypes: ['Entries', 'EventLog'],
    MessageIdPattern: /ResourceEvent\.\d+\.\d+\.Resource(Created|Removed)/i,
    QueryKeys: [
      ['eventLog'],
      ['redfish', 'logEntries'],
    ],
  },

  // System state changes - includes managed system for power state
  {
    ResourceTypes: ['Systems'],
    MessageIdPattern: /ResourceEvent\.\d+\.\d+\.StateChanged/i,
    QueryKeys: [
      ['redfish', 'system'],
      ['redfish', 'systems'],
    ],
    // Dynamically get the managed system's query key
    ExtractKeys: () => {
      const globalStore = useGlobalStore();
      const SystemId = globalStore.SystemId;
      if (SystemId) {
        return [['getSystemsById', SystemId]];
      }
      return [];
    },
  },

  // Chassis state changes
  {
    ResourceTypes: ['Chassis'],
    MessageIdPattern: /ResourceEvent\.\d+\.\d+\.StateChanged/i,
    QueryKeys: [
      ['redfish', 'chassis'],
      ['redfish', 'allSubResources', '/redfish/v1/Chassis'],
    ],
  },

  // Manager/BMC state changes
  {
    ResourceTypes: ['Managers'],
    QueryKeys: [
      ['redfish', 'managers'],
      ['redfish', 'bmc'],
    ],
  },

  // Alert/Critical events - might affect health status
  {
    MessageIdPattern: /Alert/i,
    QueryKeys: [
      ['health'],
      ['eventLog'],
    ],
  },

  // Task events
  {
    ResourceTypes: ['Tasks'],
    MessageIdPattern: /TaskEvent\.\d+\.\d+\.Task/i,
    QueryKeys: [
      ['redfish', 'tasks'],
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
    // e.g., "/redfish/v1/Chassis/BMC_0/Sensors/temp1" → ['redfish', 'v1', 'Chassis', 'BMC_0', 'Sensors', 'temp1']
    const Path = OriginUri.replace(/^\/redfish\/v1\//, '');
    const PathSegments = Path.split('/').filter(Boolean);
    const ResourceKey = ['redfish', 'v1', ...PathSegments];

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
        const ParentKey = ['redfish', 'v1', ...ParentSegments];
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
      // Resource type specified but doesn't match
      if (!Rule.MessageIdPattern) {
        return false;
      }
    }
  }

  // Check message ID pattern match
  if (Rule.MessageIdPattern) {
    if (!matchesMessageId(Event, Rule.MessageIdPattern)) {
      // If resource types also specified and matched, allow it
      if (Rule.ResourceTypes && ResourceType && Rule.ResourceTypes.includes(ResourceType)) {
        return true;
      }
      return false;
    }
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
