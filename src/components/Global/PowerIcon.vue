<template>
  <span class="status-icon power-icon-wrapper" v-html="svgContent" />
</template>

<script>
import powerSvgRaw from '@/assets/images/power.svg?raw';

export default {
  name: 'PowerIcon',
  props: {
    status: {
      type: String,
      default: '',
    },
  },
  computed: {
    svgContent() {
      // Add width, height, class and aria-label to SVG
      const classAttr = this.status ? `class="${this.status}"` : '';
      const ariaLabel = `aria-label="${this.altText}"`;
      return powerSvgRaw.replace(
        '<svg ',
        `<svg width="24" height="24" ${classAttr} ${ariaLabel} `
      );
    },
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

<style lang="scss">
.status-icon.power-icon-wrapper {
  vertical-align: text-bottom;

  svg {
    fill: currentColor;
    color: theme-color('success');

    >[data-id="power-off"] {
      display: none;
    }
    >[data-id="power-on"] {
      display: initial;
    }

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
          animation: blink-power 1.0s infinite;
      }
    }

    &[class^='1Hz'],
    &[class*='1Hz'] {
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
}

@keyframes blink-power {
  100%,
  0% {
      fill: none;
  }

  60% {
      fill: currentColor;
  }
}
</style>
