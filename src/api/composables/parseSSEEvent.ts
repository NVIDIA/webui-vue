/**
 * SSE Event Parser - Parse Redfish EventService SSE payloads
 *
 * Handles Redfish Event payloads from /redfish/v1/EventService/SSE
 * and normalizes them for UI consumption. Preserves Redfish field names.
 *
 * References:
 * - DMTF DSP0266 (Redfish) EventService
 * - bmcweb event_service_manager.hpp
 */
import type { RedfishSSEEvent, SpecialEventType } from '@/stores/sse';

// ============================================================================
// Types
// ============================================================================

/**
 * Raw Redfish Event payload structure from SSE stream.
 * Each SSE message may contain multiple events in the Events array.
 */
export interface RedfishEventPayload {
  '@odata.type'?: string;
  Id?: string;
  Name?: string;
  Events?: RedfishEventRecord[];
}

/**
 * Individual event record within the Events array.
 * Follows Redfish Event schema (DSP8010).
 */
export interface RedfishEventRecord {
  EventId?: string;
  EventTimestamp?: string;
  EventType?: string;
  LogEntry?: unknown;
  Message?: string;
  MessageArgs?: string[];
  MessageId?: string;
  MessageSeverity?: string;
  Oem?: object;
  OriginOfCondition?: {
    '@odata.id'?: string;
  };
  Severity?: string;
  Resolution?: string;
  Context?: string;
  MemberId?: string;
  [key: string]: unknown;
}

/**
 * Result of parsing an SSE event
 */
export interface ParseResult {
  /** Successfully parsed events */
  events: RedfishSSEEvent[];
  /** Special event type if detected */
  specialEvent?: SpecialEventType;
  /** Parse error if any */
  error?: string;
}


// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse raw SSE event data into normalized RedfishSSEEvent objects.
 *
 * @param eventData - Raw data from SSE event (event.data)
 * @param eventId - SSE event ID (event.lastEventId)
 * @returns ParseResult with events and any special event type
 */
export function parseSSEEventData(
  eventData: string,
  eventId?: string,
): ParseResult {
  if (!eventData || eventData.trim() === '') {
    return { events: [] };
  }

  try {
    const payload = JSON.parse(eventData) as RedfishEventPayload;
    return parseRedfishPayload(payload, eventId);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.warn('Failed to parse SSE event data:', errorMessage);
    return {
      events: [],
      error: `JSON parse error: ${errorMessage}`,
    };
  }
}

/**
 * Parse a Redfish Event payload into normalized events.
 */
function parseRedfishPayload(
  payload: RedfishEventPayload,
  eventId?: string,
): ParseResult {
  const events: RedfishSSEEvent[] = [];
  let specialEvent: SpecialEventType | undefined;

  // Handle Events array (standard Redfish format)
  if (Array.isArray(payload.Events)) {
    for (const record of payload.Events) {
      const parsed = parseEventRecord(record, eventId);

      // Check for special events
      const special = detectSpecialEvent(record);
      if (special) {
        specialEvent = special;
      }

      events.push(parsed);
    }
  } else {
    // Some implementations send single event at top level
    const parsed = parseEventRecord(payload as unknown as RedfishEventRecord, eventId);
    const special = detectSpecialEvent(payload as unknown as RedfishEventRecord);
    if (special) {
      specialEvent = special;
    }
    events.push(parsed);
  }

  return { events, specialEvent };
}

/**
 * Parse a single Redfish event record into normalized format.
 */
function parseEventRecord(
  record: RedfishEventRecord,
  fallbackEventId?: string,
): RedfishSSEEvent {
  // Redfish uses both Severity and MessageSeverity depending on version
  const rawSeverity = record.Severity ?? record.MessageSeverity;

  return {
    // Identity
    EventId: record.EventId ?? record.MemberId ?? fallbackEventId ?? generateEventId(),
    EventTimestamp: record.EventTimestamp,
    EventType: record.EventType,
    // Message
    MessageId: record.MessageId,
    Message: record.Message,
    MessageArgs: record.MessageArgs,
    // Context
    OriginOfCondition: record.OriginOfCondition?.['@odata.id'],
    Severity: normalizeSeverity(rawSeverity),
    Resolution: record.Resolution,
    // Extended
    LogEntry: record.LogEntry,
    Oem: record.Oem,
    // Internal
    _raw: record,
  };
}

/**
 * Detect if an event record represents a special event type.
 * MessageId format: RegistryPrefix.Major.Minor.MessageKey
 */
function detectSpecialEvent(record: RedfishEventRecord): SpecialEventType | undefined {
  const messageId = record.MessageId ?? '';

  // Check for heartbeat events
  // Matches: HeartbeatEvent.*.*, *.ServiceHeartbeat, *.HeartbeatEvent
  if (
    messageId.startsWith('HeartbeatEvent.') ||
    messageId.endsWith('.ServiceHeartbeat') ||
    messageId.endsWith('.HeartbeatEvent') ||
    record.EventType?.toLowerCase() === 'heartbeat'
  ) {
    return 'Heartbeat';
  }

  // Check for buffer exceeded
  // Matches: *.EventBufferExceeded (e.g., Base.1.18.EventBufferExceeded)
  if (messageId.endsWith('.EventBufferExceeded')) {
    return 'EventBufferExceeded';
  }

  return undefined;
}

/**
 * Normalize severity values to consistent format.
 */
function normalizeSeverity(severity?: string): string | undefined {
  if (!severity) return undefined;

  const normalized = severity.toLowerCase();

  if (normalized === 'critical' || normalized === 'error') {
    return 'Critical';
  }
  if (normalized === 'warning' || normalized === 'caution') {
    return 'Warning';
  }
  if (normalized === 'ok' || normalized === 'informational' || normalized === 'info') {
    return 'OK';
  }

  // Return original if not recognized
  return severity;
}

/**
 * Generate a unique event ID when not provided by server.
 */
function generateEventId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract resource type from OriginOfCondition URI.
 * E.g., "/redfish/v1/Chassis/1/Sensors/temperature" -> "Sensors"
 */
export function extractResourceType(originUri?: string): string | undefined {
  if (!originUri) return undefined;

  // Common Redfish resource patterns
  const patterns = [
    /\/Sensors\//i,
    /\/LogServices\/.*\/Entries/i,
    /\/EventLog\/Entries/i,
    /\/Thermal/i,
    /\/Power/i,
    /\/Chassis/i,
    /\/Systems/i,
    /\/Managers/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(originUri)) {
      const match = originUri.match(/\/([A-Za-z]+)(?:\/|$)/);
      if (match) {
        return match[1];
      }
    }
  }

  return undefined;
}

/**
 * Check if an event is related to a specific resource path.
 */
export function isEventForResource(
  event: RedfishSSEEvent,
  resourcePath: string,
): boolean {
  if (!event.OriginOfCondition) return false;

  // Normalize paths for comparison
  const eventPath = event.OriginOfCondition.toLowerCase();
  const targetPath = resourcePath.toLowerCase();

  return eventPath.includes(targetPath) || targetPath.includes(eventPath);
}

/**
 * Check if event matches a MessageId pattern.
 */
export function matchesMessageId(
  event: RedfishSSEEvent,
  pattern: string | RegExp,
): boolean {
  if (!event.MessageId) return false;

  if (typeof pattern === 'string') {
    return event.MessageId.toLowerCase().includes(pattern.toLowerCase());
  }

  return pattern.test(event.MessageId);
}
