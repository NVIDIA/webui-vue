/**
 * SSE Query Invalidation - Invalidate Vue Query caches based on SSE events
 *
 * Maps Redfish events to Vue Query cache keys and triggers invalidation
 * when resources change. This enables real-time UI updates without polling.
 */
import { watch, type Ref } from 'vue';
import { useQueryClient, type QueryClient } from '@tanstack/vue-query';
import type { RedfishSSEEvent } from '@/stores/sse';
import { extractResourceType, matchesMessageId } from './parseSSEEvent';
import { managedSystemKeys } from './useManagedSystem';

// ============================================================================
// Types
// ============================================================================

export interface InvalidationRule {
  /**
   * MessageId pattern to match (string for includes, RegExp for full match)
   */
  messageIdPattern?: string | RegExp;

  /**
   * Resource types from OriginOfCondition to match
   */
  resourceTypes?: string[];

  /**
   * Query keys to invalidate when rule matches
   */
  queryKeys: readonly unknown[][];

  /**
   * Optional: Extract additional query key segments from event
   */
  extractKeys?: (event: RedfishSSEEvent) => unknown[][];
}

export interface UseSSEQueryInvalidationOptions {
  /**
   * Events to watch for invalidation
   */
  events: Ref<RedfishSSEEvent[]>;

  /**
   * Custom invalidation rules (merged with defaults)
   */
  rules?: InvalidationRule[];

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
    resourceTypes: ['Sensors'],
    messageIdPattern: /ResourceEvent\.\d+\.\d+\.Resource(Created|Removed|Changed)/i,
    queryKeys: [
      ['redfish', 'allSubResources', '/redfish/v1/Chassis', 'Sensors'],
    ],
  },

  // Thermal events (fans, temperatures)
  {
    resourceTypes: ['Thermal', 'Fans', 'Temperatures'],
    queryKeys: [
      ['redfish', 'allSubResources', '/redfish/v1/Chassis', 'Thermal'],
    ],
  },

  // Power events
  {
    resourceTypes: ['Power', 'PowerSupplies', 'Voltages'],
    queryKeys: [
      ['redfish', 'allSubResources', '/redfish/v1/Chassis', 'Power'],
    ],
  },

  // Event log entries - invalidate event log queries
  {
    resourceTypes: ['Entries', 'EventLog'],
    messageIdPattern: /ResourceEvent\.\d+\.\d+\.Resource(Created|Removed)/i,
    queryKeys: [
      ['eventLog'],
      ['redfish', 'logEntries'],
    ],
  },

  // System state changes - includes managed system for power state
  {
    resourceTypes: ['Systems'],
    messageIdPattern: /ResourceEvent\.\d+\.\d+\.StateChanged/i,
    queryKeys: [
      ['redfish', 'system'],
      ['redfish', 'systems'],
      managedSystemKeys.system(),
    ],
  },

  // Chassis state changes
  {
    resourceTypes: ['Chassis'],
    messageIdPattern: /ResourceEvent\.\d+\.\d+\.StateChanged/i,
    queryKeys: [
      ['redfish', 'chassis'],
      ['redfish', 'allSubResources', '/redfish/v1/Chassis'],
    ],
  },

  // Manager/BMC state changes
  {
    resourceTypes: ['Managers'],
    queryKeys: [
      ['redfish', 'managers'],
      ['redfish', 'bmc'],
    ],
  },

  // Alert/Critical events - might affect health status
  {
    messageIdPattern: /Alert/i,
    queryKeys: [
      ['health'],
      ['eventLog'],
    ],
  },

  // Task events
  {
    resourceTypes: ['Tasks'],
    messageIdPattern: /TaskEvent\.\d+\.\d+\.Task/i,
    queryKeys: [
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
export function useSSEQueryInvalidation(options: UseSSEQueryInvalidationOptions) {
  const { events, rules = [], onBufferExceeded } = options;

  const queryClient = useQueryClient();

  // Merge custom rules with defaults
  const allRules = [...DEFAULT_RULES, ...rules];

  // Track last processed event to avoid duplicates
  let lastProcessedEventId: string | null = null;

  // Watch for new events
  watch(
    events,
    (newEvents) => {
      if (newEvents.length === 0) return;

      // Process only new events
      const latestEvent = newEvents[newEvents.length - 1];
      if (latestEvent.EventId === lastProcessedEventId) {
        return;
      }

      lastProcessedEventId = latestEvent.EventId;

      // Handle EventBufferExceeded - invalidate ALL queries
      const messageId = latestEvent.MessageId ?? '';
      if (messageId.endsWith('.EventBufferExceeded')) {
        console.warn('[SSE] EventBufferExceeded - invalidating all queries');
        queryClient.invalidateQueries();
        onBufferExceeded?.();
        return;
      }

      processEvent(latestEvent, queryClient, allRules);
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
  event: RedfishSSEEvent,
  queryClient: QueryClient,
  rules: InvalidationRule[],
) {
  const invalidatedKeys = new Set<string>();

  // -------------------------------------------------------------------------
  // Dynamic path-based invalidation (primary mechanism)
  // -------------------------------------------------------------------------
  if (event.OriginOfCondition) {
    // Invalidate the exact resource path
    // e.g., "/redfish/v1/Chassis/BMC_0/Sensors/temp1" → ['redfish', 'v1', 'Chassis', 'BMC_0', 'Sensors', 'temp1']
    const path = event.OriginOfCondition.replace(/^\/redfish\/v1\//, '');
    const pathSegments = path.split('/').filter(Boolean);
    const resourceKey = ['redfish', 'v1', ...pathSegments];

    const keyString = JSON.stringify(resourceKey);
    if (!invalidatedKeys.has(keyString)) {
      invalidatedKeys.add(keyString);
      queryClient.invalidateQueries({ queryKey: resourceKey });
    }

    // For add/remove events, also invalidate parent collection
    const messageId = event.MessageId ?? '';
    if (
      messageId.includes('ResourceAdded') ||
      messageId.includes('ResourceRemoved') ||
      messageId.includes('ResourceCreated')
    ) {
      const parentSegments = pathSegments.slice(0, -1);
      if (parentSegments.length > 0) {
        const parentKey = ['redfish', 'v1', ...parentSegments];
        const parentKeyString = JSON.stringify(parentKey);
        if (!invalidatedKeys.has(parentKeyString)) {
          invalidatedKeys.add(parentKeyString);
          queryClient.invalidateQueries({ queryKey: parentKey });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Static rule-based invalidation (supplementary)
  // -------------------------------------------------------------------------
  const resourceType = extractResourceType(event.OriginOfCondition);

  for (const rule of rules) {
    if (!ruleMatches(event, rule, resourceType)) {
      continue;
    }

    // Invalidate static query keys
    for (const queryKey of rule.queryKeys) {
      const keyString = JSON.stringify(queryKey);
      if (!invalidatedKeys.has(keyString)) {
        invalidatedKeys.add(keyString);
        queryClient.invalidateQueries({ queryKey: queryKey as unknown[] });
      }
    }

    // Invalidate dynamic query keys from rule
    if (rule.extractKeys) {
      const dynamicKeys = rule.extractKeys(event);
      for (const queryKey of dynamicKeys) {
        const keyString = JSON.stringify(queryKey);
        if (!invalidatedKeys.has(keyString)) {
          invalidatedKeys.add(keyString);
          queryClient.invalidateQueries({ queryKey });
        }
      }
    }
  }

  // Log invalidations for debugging
  if (invalidatedKeys.size > 0 && import.meta.env.DEV) {
    console.debug(
      `[SSE] Event ${event.MessageId || event.EventId} invalidated ${invalidatedKeys.size} query keys`,
    );
  }
}

/**
 * Check if an event matches a rule.
 */
function ruleMatches(
  event: RedfishSSEEvent,
  rule: InvalidationRule,
  resourceType?: string,
): boolean {
  // Check resource type match
  if (rule.resourceTypes && rule.resourceTypes.length > 0) {
    if (!resourceType || !rule.resourceTypes.includes(resourceType)) {
      // Resource type specified but doesn't match
      if (!rule.messageIdPattern) {
        return false;
      }
    }
  }

  // Check message ID pattern match
  if (rule.messageIdPattern) {
    if (!matchesMessageId(event, rule.messageIdPattern)) {
      // If resource types also specified and matched, allow it
      if (rule.resourceTypes && resourceType && rule.resourceTypes.includes(resourceType)) {
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
  resourceUri: string,
) {
  const resourceType = extractResourceType(resourceUri);

  // Find matching rules and invalidate
  for (const rule of DEFAULT_RULES) {
    if (rule.resourceTypes?.includes(resourceType ?? '')) {
      for (const queryKey of rule.queryKeys) {
        queryClient.invalidateQueries({ queryKey: queryKey as unknown[] });
      }
    }
  }
}

/**
 * Invalidate all SSE-related queries (used on buffer exceeded).
 */
export function invalidateAllSSEQueries(queryClient: QueryClient) {
  // Collect all unique query keys from rules
  const allKeys = new Set<string>();

  for (const rule of DEFAULT_RULES) {
    for (const queryKey of rule.queryKeys) {
      allKeys.add(JSON.stringify(queryKey));
    }
  }

  // Invalidate all
  for (const keyString of allKeys) {
    const queryKey = JSON.parse(keyString) as unknown[];
    queryClient.invalidateQueries({ queryKey });
  }
}
