<template>
  <span
    v-if="showIndicator"
    class="sse-status-indicator"
    :class="statusClass"
    :title="statusTitle"
  >
    <!-- Spinning arrows icon for connecting/reconnecting -->
    <svg
      v-if="isConnecting"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      class="spin"
    >
      <path
        d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"
      />
      <path
        fill-rule="evenodd"
        d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"
      />
    </svg>
    <!-- Warning icon for error state -->
    <svg
      v-else-if="isError"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path
        d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"
      />
    </svg>
  </span>
</template>

<script setup lang="ts">
/**
 * SSE Status Indicator
 *
 * Only displays when SSE connection is NOT healthy.
 * Shows connecting/reconnecting with spinning icon, or error state.
 * Hidden when connected (expected state).
 * Icon only - details shown in tooltip on hover.
 */
import { computed } from 'vue';
import { useSSEStore } from '@/stores/sse';

const sseStore = useSSEStore();

// Only show when there's a problem (not connected)
const showIndicator = computed(() => {
  if (!sseStore.enabled) return false;
  // Only show when NOT connected
  return sseStore.status !== 'connected';
});

const isConnecting = computed(
  () => sseStore.status === 'connecting' || sseStore.status === 'reconnecting',
);

const isError = computed(
  () => sseStore.status === 'error' || sseStore.status === 'disconnected',
);

const statusClass = computed(() => {
  if (isConnecting.value) return 'status-connecting';
  if (isError.value) return 'status-error';
  return 'status-disconnected';
});

const statusTitle = computed(() => {
  let label: string;
  switch (sseStore.status) {
    case 'connecting':
      label = 'SSE connecting';
      break;
    case 'reconnecting':
      label = 'SSE reconnecting';
      break;
    case 'error':
      label = 'SSE connection error';
      break;
    case 'disconnected':
      label = 'SSE disconnected';
      break;
    default:
      label = 'SSE status unknown';
  }

  if (sseStore.reconnectAttempts > 0) {
    label += ` (attempt ${sseStore.reconnectAttempts}/5)`;
  }

  if (sseStore.errorMessage) {
    label += ` - ${sseStore.errorMessage}`;
  }

  return label;
});
</script>

<style scoped lang="scss">
.sse-status-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: help;

  &.status-connecting {
    color: #ffc107; // Bootstrap warning yellow
  }

  &.status-error,
  &.status-disconnected {
    color: #dc3545; // Bootstrap danger red
  }
}

// Spinning animation for connecting state
.spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
