/**
 * Redfish EventRecord
 * Based on Event.v1_13_0.json schema
 * @see https://redfish.dmtf.org/schemas/v1/Event.v1_13_0.json
 * *
 * Note: This schema was not found in the OpenAPI.yaml file.
 * It was manually generated using the Event.v1_13_0.json schema.
 */
import type { EventCPER } from './EventCPER';
import type { EventDiagnosticDataTypes } from './EventDiagnosticDataTypes';
import type { EventType } from './EventType';
import type { OdataV4IdRef } from './OdataV4IdRef';
import type { ResourceHealth } from './ResourceHealth';
import type { ResourceOem } from './ResourceOem';
import type { ResolutionStep } from './ResolutionStep';

/**
 * An individual event record from the Events array.
 * @version 1.13.0
 */
export interface EventRecord {
    /**
     * The size of the additional data for this event.
     * @nullable
     */
    readonly AdditionalDataSizeBytes?: number | null;
    /**
     * The URI at which to access the additional data for the event.
     * @nullable
     */
    readonly AdditionalDataURI?: string | null;
    /** Details for a CPER section or record associated with this event. */
    CPER?: EventCPER;
    /**
     * A context can be supplied at subscription time.
     * @deprecated Events are triggered independently from subscriptions.
     */
    readonly Context?: string;
    /**
     * A Base64-encoded set of diagnostic data associated with this event.
     * @nullable
     */
    readonly DiagnosticData?: string | null;
    /**
     * The type of data available in DiagnosticData or AdditionalDataURI.
     * @nullable
     */
    readonly DiagnosticDataType?: EventDiagnosticDataTypes;
    /**
     * The identifier that correlates events with the same root cause.
     * If 0, no other event is related to this event.
     */
    readonly EventGroupId?: number;
    /** The unique instance identifier of an event. */
    readonly EventId?: string;
    /** The time the event occurred (ISO 8601 format). */
    readonly EventTimestamp?: string;
    /**
     * The type of event.
     * @deprecated Starting with Redfish Specification v1.6 (Event v1.3), subscriptions are based on RegistryPrefix and ResourceType.
     */
    readonly EventType?: EventType;
    /** The link to a log entry if an entry was created for this event. */
    readonly LogEntry?: OdataV4IdRef;
    /** The unique identifier for the member within an array. */
    readonly MemberId: string;
    /** The human-readable event message. */
    readonly Message?: string;
    /** An array of message arguments that are substituted for the arguments in the message. */
    readonly MessageArgs?: readonly string[];
    /**
     * The identifier for the message.
     * @pattern ^[A-Za-z0-9]+\.\d+\.\d+\.[A-Za-z0-9.]+$
     */
    readonly MessageId: string;
    /** The severity of the message in this event. */
    readonly MessageSeverity?: ResourceHealth;
    /**
     * The OEM-defined type of diagnostic data.
     * Present if DiagnosticDataType is OEM.
     * @nullable
     */
    readonly OEMDiagnosticDataType?: string | null;
    /** The OEM extension property. */
    Oem?: ResourceOem;
    /**
     * The IP address, with scheme, of the user associated with the log entry.
     * @pattern ^.+:\/\/.+$
     * @nullable
     */
    readonly OriginAddress?: string | null;
    /** A link to the resource or object that originated the condition. */
    readonly OriginOfCondition?: OdataV4IdRef;
    /**
     * Indicates whether the OriginOfCondition link is unavailable.
     * @nullable
     */
    readonly OriginOfConditionUnavailable?: boolean | null;
    /** Suggestions on how to resolve the situation that caused the event. */
    readonly Resolution?: string;
    /** The list of recommended steps to resolve the cause of the event. */
    ResolutionSteps?: ResolutionStep[];
    /**
     * The severity of the event.
     * @deprecated Use MessageSeverity instead.
     */
    readonly Severity?: string;
    /** Indicates this event is equivalent to a more specific event in this event group. */
    readonly SpecificEventExistsInGroup?: boolean;
    /**
     * The source of authentication for the username property.
     * @nullable
     */
    readonly UserAuthenticationSource?: string | null;
    /**
     * The username of the account associated with the event record.
     * @nullable
     */
    readonly Username?: string | null;
}
