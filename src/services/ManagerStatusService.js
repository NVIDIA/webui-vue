import store from '@/store';

const REFRESH_INTERVAL = 5000; // 5 seconds

export const startManagerStatusCheck = () => {
  // Initial check
  store.dispatch('bmc/checkManagerStatus');

  const intervalId = setInterval(() => {
    if (store.getters['bmc/isManagerReady']) {
      clearInterval(intervalId);
    } else {
      store.dispatch('bmc/checkManagerStatus');
    }
  }, REFRESH_INTERVAL);

  return intervalId;
};

export const stopManagerStatusCheck = (intervalId) => {
  clearInterval(intervalId);
};
