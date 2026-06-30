import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  APP_BANNER_OFFSET_VAR,
  setAppBannerOffset,
  clearAppBannerOffset,
  observeAppBannerStack,
} from '@/services/ToastOffsetService';

describe('ToastOffsetService', () => {
  beforeEach(() => {
    clearAppBannerOffset();
  });

  afterEach(() => {
    clearAppBannerOffset();
  });

  it('sets and clears the banner offset CSS variable', () => {
    setAppBannerOffset(42);
    expect(
      document.documentElement.style.getPropertyValue(APP_BANNER_OFFSET_VAR),
    ).toBe('42px');

    clearAppBannerOffset();
    expect(
      document.documentElement.style.getPropertyValue(APP_BANNER_OFFSET_VAR),
    ).toBe('0px');
  });

  it('does not set a negative offset', () => {
    setAppBannerOffset(-10);
    expect(
      document.documentElement.style.getPropertyValue(APP_BANNER_OFFSET_VAR),
    ).toBe('0px');
  });

  it('observes banner stack height and clears on disconnect', () => {
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({ height: 56 });
    document.body.appendChild(element);

    const observer = observeAppBannerStack(element);
    expect(
      document.documentElement.style.getPropertyValue(APP_BANNER_OFFSET_VAR),
    ).toBe('56px');

    observer.disconnect();
    expect(
      document.documentElement.style.getPropertyValue(APP_BANNER_OFFSET_VAR),
    ).toBe('0px');

    document.body.removeChild(element);
  });
});
