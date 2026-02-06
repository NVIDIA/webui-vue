/**
 * Redfish Event
 * Based on Event.v1_13_0.json schema
 * @see https://redfish.dmtf.org/schemas/v1/Event.v1_13_0.json
 * *
 * The Event schema describes the JSON payload received by an event destination,
 * which has subscribed to event notification, when events occur.
 */
import type { EventRecord } from './EventRecord';
import type { OdataV4Context } from './OdataV4Context';
import type { OdataV4Type } from './OdataV4Type';
import type { ResourceDescription } from './ResourceDescription';
import type { ResourceId } from './ResourceId';
import type { ResourceName } from './ResourceName';
import type { ResourceOem } from './ResourceOem';

/**
 * The Event resource describes the JSON payload received by an event destination
 * when events occur. This resource contains data about events, including descriptions,
 * severity, and a MessageId reference to a message registry.
 * @version 1.13.0
 */
export interface Event {
    '@odata.context'?: OdataV4Context;
    '@odata.type': OdataV4Type;
    /**
     * A context can be supplied at subscription time.
     * This property is the context value supplied by the subscriber.
     */
    readonly Context?: string;
    /** @nullable */
    readonly Description?: ResourceDescription;
    /**
     * Each event in this array has a set of properties that describe the event.
     * Because this is an array, more than one event can be sent simultaneously.
     */
    Events: EventRecord[];
    /** The count of events in the Events array. */
    'Events@odata.count'?: number;
    readonly Id: ResourceId;
    readonly Name: ResourceName;
    /** The OEM extension property. */
    Oem?: ResourceOem;
}
