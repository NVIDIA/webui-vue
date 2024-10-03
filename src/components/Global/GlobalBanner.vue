<template>
  <div v-if="show" class="global-banner" :class="bannerClass">
    <b-alert :variant="variant" show class="text-center mb-0">
      {{ message }}
    </b-alert>
  </div>
</template>

<script>
export default {
  name: 'GlobalBanner',
  props: {
    show: {
      type: Boolean,
      default: false
    },
    message: {
      type: String,
      required: true
    },
    variant: {
      type: String,
      default: 'warning'
    }
  },
  computed: {
    bannerClass() {
      return `global-banner--${this.variant}`;
    }
  }
};
</script>

<style lang="scss" scoped>
.global-banner {
  position: sticky;
  top: $header-height;
  left: 0;
  right: 0;
  z-index: $zindex-fixed;
}

.global-banner .alert {
  border-radius: 0;
}
</style>
