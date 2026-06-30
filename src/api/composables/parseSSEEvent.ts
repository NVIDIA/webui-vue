/**
 * SSE Event Parser - Parse Redfish EventService SSE payloads
 *
 * Handles Redfish Event payloads from /redfish/v1/EventService/SSE
 * using Redfish-first types directly from the model.
 *
 * References:
 * - DMTF DSP0266 (Redfish) EventService
 * - bmcweb event_service_manager.hpp
 * - Event.v1_13_0.json schema
 */
import type { SpecialEventType } from '@/stores/sse';
import type { Event } from '@/api/model/Event';
import type { EventRecord } from '@/api/model/EventRecord';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of parsing an SSE event
 */
export interface ParseResult {
  /** Successfully parsed events (Redfish EventRecord type) */
  Events: EventRecord[];
  /** Special event type if detected */
  SpecialEvent?: SpecialEventType;
  /** Parse error if any */
  Error?: string;
}


// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse raw SSE event data into Redfish EventRecord objects.
 *
 * @param EventData - Raw data from SSE event (event.data)
 * @param FallbackEventId - SSE event ID (event.lastEventId) used if EventId missing
 * @returns ParseResult with Events and any SpecialEvent type
 */
export function parseSSEEventData(
  EventData: string,
  FallbackEventId?: string,
): ParseResult {
  if (!EventData || EventData.trim() === '') {
    return { Events: [] };
  }

  try {
    const Payload = JSON.parse(EventData) as Event;
    return parseRedfishPayload(Payload, FallbackEventId);
  } catch (e) {
    const ErrorMessage = e instanceof Error ? e.message : String(e);
    console.warn('Failed to parse SSE event data:', ErrorMessage);
    return {
      Events: [],
      Error: `JSON parse error: ${ErrorMessage}`,
    };
  }
}

/**
 * Parse a Redfish Event payload into EventRecord array.
 */
function parseRedfishPayload(
  Payload: Event,
  FallbackEventId?: string,
): ParseResult {
  const Events: EventRecord[] = [];
  let SpecialEvent: SpecialEventType | undefined;

  // Handle Events array (standard Redfish format)
  if (Array.isArray(Payload.Events)) {
    for (const Record of Payload.Events) {
      // Ensure EventId is present (use MemberId or fallback)
      const ProcessedRecord = ensureEventId(Record, FallbackEventId);

      // Check for special events
      const Special = detectSpecialEvent(Record);
      if (Special) {
        SpecialEvent = Special;
      }

      Events.push(ProcessedRecord);
    }
  } else {
    // Some implementations send single event at top level
    const Record = Payload as unknown as EventRecord;
    const ProcessedRecord = ensureEventId(Record, FallbackEventId);
    const Special = detectSpecialEvent(Record);
    if (Special) {
      SpecialEvent = Special;
    }
    Events.push(ProcessedRecord);
  }

  return { Events, SpecialEvent };
}

/**
 * Ensure EventId is present on the record.
 * Redfish schema requires MemberId, but EventId may be missing.
 */
function ensureEventId(
  Record: EventRecord,
  FallbackEventId?: string,
): EventRecord {
  if (Record.EventId) {
    return Record;
  }

  // Create a copy with EventId populated
  return {
    ...Record,
    EventId: Record.MemberId ?? FallbackEventId ?? generateEventId(),
  };
}

/**
 * Detect if an event record represents a special event type.
 * MessageId format: RegistryPrefix.Major.Minor.MessageKey
 */
function detectSpecialEvent(Record: EventRecord): SpecialEventType | undefined {
  const MessageId = Record.MessageId ?? '';

  // Check for heartbeat events
  // Matches: HeartbeatEvent.*.*, *.ServiceHeartbeat, *.HeartbeatEvent
  if (
    MessageId.startsWith('HeartbeatEvent.') ||
    MessageId.endsWith('.ServiceHeartbeat') ||
    MessageId.endsWith('.HeartbeatEvent') ||
    Record.EventType?.toLowerCase() === 'heartbeat'
  ) {
    return 'Heartbeat';
  }

  // Check for buffer exceeded
  // Matches: *.EventBufferExceeded (e.g., Base.1.18.EventBufferExceeded)
  if (MessageId.endsWith('.EventBufferExceeded')) {
    return 'EventBufferExceeded';
  }

  return undefined;
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

  const patterns: Array<{ pattern: RegExp; resource: string }> = [
    { pattern: /\/Sensors(?:\/|$)/i, resource: 'Sensors' },
    { pattern: /\/LogServices\/[^/]+\/Entries(?:\/|$)/i, resource: 'Entries' },
    { pattern: /\/EventLog\/Entries(?:\/|$)/i, resource: 'Entries' },
    { pattern: /\/Thermal(?:\/|$)/i, resource: 'Thermal' },
    { pattern: /\/Power(?:\/|$)/i, resource: 'Power' },
    { pattern: /\/Chassis(?:\/|$)/i, resource: 'Chassis' },
    { pattern: /\/Systems(?:\/|$)/i, resource: 'Systems' },
    { pattern: /\/Managers(?:\/|$)/i, resource: 'Managers' },
  ];

  for (const { pattern, resource } of patterns) {
    if (pattern.test(originUri)) {
      return resource;
    }
  }

  return undefined;
}

/**
 * Check if an event is related to a specific resource path.
 */
export function isEventForResource(
  Event: EventRecord,
  ResourcePath: string,
): boolean {
  const OriginUri = getOriginUri(Event);
  if (!OriginUri) return false;

  // Normalize paths for comparison
  const EventPath = OriginUri.toLowerCase();
  const TargetPath = ResourcePath.toLowerCase();

  return EventPath.includes(TargetPath) || TargetPath.includes(EventPath);
}

/**
 * Check if event matches a MessageId pattern.
 */
export function matchesMessageId(
  Event: EventRecord,
  Pattern: string | RegExp,
): boolean {
  if (!Event.MessageId) return false;

  if (typeof Pattern === 'string') {
    return Event.MessageId.toLowerCase().includes(Pattern.toLowerCase());
  }

  return Pattern.test(Event.MessageId);
}

/**
 * Extract the OriginOfCondition URI string from an EventRecord.
 * Some BMC implementations send a plain URI string; Redfish schema uses
 * an @odata.id object — accept both.
 */
export function getOriginUri(Event: EventRecord): string | undefined {
  const origin = Event.OriginOfCondition;
  if (typeof origin === 'string') {
    return origin;
  }
  return origin?.['@odata.id'];
}
