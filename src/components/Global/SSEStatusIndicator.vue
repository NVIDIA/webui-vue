<template>
  <span
    v-if="showIndicator"
    class="sse-status-indicator"
    :class="statusClass"
    :title="statusTitle"
  >
    <span class="sse-dot" :class="statusClass"></span>
    <span v-if="showLabel" class="sse-label">{{ statusLabel }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * SSE Status Indicator
 *
 * Displays the current SSE connection status as a colored dot.
 * Green = connected, yellow = connecting/reconnecting, red = error, gray = disconnected
 */
import { computed } from 'vue';
import { useSSEStore } from '@/stores/sse';

// Props
interface Props {
  /** Whether to show the text label */
  showLabel?: boolean;
  /** Whether to show when disconnected */
  showWhenDisconnected?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showLabel: false,
  showWhenDisconnected: false,
});

const sseStore = useSSEStore();

// Status labels (simple, no i18n needed)
const STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  error: 'Error',
  disconnected: 'Disconnected',
};

// Computed
const showIndicator = computed(() => {
  if (!sseStore.enabled) return false;
  if (sseStore.status === 'disconnected' && !props.showWhenDisconnected) {
    return false;
  }
  return true;
});

const statusClass = computed(() => {
  switch (sseStore.status) {
    case 'connected':
      return 'status-connected';
    case 'connecting':
      return 'status-connecting';
    case 'error':
      return 'status-error';
    default:
      return 'status-disconnected';
  }
});

const statusLabel = computed(() => STATUS_LABELS[sseStore.status] ?? 'Unknown');

const statusTitle = computed(() => {
  const base = `SSE: ${statusLabel.value}`;
  if (sseStore.errorMessage) {
    return `${base} - ${sseStore.errorMessage}`;
  }
  if (sseStore.status === 'connected' && sseStore.lastConnectedAt) {
    const time = sseStore.lastConnectedAt.toLocaleTimeString();
    return `${base} since ${time}`;
  }
  return base;
});
</script>

<style scoped lang="scss">
.sse-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
}

.sse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;

  &.status-connected {
    background-color: #28a745; // Bootstrap success green
  }

  &.status-connecting {
    background-color: #ffc107; // Bootstrap warning yellow
    animation: pulse 1s infinite;
  }

  &.status-error {
    background-color: #dc3545; // Bootstrap danger red
  }

  &.status-disconnected {
    background-color: #6c757d; // Bootstrap secondary gray
  }
}

.sse-label {
  color: inherit;
  opacity: 0.8;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
