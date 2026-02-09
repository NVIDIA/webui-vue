<template>
  <div v-if="showBanner" class="boot-progress-banner">
    <b-alert
      :variant="errorCount > 0 ? 'warning' : 'info'"
      show
      class="boot-progress-banner__alert mb-0"
    >
      <div class="boot-progress-banner__content">
        <span class="boot-progress-banner__indicator" />
        <span class="boot-progress-banner__text">
          {{ $t('pageBootProgress.banner.booting') }}
          <template v-if="bootStageLabel">
            &mdash; {{ bootStageLabel }}
          </template>
        </span>
        <b-badge
          v-if="errorCount > 0"
          variant="danger"
          class="ms-2"
        >
          {{ $t('pageBootProgress.stats.errors') }}: {{ errorCount }}
        </b-badge>
        <router-link
          to="/operations/boot-progress"
          class="ms-3 btn btn-sm btn-primary"
        >
          {{ $t('pageBootProgress.banner.viewDetails') }}
        </router-link>
        <button
          type="button"
          class="ms-2 btn btn-sm btn-outline-secondary"
          :title="$t('pageBootProgress.banner.openConsole')"
          @click="openConsoleWindow"
        >
          {{ $t('pageBootProgress.banner.openConsole') }}
        </button>
      </div>
      <button
        type="button"
        class="btn-close boot-progress-banner__close"
        :aria-label="$t('global.action.close')"
        @click="dismiss"
      />
    </b-alert>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useGlobalStore } from '@/stores/global';
import { usePostCodePolling } from '@/api/composables/usePostCodePolling';

const globalStore = useGlobalStore();
const route = useRoute();
const { CurrentBootEntries } = usePostCodePolling();

const errorCount = computed(() =>
  CurrentBootEntries.value.filter((e) => e.decoded.isError).length,
);

const dismissed = ref(false);

// Show the banner when booting, not dismissed, and not on the boot progress page
const showBanner = computed(() => {
  if (!globalStore.IsBooting) return false;
  if (dismissed.value) return false;
  if (route.path === '/operations/boot-progress') return false;
  return true;
});

// Display OEM boot state or the coarse Redfish BootProgress state.
// If OEM state looks like a raw hex code (0x...), prefer the coarse state.
const bootStageLabel = computed(() => {
  const oem = globalStore.BootProgressOemState;
  const coarse = globalStore.BootProgressState;
  if (oem && /^0x[0-9a-fA-F]+$/.test(oem)) {
    return coarse || oem;
  }
  return oem || coarse || null;
});

// Reset dismissed flag when a new boot cycle starts
watch(
  () => globalStore.IsBooting,
  (booting, wasBooting) => {
    if (booting && !wasBooting) {
      dismissed.value = false;
    }
  },
);

function dismiss() {
  dismissed.value = true;
}

function openConsoleWindow() {
  window.open(
    '#/console/serial-over-lan-console',
    '_blank',
    'directories=no,titlebar=no,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=yes,width=600,height=550',
  );
}
</script>

<style lang="scss" scoped>
.boot-progress-banner {
  position: sticky;
  top: $header-height;
  left: 0;
  right: 0;
  z-index: $zindex-fixed;
}

.boot-progress-banner__alert {
  border-radius: 0;
  position: relative;
  padding-right: 2.5rem; // room for the close button
}

.boot-progress-banner__content {
  display: flex;
  align-items: center;
}

.boot-progress-banner__text {
  line-height: 1.4;
}

// Close button pinned to top-right corner
.boot-progress-banner__close {
  position: absolute;
  top: 0.6rem;
  right: 0.75rem;
}

// Gentle pulsing dot instead of the rapid spinner-grow
.boot-progress-banner__indicator {
  display: inline-block;
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: currentColor;
  margin-right: 0.5rem;
  animation: banner-pulse 2.5s ease-in-out infinite;
}

@keyframes banner-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.8); }
}
</style>
