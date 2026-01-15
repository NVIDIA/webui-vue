<template>
  <span :class="['status-icon', status]">
    <img
      svg-inline
      :class="status"
      src="@/assets/images/power.svg"
      width="24"
      height="24"
      :alt="altText"
    />
  </span>
</template>

<script>
export default {
  name: 'PowerIcon',
  props: {
    status: {
      type: String,
      default: '',
    },
  },
  computed: {
    altText() {
      // Generate accessible alt text based on power status
      if (this.status.includes('on')) {
        return this.$t('global.status.on');
      } else if (this.status === 'off') {
        return this.$t('global.status.off');
      }
      return this.$t('global.status.notAvailable');
    },
  },
};
</script>

<style lang="scss" scoped>
.status-icon {
  vertical-align: text-bottom;

  svg {
    fill: currentColor;

    >[data-id="power-off"] {
      display: none;
    }
    >[data-id="power-on"] {
      display: initial;
    }

    color: theme-color('success');

    &.off {
      color: theme-color('danger');

      >[data-id="power-on"] {
        display: none;
      }
      >[data-id="power-off"] {
        display: initial;
      }
    }

    &.secondary {
      color: gray('600');

      >[data-id="power-on"] {
        display: none;
      }
      >[data-id="power-off"] {
        display: initial;
      }
    }

    &.blink { 
      g rect,
      g path,
      g circle {
          animation: blink 1.0s infinite;
      }
    }
  }

  svg[class^='1Hz'],
  svg[class*='1Hz'] {
    g rect,
    g path,
    g circle {
      animation-duration: 0.25s;
    }
  }
}
.cls-1 {
    fill: none;
}

@keyframes blink {
  100%,
  0% {
      fill: none;
  }

  60% {
      fill: currentColor;
  }
}
</style>
