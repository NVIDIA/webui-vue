/**
 * PostCodeDecoder - Lightweight client-side POST code decoder
 *
 * Two-layer approach for embedded BMC bundle-size constraints:
 *   Layer 1: Bit math to extract processor source, type, and package (~0KB)
 *   Layer 2: Curated milestone map for stage-boundary labels (~1KB)
 *
 * Bit field layout (32-bit OEM POST codes):
 *   Bits 31:30 = Status Type (0x1=Progress, 0x2=Error, 0x3=Debug)
 *   Bits 29:24 = Class (0x1C=OEM with pkg bit, 0x03=EFI/UEFI)
 *   Bits 23:16 = Subclass/Source (PSC_ROM=0xC0, PSC_FMC=0xC1, etc.)
 *   Bits 15:0  = Operation[5:0] + Instance[12:6]
 *
 * Package/socket is determined by bit 24:
 *   0x70... = Package 0,  0x71... = Package 1
 */

// ---------------------------------------------------------------------------
// Source byte → processor row mapping
// ---------------------------------------------------------------------------

const SOURCE_MAP: Record<number, string> = {
  0xC0: 'psc', // PSC_ROM
  0xC1: 'psc', // PSC_FMC (both map to PSC processor row)
  0xC3: 'oob', // OOB HUB
  0xC4: 'bpmp', // MB1 / BPMP FW
  0xC5: 'mseq', // Memory Sequencer
};

// ---------------------------------------------------------------------------
// Curated milestone codes (~20-30 stage-boundary markers)
//
// Keyed by masked value: strip package bit (24) and instance bits [12:6]
// using mask 0xFEFF003F so both pkg0/pkg1 variants match.
//
// Populated from reference CSV — only codes that mark visible stage
// transitions in real boot logs.
// ---------------------------------------------------------------------------

const MILESTONES: Record<number, string> = {
  // PSC_ROM (source 0xC0)
  0x70C0C001: 'PSC ROM: I2C Ext Msg Init',
  0x70C0C003: 'PSC ROM: Boot Mode Detect',
  0x70C0C004: 'PSC ROM: BCT Loaded',
  0x70C0C007: 'PSC ROM: FMC Auth Start',
  0x70C0C008: 'PSC ROM: FMC Auth Done',
  0x70C0C009: 'PSC ROM: FMC Loaded',
  0x70C0C00A: 'PSC ROM: Handoff to FMC',
  0x70C0C00B: 'PSC ROM: Unhalt BPMP',

  // PSC_FMC (source 0xC1)
  0x70C1C001: 'PSC FMC: Init Start',
  0x70C1C003: 'PSC FMC: DRAM Init',
  0x70C1C006: 'PSC FMC: FW Handoff',
  0x70C1C008: 'PSC FMC: Stage Progress',
  0x70C1C052: 'PSC FMC: MB2 Load Start',
  0x70C1C053: 'PSC FMC: MB2 Load Done',
  0x70C1C00C: 'PSC FMC: Boot Complete',

  // BPMP / MB1 (source 0xC4)
  0x70C4C000: 'MB1: Init Start',
  0x70C4C001: 'MB1: C2C LPI Init',
  0x70C4C002: 'MB1: SDRAM Config',
  0x70C4C003: 'MB1: SDRAM Init',
  0x70C4C004: 'MB1: Finished → BPMP FW',
  0x70C4C005: 'BPMP FW: Init Start',
  0x70C4C006: 'BPMP FW: Clock Setup',
  0x70C4C007: 'BPMP FW: IPC Init',
  0x70C4C008: 'BPMP FW: Module Load',
  0x70C4C009: 'BPMP FW: Init Complete',
  0x70C4C00A: 'BPMP FW: Runtime',
  0x70C4C03F: 'BPMP FW: All Done',

  // OOB HUB (source 0xC3)
  0x70C3C001: 'OOB HUB: Init',

  // MSEQ (source 0xC5)
  0x70C5C001: 'MSEQ: Init',

  // Errors (type bits = 0x2, masked to pkg0)
  0xB0C0C001: 'PSC ROM: I2C Fail',
  0xB0C1C011: 'PSC FMC: SPE Error',
};

// ---------------------------------------------------------------------------
// Decoded result type
// ---------------------------------------------------------------------------

export interface DecodedPostCode {
  /** Processor row identifier (matches boot-progress config IDs) */
  processor: string;
  /** True if this is an error code (type bits = 0x2) */
  isError: boolean;
  /** True if this is a progress code (type bits = 0x1) */
  isProgress: boolean;
  /** Package/socket number (0 or 1) */
  pkg: number;
  /** Human-readable label for milestone codes, null otherwise */
  label: string | null;
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

/**
 * Decode a hex POST code string into processor, type, and milestone info.
 *
 * @param hex - Hex string from MessageArgs[2], e.g. "0x70C4C000"
 * @returns Decoded POST code information
 */
export function decodePostCode(hex: string): DecodedPostCode {
  const value = parseInt(hex, 16) >>> 0;
  const typeBits = (value >>> 30) & 0x3;
  const classBits = (value >>> 24) & 0x3f;
  const source = (value >>> 16) & 0xff;
  const pkg = (value >>> 24) & 0x1;

  // EFI class (0x03) = UEFI / CCPLEX codes — different bit layout
  if (classBits === 0x03) {
    return {
      processor: 'ccplex',
      isError: false,
      isProgress: true,
      pkg,
      label: null,
    };
  }

  // Mask out package bit (24) and instance bits [12:6] for milestone lookup
  // Mask: keep bits 31:25, 23:13, 5:0 → 0xFEFF003F
  const maskedForLookup = (value & 0xfeff003f) >>> 0;
  const label = MILESTONES[maskedForLookup] || null;

  return {
    processor: SOURCE_MAP[source] || 'unknown',
    isError: typeBits === 2,
    isProgress: typeBits === 1,
    pkg,
    label,
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
