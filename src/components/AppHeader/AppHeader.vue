<template>
  <div>
    <header id="page-header">
      <a
        class="link-skip-nav btn btn-light"
        href="#main-content"
        @click="setFocus"
      >
        {{ t('appHeader.skipToContent') }}
      </a>

      <b-navbar type="dark" :aria-label="t('appHeader.applicationHeader')">
        <!-- Left aligned nav items -->
        <div class="page-header-start">
          <b-button
            id="app-header-trigger"
            class="nav-trigger"
            type="button"
            variant="link"
            :class="{ open: isNavigationOpen }"
            :aria-label="
              isNavigationOpen
                ? t('appHeader.titleHideNavigation')
                : t('appHeader.titleShowNavigation')
            "
            :aria-expanded="isNavigationOpen"
            @click="toggleNavigation"
          >
            <icon-close
              v-if="isNavigationOpen"
              :title="t('appHeader.titleHideNavigation')"
            />
            <icon-menu
              v-if="!isNavigationOpen"
              :title="t('appHeader.titleShowNavigation')"
            />
          </b-button>
          <b-navbar-brand
            class="me-0"
            to="/"
            data-test-id="appHeader-container-overview"
          >
            <logo-header class="header-logo" :aria-label="altLogo" />
          </b-navbar-brand>
          <div v-if="isNavTagPresent" :key="routerKey" class="ps-2 nav-tags">
            <span>|</span>
            <span class="ps-3 asset-tag">{{ AssetTag }}</span>
            <span class="ps-3">{{ Model }}</span>
            <span class="ps-3 serial-number">{{ SerialNumber }}</span>
          </div>
        </div>
        <!-- Right aligned nav items -->
        <b-navbar-nav class="ms-auto helper-menu">
          <!-- SSE Status Indicator (only shows when not connected) -->
          <li class="nav-item d-flex align-items-center">
            <s-s-e-status-indicator />
          </li>

          <!-- Health Rollup Icon with tooltip -->
          <health-rollup-icon />

          <!-- Power State Icon with dropdown -->
          <power-state-icon />

          <!-- Redfish Logger button - Red when recording, Gray when not -->
          <li v-if="isRedfishLoggerFeatureEnabled" class="nav-item">
            <b-button
              id="app-header-redfish-logger"
              variant="link"
              data-test-id="appHeader-button-redfishLogger"
              :class="{ 'recording': isLoggingEnabled }"
              :title="isLoggingEnabled ? t('appHeader.clickToStopRecording') : t('appHeader.clickToStartRecording')"
              @click="toggleLogging"
            >
              <icon-recording v-if="isLoggingEnabled" class="recording-icon" :title="t('appHeader.recording')" />
              <icon-recording-filled v-else class="not-recording-icon" :title="t('appHeader.notRecording')" />
              <span class="responsive-text">{{ t('appHeader.redfishLogger') }}</span>
            </b-button>
          </li>

          <!-- Refresh button -->
          <li class="nav-item">
            <b-button
              id="app-header-refresh"
              variant="link"
              data-test-id="appHeader-button-refresh"
              @click="refresh"
            >
              <icon-renew :title="t('appHeader.titleRefresh')" />
              <span class="responsive-text">{{ t('appHeader.refresh') }}</span>
            </b-button>
          </li>

          <!-- User Menu with dropdown -->
          <user-menu />
        </b-navbar-nav>
      </b-navbar>
    </header>
    <loading-bar />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';

import IconClose from '@carbon/icons-vue/es/close/20';
import IconMenu from '@carbon/icons-vue/es/menu/20';
import IconRenew from '@carbon/icons-vue/es/renew/20';
import IconRecording from '@carbon/icons-vue/es/recording/20';
import IconRecordingFilled from '@carbon/icons-vue/es/recording--filled/20';

import LoadingBar from '@/components/Global/LoadingBar.vue';
import LogoHeader from '@/assets/images/nvidia-logo.svg?component';
import eventBus from '@/eventBus';
import { useAuthStore } from '@/stores/auth';
import { useGlobalStore } from '@/stores/global';
import { useEventLog } from '@/api/composables/useEventLog';
import { useStore } from 'vuex';

// Sub-components
import HealthRollupIcon from './HealthRollupIcon.vue';
import PowerStateIcon from './PowerStateIcon.vue';
import UserMenu from './UserMenu.vue';
import SSEStatusIndicator from '@/components/Global/SSEStatusIndicator.vue';

// Props
defineProps<{
  routerKey?: number;
}>();

// Emits
const emit = defineEmits<{
  refresh: [];
}>();

// Composables
const { t } = useI18n();
const authStore = useAuthStore();
const store = useStore();

// Global Store - Managed System (AssetTag, Model, SerialNumber)
const globalStore = useGlobalStore();
const { AssetTag, Model, SerialNumber } = storeToRefs(globalStore);

// Vue Query - Event Log (for refresh)
const { refetch: refetchEventLog } = useEventLog();

// Redfish Logger (Vuex store)
const isRedfishLoggerFeatureEnabled = computed(() => store.getters['redfishLogger/isFeatureEnabled']);
const isLoggingEnabled = computed(() => store.getters['redfishLogger/isLoggingEnabled']);
function toggleLogging() {
  store.dispatch('redfishLogger/toggleLogging');
}

// Reactive state
const isNavigationOpen = ref(false);

// Vendor branding from environment
const altLogo =
  import.meta.env.VITE_COMPANY_NAME || 'Built on OpenBMC';

// Computed - Auth store (replaced Vuex getters)
const consoleWindow = computed(() => authStore.consoleWindow);

// Computed - Nav tags presence
const isNavTagPresent = computed(
  () => AssetTag.value || Model.value || SerialNumber.value,
);

// Watchers
watch(consoleWindow, (value) => {
  if (value === false) {
    eventBus.$consoleWindow?.close();
  }
});

// Methods
function handleNavigationChange(navigationOpen: unknown) {
  isNavigationOpen.value = navigationOpen as boolean;
}

function refresh() {
  // Refetch system data via Vue Query
  globalStore.refetch();
  // Refetch event log data via Vue Query
  refetchEventLog();
  emit('refresh');
}

function toggleNavigation() {
  eventBus.$emit('toggle-navigation');
}

function setFocus(event: Event) {
  event.preventDefault();
  eventBus.$emit('skip-navigation');
}

// Lifecycle - reset auth store state on mount
authStore.resetStoreState();

// Lifecycle - mounted
onMounted(() => {
  eventBus.$on('change-is-navigation-open', handleNavigationChange);
});

// Lifecycle - beforeUnmount
onBeforeUnmount(() => {
  eventBus.$off('change-is-navigation-open', handleNavigationChange);
});
</script>

<style lang="scss">
@mixin focus-box-shadow($padding-color: $navbar-color, $outline-color: $white) {
  box-shadow:
    inset 0 0 0 3px $padding-color,
    inset 0 0 0 5px $outline-color;
}
.app-header {
  .link-skip-nav {
    position: absolute;
    top: -60px;
    left: 0.5rem;
    z-index: $zindex-popover;
    transition: $duration--moderate-01 $exit-easing--expressive;
    &:focus {
      top: 0.5rem;
      transition-timing-function: $entrance-easing--expressive;
    }
  }
  .navbar-text,
  .nav-link,
  .btn-link {
    color: $white !important;
    fill: currentColor;
    padding: 0.68rem 1rem !important;

    &:hover {
      background-color: theme-color-level(light, 10);
    }
    &:active {
      background-color: theme-color-level(light, 9);
    }
    &:focus {
      @include focus-box-shadow;
      outline: 0;
    }
  }

  .nav-item {
    fill: theme-color('light');
  }

  .navbar {
    padding: 0;
    background-color: $navbar-color;
    @include media-breakpoint-up($responsive-layout-bp) {
      height: $header-height;
    }

    > .container-fluid {
      display: flex;
      align-items: center;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      justify-content: space-between;
      flex-wrap: nowrap;
    }

    .page-header-start {
      display: flex;
      align-items: center;
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;

      @include media-breakpoint-down(sm) {
        flex: 0 0 auto;
        overflow: visible;
      }

      .nav-tags {
        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--text-color-secondary, #{theme-color-level(light, 3)});
        @include media-breakpoint-down(sm) {
          // Keep AssetTag/Model/SerialNumber in the accessibility tree on
          // narrow viewports. display: none would drop them for screen readers.
          @include visually-hidden;
        }
        .asset-tag {
          @include media-breakpoint-down($responsive-layout-bp) {
            @include visually-hidden;
          }
        }
      }
    }

    .helper-menu {
      flex: 0 0 auto;
      margin-inline-start: auto;
      justify-content: flex-end;
      overflow: visible;

      @include media-breakpoint-down(sm) {
        background-color: $navbar-color;
        width: auto;
        justify-content: flex-end;

        .nav-link,
        .btn {
          padding: calc(#{$spacer} / 1.125) calc(#{$spacer} / 2);
        }

        .nav-link:focus,
        .btn:focus {
          @include focus-box-shadow($navbar-color);
        }
      }

      .responsive-text {
        @include media-breakpoint-down(sm) {
          @include visually-hidden;
        }
      }
    }
  }

  .navbar-nav {
    @include media-breakpoint-up($responsive-layout-bp) {
      padding: 0 $spacer;
    }
    align-items: center;

    .navbar-brand,
    .nav-link {
      transition: $focus-transition;
    }
  }

  .nav-trigger {
    fill: theme-color('light');
    width: $header-height;
    height: $header-height;
    transition: none;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;

    svg {
      margin: 0;
    }

    &:hover {
      fill: theme-color('light');
      background-color: theme-color-level(light, 10);
    }

    &.open {
      background-color: $navbar-color;
    }

    @include media-breakpoint-up($responsive-layout-bp) {
      display: none;
    }
  }

  .dropdown-menu {
    margin-top: 0;
    z-index: $zindex-dropdown + 10;

    @include media-breakpoint-only(md) {
      margin-top: 4px;
    }
  }

  // Recording button styles
  .recording {
    .recording-icon {
      fill: #ff4444 !important;
      animation: pulse 1.5s ease-in-out infinite;
    }
  }

  .not-recording-icon {
    fill: $gray-500 !important;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
}

.navbar-brand {
  flex-shrink: 0;
  padding: calc(#{$spacer} / 2);
  height: $header-height;
  line-height: 1;
  &:focus {
    box-shadow:
      inset 0 0 0 3px $navbar-color,
      inset 0 0 0 5px $white;
    outline: 0;
  }
}
</style>
