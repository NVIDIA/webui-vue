export const APP_BANNER_OFFSET_VAR = '--app-banner-offset';

export function setAppBannerOffset(heightPx) {
  document.documentElement.style.setProperty(
    APP_BANNER_OFFSET_VAR,
    `${Math.max(0, heightPx)}px`,
  );
}

export function clearAppBannerOffset() {
  document.documentElement.style.setProperty(APP_BANNER_OFFSET_VAR, '0px');
}

/**
 * Keep fixed toast containers below visible page banners (manager status,
 * boot progress, firmware update). Updates --app-banner-offset on :root.
 */
export function observeAppBannerStack(element) {
  if (!element) {
    return { disconnect: clearAppBannerOffset };
  }

  if (typeof ResizeObserver === 'undefined') {
    return { disconnect: clearAppBannerOffset };
  }

  const update = () => {
    setAppBannerOffset(element.getBoundingClientRect().height);
  };

  update();
  const observer = new ResizeObserver(update);
  observer.observe(element);

  return {
    disconnect() {
      observer.disconnect();
      clearAppBannerOffset();
    },
  };
}
