<template>
  <div>
    <GlobalBanner
      :show="!isManagerReady"
      :message="$t('global.toast.bmcIsNotReady')"
      variant="warning"
    />
    <main id="main-content" class="page-container">
      <slot />
    </main>
  </div>
</template>

<script>
import { mapState } from 'vuex';
import JumpLinkMixin from '@/components/Mixins/JumpLinkMixin';
import GlobalBanner from '@/components/Global/GlobalBanner';
import { startManagerStatusCheck } from '@/services/ManagerStatusService';
export default {
  name: 'PageContainer',
  components: { GlobalBanner },
  mixins: [JumpLinkMixin],
  computed: {
    isManagerReady() {
      return !!this.$store?.state?.bmc?.isManagerReady;
    },
  },
  created() {
    this.managerStatusIntervalId = startManagerStatusCheck();
    this.handleSkipNavigation = () => {
      this.setFocus(this.$el);
    };
    this.$eventBus.on('skip-navigation', this.handleSkipNavigation);
  },
  beforeUnmount() {
    if (this.managerStatusIntervalId) {
      clearInterval(this.managerStatusIntervalId);
    }
    if (this.handleSkipNavigation) {
      this.$eventBus.off('skip-navigation', this.handleSkipNavigation);
    }
  },
};
</script>
<style lang="scss" scoped>
main {
  width: 100%;
  height: 100%;
  padding-top: $spacer * 1.5;
  padding-bottom: $spacer * 3;
  padding-inline-start: $spacer;
  padding-inline-end: $spacer;

  &:focus-visible {
    box-shadow: inset 0 0 0 2px theme-color('primary');
    outline: none;
  }

  @include media-breakpoint-up($responsive-layout-bp) {
    padding-inline-start: $spacer * 2;
  }
}
</style>
