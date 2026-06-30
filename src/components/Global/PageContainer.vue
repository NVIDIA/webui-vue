<template>
  <div>
    <div ref="bannerStack" class="page-banner-stack">
      <global-banner
        :show="!isManagerReady"
        :message="managerBannerMessage"
        variant="warning"
      />
      <boot-progress-banner />
      <firmware-progress-banner />
    </div>
    <system-recovery-modal />
    <main id="main-content" class="page-container">
      <slot />
    </main>
  </div>
</template>

<script>
import { mapState } from 'vuex';
import JumpLinkMixin from '@/components/Mixins/JumpLinkMixin';
import GlobalBanner from '@/components/Global/GlobalBanner';
import BootProgressBanner from '@/components/Global/BootProgressBanner';
import FirmwareProgressBanner from '@/components/Global/FirmwareProgressBanner';
import SystemRecoveryModal from '@/components/Global/SystemRecoveryModal';
import { startManagerStatusCheck } from '@/services/ManagerStatusService';
import { observeAppBannerStack } from '@/services/ToastOffsetService';
import eventBus from '@/eventBus';

export default {
  name: 'PageContainer',
  components: {
    GlobalBanner,
    BootProgressBanner,
    FirmwareProgressBanner,
    SystemRecoveryModal,
  },
  mixins: [JumpLinkMixin],
  computed: {
    isManagerReady() {
      return !!this.$store?.state?.bmc?.isManagerReady;
    },
    managerBannerMessage() {
      const details = this.$store?.state?.bmc?.managerNotReadyDetails;
      const base = this.$t('global.toast.bmcIsNotReady');
      return details ? `${base} (${details})` : base;
    },
  },
  async created() {
    this.managerStatusIntervalId = startManagerStatusCheck();
    this.handleSkipNavigation = () => {
      this.setFocus(this.$el);
    };
    eventBus.$on('skip-navigation', this.handleSkipNavigation);
    // App-wide detection of an in-progress firmware update so the global
    // FirmwareProgressBanner appears on any page after a refresh, regardless of
    // which session started the flash. attachExistingUpdateTask self-loads the
    // UpdateService URIs and polls, so this works without relying on SSE.
    try {
      await this.$store.dispatch('firmware/getUpdateServiceSettings');
    } catch (error) {
      console.error('[PageContainer] getUpdateServiceSettings failed:', error);
    }
    // Do not await — pollTask runs in the background; state updates drive the banner.
    this.$store
      .dispatch('firmware/attachExistingUpdateTask')
      .catch((error) =>
        console.error('[PageContainer] attachExistingUpdateTask failed:', error),
      );
  },
  mounted() {
    this.bannerOffsetObserver = observeAppBannerStack(this.$refs.bannerStack);
  },
  beforeUnmount() {
    if (this.bannerOffsetObserver) {
      this.bannerOffsetObserver.disconnect();
    }
    if (this.managerStatusIntervalId) {
      clearInterval(this.managerStatusIntervalId);
    }
    if (this.handleSkipNavigation) {
      eventBus.$off('skip-navigation', this.handleSkipNavigation);
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
    box-shadow: inset 0 0 0 2px var(--colors-brand, #{theme-color('primary')});
    outline: none;
  }

  @include media-breakpoint-up($responsive-layout-bp) {
    padding-inline-start: $spacer * 2;
  }
}
</style>
