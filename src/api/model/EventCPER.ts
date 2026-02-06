/**
 * Redfish Event CPER
 * Based on Event.v1_13_0.json schema
 * @see https://redfish.dmtf.org/schemas/v1/Event.v1_13_0.json
 * *
 * Note: This schema was not found in the OpenAPI.yaml file.
 * It was manually generated using the Event.v1_13_0.json schema.
 */
import type { ResourceOem } from './ResourceOem';

/**
 * Details for a CPER section or record associated with an event.
 * @version 1.13.0
 */
export interface EventCPER {
    /**
     * The CPER Notification Type for a CPER record.
     * This property shall only be present if DiagnosticDataType contains CPER.
     * @pattern ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$
     * @nullable
     */
    readonly NotificationType?: string | null;
    /** The OEM extension property. */
    Oem?: ResourceOem;
    /**
     * The CPER Section Type.
     * This property shall only be present if DiagnosticDataType contains CPERSection.
     * @pattern ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$
     * @nullable
     */
    readonly SectionType?: string | null;
}
