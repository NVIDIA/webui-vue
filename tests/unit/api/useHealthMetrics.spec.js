import { describe, it, expect } from 'vitest';
import { formatComponentName } from '@/api/composables/useHealthMetrics';

describe('formatComponentName', () => {
  it('strips a vendor prefix when a type token remains', () => {
    expect(formatComponentName('HGX_GPU_0')).toBe('GPU 0');
    expect(formatComponentName('HGX_Baseboard_0')).toBe('Baseboard 0');
    expect(formatComponentName('HGX_ProcessorModule_0')).toBe('ProcessorModule 0');
  });

  it('keeps an all-caps type token that would otherwise collapse to an index', () => {
    expect(formatComponentName('CPU_0')).toBe('CPU 0');
    expect(formatComponentName('CPU_1')).toBe('CPU 1');
    expect(formatComponentName('GPU_0')).toBe('GPU 0');
    expect(formatComponentName('CX_0')).toBe('CX 0');
    expect(formatComponentName('BMC_0')).toBe('BMC 0');
  });

  it('leaves mixed-case ids readable', () => {
    expect(formatComponentName('ProcessorModule_0')).toBe('ProcessorModule 0');
    expect(formatComponentName('Baseboard_0')).toBe('Baseboard 0');
  });
});
