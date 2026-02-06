<template>
  <span :class="['status-icon', PowerClass]">
    <svg
      :class="[status, AnimationClass]"
      width="24"
      height="24"
      viewBox="0 0 32 32"
      :aria-label="SystemPowerAlt"
      :aria-hidden="ariaHidden"
    >
      <g data-id="power-on">
        <path
          fill="currentColor"
          d="M22.5,5.74l-1,1.73a11,11,0,1,1-11,0l-1-1.73a13,13,0,1,0,13,0Z"
          transform="translate(0)"
        />
        <rect fill="currentColor" x="15" y="2" width="2" height="14" />
      </g>
      <g data-id="power-off">
        <path
          fill="currentColor"
          d="M29,17 a11,11,0,1,0,-26,0 a11,11,0,1,0,26,0 M27,17 a10,10,0,1,1,-22,0 a10,10,0,1,1,22,0 Z"
          transform="translate(0)"
        />
        <rect
          fill="currentColor"
          stroke="none"
          x="15"
          y="10"
          width="2"
          height="14"
        />
      </g>
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type PowerStatus = 'on' | 'off' | 'on blink' | 'on blink 1Hz' | 'secondary';

interface Props {
  status: PowerStatus;
  ariaHidden?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  ariaHidden: false,
});

const PowerClass = computed(() => {
  if (props.status === 'on' || props.status.startsWith('on ')) {
    return 'text-success';
  } else if (props.status === 'off') {
    return 'text-danger';
  } else {
    return 'text-secondary';
  }
});

const AnimationClass = computed(() => {
  if (props.status === 'on blink') {
    return 'blink';
  } else if (props.status === 'on blink 1Hz') {
    return 'blink-1Hz';
  }
  return '';
});

const SystemPowerAlt = computed(() => {
  const StatusMap: Record<string, string> = {
    on: 'Power on',
    off: 'Power off',
    'on blink': 'Power turning on',
    'on blink 1Hz': 'Power paused',
    secondary: 'Power unknown',
  };
  return StatusMap[props.status] || 'Power status';
});
</script>

<style scoped>
.status-icon {
  vertical-align: text-bottom;
}

.status-icon svg {
  fill: currentColor;
  color: #28a745; /* success green - default on state */
}

.status-icon svg > [data-id='power-off'] {
  display: none;
}

.status-icon svg > [data-id='power-on'] {
  display: initial;
}

/* Off state */
.status-icon svg.off {
  color: #dc3545; /* danger red */
}

.status-icon svg.off > [data-id='power-on'] {
  display: none;
}

.status-icon svg.off > [data-id='power-off'] {
  display: initial;
}

/* Secondary/unknown state */
.status-icon svg.secondary {
  color: #6c757d; /* gray */
}

.status-icon svg.secondary > [data-id='power-on'] {
  display: none;
}

.status-icon svg.secondary > [data-id='power-off'] {
  display: initial;
}

/* Blink animation - normal speed (1.0s) */
.status-icon svg.blink g rect,
.status-icon svg.blink g path,
.status-icon svg.blink g circle {
  animation: blink 1s infinite;
}

/* 1Hz faster blink (0.25s) */
.status-icon svg.blink-1Hz g rect,
.status-icon svg.blink-1Hz g path,
.status-icon svg.blink-1Hz g circle {
  animation: blink 0.25s infinite;
}

@keyframes blink {
  0%,
  100% {
    fill: none;
  }
  60% {
    fill: currentColor;
  }
}
</style>
