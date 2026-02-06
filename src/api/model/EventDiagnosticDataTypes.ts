/**
 * Redfish Event DiagnosticDataTypes
 * Based on Event.v1_13_0.json schema
 * @see https://redfish.dmtf.org/schemas/v1/Event.v1_13_0.json
 * *
 * Note: This schema was not found in the OpenAPI.yaml file.
 * It was manually generated using the Event.v1_13_0.json schema.
 */

/**
 * The type of diagnostic data available.
 * @version 1.13.0
 */
export type EventDiagnosticDataTypes =
    (typeof EventDiagnosticDataTypes)[keyof typeof EventDiagnosticDataTypes];

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const EventDiagnosticDataTypes = {
    /** Manager diagnostic data. */
    Manager: 'Manager',
    /** Pre-OS diagnostic data. */
    PreOS: 'PreOS',
    /** Operating system (OS) diagnostic data. */
    OS: 'OS',
    /** OEM diagnostic data. */
    OEM: 'OEM',
    /** UEFI Common Platform Error Record. */
    CPER: 'CPER',
    /** A Section of a UEFI Common Platform Error Record. */
    CPERSection: 'CPERSection',
} as const;
