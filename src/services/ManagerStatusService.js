import store from '@/store';

const REFRESH_INTERVAL = 5000; // 5 seconds

export const startManagerStatusCheck = () => {
  // Initial check
  store.dispatch('bmc/checkManagerStatus');

  const intervalId = setInterval(() => {
    store.dispatch('bmc/checkManagerStatus');
  }, REFRESH_INTERVAL);

  return intervalId;
};

export const stopManagerStatusCheck = (intervalId) => {
  clearInterval(intervalId);
};
