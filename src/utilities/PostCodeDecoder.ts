/**
 * PostCodeDecoder - POST code decoder supporting both:
 *   - 9-byte UEFI PI status codes (e.g. "0x010000000000010200")
 *   - 32-bit OEM compressed codes (e.g. "0x70C0C001")
 *
 * 9-byte UEFI format (OpenBMC phosphor-post-code-manager):
 *   Bytes 0-3: EFI_STATUS_CODE_TYPE (LE uint32)
 *     0x01 = Progress, 0x02 = Error, 0x03 = Debug
 *   Bytes 4-7: EFI_STATUS_CODE_VALUE (LE uint32)
 *     Bits 31:24 = Class, 23:16 = SubClass, 15:0 = Operation
 *   Byte 8: Extended data (typically 0x00)
 *
 * 32-bit OEM format (NVIDIA TB50x progress codes):
 *   Bits 31:30 = Status Type (0x1=Progress, 0x2=Error, 0x3=Debug)
 *   Bits 29:24 = Class (0x30=Pkg0, 0x31=Pkg1)
 *   Bits 23:16 = Source (0xC0=PSCROM, 0xC1=PSCFMC, ...)
 *   Bits 15:0  = Operation[5:0] + Instance[12:6]
 *
 * Source byte assignments (from TB50x Progress Code Format spec):
 *   0xC0 = PSCROM, 0xC1 = PSCFMC, 0xC2 = PSCRT,
 *   0xC3 = MB1, 0xC4 = BPMP-FW, 0xC5 = MB2,
 *   0xC6 = ATF/BL31, 0xC7 = RMM, 0xC8 = Hafnium,
 *   0xC9 = UEFI, 0xCA = UEFI-StMM, 0xCB = OOBHUB-FW,
 *   0xCC = RAS-FW, 0xCD = MSEQ-FW, 0xCE-0xD3 = PCORE0-5-FW
 */

// ---------------------------------------------------------------------------
// Source byte → processor row mapping (32-bit OEM codes)
//
// Maps NVIDIA OEM source bytes to boot-progress config processor IDs.
// Matches TB50x Progress Codes spec via LogBench reference implementation.
// ---------------------------------------------------------------------------

const OEM_SOURCE_TO_PROCESSOR: Record<number, string> = {
  0xc0: 'psc', // PSCROM
  0xc1: 'psc', // PSCFMC
  0xc2: 'psc', // PSCRT
  0xc3: 'bpmp', // MB1 → BPMP processor row (first stage)
  0xc4: 'bpmp', // BPMP-FW → BPMP processor row (second stage)
  0xc5: 'ccplex', // MB2 → CCPLEX row
  0xc6: 'ccplex', // ATF/BL31
  0xc7: 'ccplex', // RMM
  0xc8: 'ccplex', // Hafnium
  0xc9: 'ccplex', // UEFI
  0xca: 'ccplex', // UEFI-StMM
  0xcb: 'oob', // OOBHUB-FW
  0xcc: 'ras', // RAS-FW
  0xcd: 'mseq', // MSEQ-FW
  0xce: 'pxir', // PCORE0-FW
  0xcf: 'pxir', // PCORE1-FW
  0xd0: 'pxir', // PCORE2-FW
  0xd1: 'pxir', // PCORE3-FW
  0xd2: 'pxir', // PCORE4-FW
  0xd3: 'pxir', // PCORE5-FW
};

/**
 * Source byte → CCPLEX sub-stage mapping (for OEM codes within the CCPLEX).
 * Allows finer-grained stage identification when OEM codes are available.
 */
export const OEM_SOURCE_TO_STAGE: Record<number, string> = {
  0xc5: 'mb2',
  0xc6: 'atf',
  0xc7: 'rmm',
  0xc8: 'hafnium',
  0xc9: 'uefi',
  0xca: 'uefi',
};

// ---------------------------------------------------------------------------
// Decoded result type
// ---------------------------------------------------------------------------

export interface DecodedPostCode {
  /** Processor row identifier (matches boot-progress config IDs) */
  processor: string;
  /** True if this is an error code */
  isError: boolean;
  /** True if this is a progress code */
  isProgress: boolean;
  /** Package/socket number (0 or 1) */
  pkg: number;
  /** Human-readable label for milestone codes, null otherwise */
  label: string | null;
  /** CCPLEX sub-stage if identifiable (e.g. 'mb2', 'atf', 'uefi') */
  stage: string | null;
  /** Code format: 'uefi9' for 9-byte UEFI, 'oem32' for 32-bit OEM */
  format: 'uefi9' | 'oem32';
}

// ---------------------------------------------------------------------------
// Hex parsing helpers (safe for arbitrary-length hex strings)
// ---------------------------------------------------------------------------

/**
 * Extract a byte from a hex string at a given byte position.
 * Byte 0 is the leftmost pair of hex chars.
 */
function hexByte(hex: string, bytePos: number): number {
  const offset = bytePos * 2;
  if (offset + 2 > hex.length) return 0;
  return parseInt(hex.slice(offset, offset + 2), 16);
}

/**
 * Extract a 32-bit little-endian value from 4 consecutive bytes in a hex string.
 */
function hexLE32(hex: string, startByte: number): number {
  const b0 = hexByte(hex, startByte);
  const b1 = hexByte(hex, startByte + 1);
  const b2 = hexByte(hex, startByte + 2);
  const b3 = hexByte(hex, startByte + 3);
  return ((b3 << 24) | (b2 << 16) | (b1 << 8) | b0) >>> 0;
}

/**
 * Normalize a POST code string to bare hex digits (no 0x prefix, lowercase).
 */
function normalizeHex(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.startsWith('0x')) return trimmed.slice(2);
  return trimmed;
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

/**
 * Decode a POST code string from MessageArgs[2].
 *
 * Automatically detects the format:
 *   - >8 hex chars → 9-byte UEFI PI format (all entries map to 'ccplex')
 *   - ≤8 hex chars → 32-bit OEM format (source byte identifies processor)
 */
export function decodePostCode(input: string): DecodedPostCode {
  const hex = normalizeHex(input);

  // 9-byte UEFI PI format (18 hex chars = 9 bytes)
  if (hex.length > 8) {
    return decodeUefi9(hex);
  }

  // 32-bit OEM format (≤8 hex chars = 4 bytes)
  return decodeOem32(hex);
}

/**
 * Decode a 9-byte UEFI PI status code.
 *
 * All entries from this format originate from the CCPLEX (UEFI firmware).
 * The early boot processors (PSC, BPMP, OOB, etc.) don't report through
 * the PostCodes/Entries endpoint — their state must be inferred from
 * BootProgressState/OemState instead.
 */
function decodeUefi9(hex: string): DecodedPostCode {
  // Bytes 0-3 (LE): EFI_STATUS_CODE_TYPE
  const codeType = hexLE32(hex, 0);
  const isError = codeType === 0x02;
  const isProgress = codeType === 0x01;

  // Bytes 4-7 (LE): EFI_STATUS_CODE_VALUE
  const codeValue = hexLE32(hex, 4);
  const uefiClass = (codeValue >>> 24) & 0xff;
  const uefiSubclass = (codeValue >>> 16) & 0xff;

  // Byte 8: typically 0x00 (severity/padding)
  const severityByte = hexByte(hex, 8);

  // Error codes have severity 0x80 in byte 8
  const isErrorFromSeverity = severityByte === 0x80;

  return {
    processor: 'ccplex',
    isError: isError || isErrorFromSeverity,
    isProgress,
    pkg: 0,
    label: uefiClass > 0 ? `UEFI ${uefiClass}.${uefiSubclass}` : null,
    stage: null, // UEFI status codes don't distinguish CCPLEX sub-stages
    format: 'uefi9',
  };
}

/**
 * Decode a 32-bit OEM compressed POST code (NVIDIA TB50x format).
 *
 * When the BMC reports OEM codes (e.g. 0x70C0C001), this identifies
 * the exact processor and stage. Currently the BMC only reports UEFI
 * format codes, but this path is kept for future firmware support.
 */
function decodeOem32(hex: string): DecodedPostCode {
  const padded = hex.padStart(8, '0');
  const value = parseInt(padded, 16) >>> 0;

  // Sentinel / padding values
  if (value === 0xffffffff || value === 0x00000000) {
    return {
      processor: 'padding',
      isError: false,
      isProgress: false,
      pkg: 0,
      label: null,
      stage: null,
      format: 'oem32',
    };
  }

  const typeBits = (value >>> 30) & 0x3;
  const classBits = (value >>> 24) & 0x3f;
  const source = (value >>> 16) & 0xff;
  const pkg = classBits & 0x1; // bit 24: 0x30=pkg0, 0x31=pkg1

  // Standard EFI class (0x00-0x03) — non-OEM CCPLEX codes
  if (classBits <= 0x03) {
    return {
      processor: 'ccplex',
      isError: false,
      isProgress: true,
      pkg: 0,
      label: null,
      stage: null,
      format: 'oem32',
    };
  }

  // OEM class (0x20-0x3F) with NVIDIA source byte in bits 23:16
  const isOemClass = classBits >= 0x20;
  const processor =
    OEM_SOURCE_TO_PROCESSOR[source] || (isOemClass ? 'unknown' : 'ccplex');
  const stage = OEM_SOURCE_TO_STAGE[source] || null;

  return {
    processor,
    isError: isOemClass && typeBits === 2,
    isProgress: isOemClass ? typeBits === 1 : true,
    pkg,
    label: null,
    stage,
    format: 'oem32',
  };
}

/**
 * Compare two POST code IDs in "B{boot}-{seq}" format.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function comparePostCodeIds(a: string, b: string): number {
  const parseId = (id: string) => {
    const match = id.match(/^B(\d+)-(\d+)$/);
    if (!match) return { boot: 0, seq: 0 };
    return { boot: parseInt(match[1], 10), seq: parseInt(match[2], 10) };
  };
  const pa = parseId(a);
  const pb = parseId(b);
  return pa.boot !== pb.boot ? pa.boot - pb.boot : pa.seq - pb.seq;
}

/**
 * Extract boot count from a POST code ID (e.g. "B5-168" → 5).
 */
export function extractBootCount(id: string): number {
  const match = id.match(/^B(\d+)-/);
  return match ? parseInt(match[1], 10) : 0;
}
