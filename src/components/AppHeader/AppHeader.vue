<template>
  <div>
    <header id="page-header">
      <a
        class="link-skip-nav btn btn-light"
        href="#main-content"
        @click="setFocus"
      >
        {{ $t('appHeader.skipToContent') }}
      </a>

      <b-navbar type="dark" :aria-label="$t('appHeader.applicationHeader')">
        <!-- Left aligned nav items -->
        <b-button
          id="app-header-trigger"
          class="nav-trigger"
          aria-hidden="true"
          type="button"
          variant="link"
          :class="{ open: isNavigationOpen }"
          @click="toggleNavigation"
        >
          <icon-close
            v-if="isNavigationOpen"
            :title="$t('appHeader.titleHideNavigation')"
          />
          <icon-menu
            v-if="!isNavigationOpen"
            :title="$t('appHeader.titleShowNavigation')"
          />
        </b-button>
        <b-navbar-nav>
          <b-navbar-brand
            class="me-0"
            to="/"
            data-test-id="appHeader-container-overview"
          >
            <img
              svg-inline
              class="header-logo"
              src="@/assets/images/nvidia-logo.svg"
              :alt="altLogo"
            />
          </b-navbar-brand>
          <div v-if="isNavTagPresent" :key="routerKey" class="ps-2 nav-tags">
            <span>|</span>
            <span class="ps-3 asset-tag">{{ assetTag }}</span>
            <span class="ps-3">{{ modelType }}</span>
            <span class="ps-3">{{ serialNumber }}</span>
          </div>
        </b-navbar-nav>
        <!-- Right aligned nav items -->
        <b-navbar-nav class="ms-auto helper-menu">
          <b-nav-item
            to="/logs/event-logs"
            data-test-id="appHeader-container-health"
          >
            <status-icon :status="healthStatusIcon" />
            {{ $t('appHeader.health') }}
          </b-nav-item>
          <b-nav-item
            to="/operations/server-power-operations"
            data-test-id="appHeader-container-power"
          >
            <span id="tooltip-target-power">
              <power-icon :status="powerStateIcon" />
              {{ $t('appHeader.power') }}
            </span>
            <b-tooltip target="tooltip-target-power" triggers="hover">
              <div>
                {{
                  $t('pageServerPowerOperations.powerState') +
                  ' : ' +
                  powerState
                }}
              </div>
              <div>
                {{
                  $t('pageServerPowerOperations.systemStatus') +
                  ' : ' +
                  (serverStatus && serverStatus.State ? serverStatus.State : '')
                }}
              </div>
            </b-tooltip>
          </b-nav-item>
          <!-- Redfish Logger button - Red when recording, Gray when not -->
          <li v-if="isRedfishLoggerFeatureEnabled" class="nav-item">
            <b-button
              id="app-header-redfish-logger"
              variant="link"
              data-test-id="appHeader-button-redfishLogger"
              :class="{ 'recording': isLoggingEnabled }"
              @click="toggleLogging"
              :title="isLoggingEnabled ? $t('appHeader.clickToStopRecording') : $t('appHeader.clickToStartRecording')"
            >
              <icon-recording v-if="isLoggingEnabled" class="recording-icon" :title="$t('appHeader.recording')" />
              <icon-recording-filled v-else class="not-recording-icon" :title="$t('appHeader.notRecording')" />
              <span class="responsive-text">{{ $t('appHeader.redfishLogger') }}</span>
            </b-button>
          </li>
          <li class="nav-item">
            <b-button
              id="app-header-refresh"
              variant="link"
              data-test-id="appHeader-button-refresh"
              @click="refresh"
            >
              <icon-renew :title="$t('appHeader.titleRefresh')" />
              <span class="responsive-text">{{ $t('appHeader.refresh') }}</span>
            </b-button>
          </li>
          <li class="nav-item">
            <b-dropdown
              id="app-header-user"
              variant="link"
              right
              data-test-id="appHeader-container-user"
            >
              <template #button-content>
                <icon-avatar :title="$t('appHeader.titleProfile')" />
                <span class="responsive-text">{{ username }}</span>
              </template>
              <b-dropdown-item
                to="/profile-settings"
                data-test-id="appHeader-link-profile"
                >{{ $t('appHeader.profileSettings') }}
              </b-dropdown-item>
              <b-dropdown-item
                data-test-id="appHeader-link-logout"
                @click="logout"
              >
                {{ $t('appHeader.logOut') }}
              </b-dropdown-item>
            </b-dropdown>
          </li>
        </b-navbar-nav>
      </b-navbar>
    </header>
    <loading-bar />
  </div>
</template>

<script>
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import IconAvatar from '@carbon/icons-vue/es/user--avatar/20';
import IconClose from '@carbon/icons-vue/es/close/20';
import IconMenu from '@carbon/icons-vue/es/menu/20';
import IconRenew from '@carbon/icons-vue/es/renew/20';
import IconRecording from '@carbon/icons-vue/es/recording/20';
import IconRecordingFilled from '@carbon/icons-vue/es/recording--filled/20';
import StatusIcon from '@/components/Global/StatusIcon';
import PowerIcon from '@/components/Global/PowerIcon';
import LoadingBar from '@/components/Global/LoadingBar';
import { mapState, mapGetters, mapActions } from 'vuex';
import i18n from '@/i18n';

export default {
  name: 'AppHeader',
  components: {
    IconAvatar,
    IconClose,
    IconMenu,
    IconRenew,
    IconRecording,
    IconRecordingFilled,
    StatusIcon,
    PowerIcon,
    LoadingBar,
  },
  mixins: [BVToastMixin],
  props: {
    routerKey: {
      type: Number,
      default: 0,
    },
  },
  emits: ['refresh'],
  data() {
    return {
      isNavigationOpen: false,
      altLogo: process.env.VUE_APP_COMPANY_NAME || 'Built on OpenBMC',
    };
  },
  computed: {
    ...mapState('authentication', ['consoleWindow']),
    ...mapGetters('global', ['assetTag', 'modelType', 'serialNumber', 'isAuthorized',
     'userPrivilege', 'serverStatus', 'powerState', 'username', 'healthStatus']),
    ...mapGetters('redfishLogger', {
      isRedfishLoggerFeatureEnabled: 'isFeatureEnabled',
      isLoggingEnabled: 'isLoggingEnabled',
      isLoggerVisible: 'isLoggerVisible',
    }),
    isNavTagPresent() {
      return this.assetTag || this.modelType || this.serialNumber;
    },
    powerStateIcon() {
      switch (this.powerState) {
        case 'On':
        case 'PoweringOff':
          return 'on';
        case 'PoweringOn':
          return 'on blink';
        case 'Paused':
          return 'on blink 1Hz';
        case 'Off':
          return 'off';
        case 'Secondary':
        default:
          return 'secondary';
      }
    },
    healthStatusIcon() {
      switch (this.healthStatus) {
        case 'OK':
          return 'success';
        case 'Warning':
          return 'warning';
        case 'Critical':
          return 'danger';
        default:
          return 'secondary';
      }
    },
  },
  watch: {
    consoleWindow() {
      if (this.consoleWindow === false && this.$eventBus && this.$eventBus.$consoleWindow) {
        this.$eventBus.$consoleWindow.close();
      }
    },
    isAuthorized(value) {
      if (value === false) {
        this.errorToast(i18n.global.t('global.toast.unAuthDescription'), {
          title: i18n.global.t('global.toast.unAuthTitle'),
        });
      }
    },
  },
  created() {
    // Reset auth state to check if user is authenticated based
    // on available browser cookies
    this.$store.dispatch('authentication/resetStoreState');
    this.getSystemInfo();
    this.getHealthStatus();
    this.getEvents();

  },
  mounted() {
    if (!this.$eventBus) return;
    this.navigationOpenHandler = (isNavigationOpen) => {
      this.isNavigationOpen = isNavigationOpen;
    };
    this.$eventBus.on('change-is-navigation-open', this.navigationOpenHandler);
  },
  beforeUnmount() {
    if (this.$eventBus && this.navigationOpenHandler) {
      this.$eventBus.off('change-is-navigation-open', this.navigationOpenHandler);
    }
  },
  methods: {
    getHealthStatus() {
      this.$store.dispatch('global/fetchHealthStatus');
    },
    getSystemInfo() {
      this.$store.dispatch('global/getSystemInfo');
    },
    getEvents() {
      this.$store.dispatch('eventLog/getLogData');
    },
    refresh() {
      this.$emit('refresh');
    },
    logout() {
      this.$store.dispatch('authentication/logout');
    },
    toggleNavigation() {
      if (this.$eventBus) {
        this.$eventBus.emit('toggle-navigation');
      }
    },
    setFocus(event) {
      event.preventDefault();
      if (this.$eventBus) {
        this.$eventBus.emit('skip-navigation');
      }
    },
    ...mapActions('redfishLogger', ['toggleLogging']),
  },
};
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

    // Ensure left and right navbar groups are distributed across the full width.
    // This is defensive against structural differences in bootstrap-vue-next markup
    // and cases where bootstrap navbar flex rules aren’t taking effect.
    > .container-fluid {
      display: flex;
      align-items: center;
      width: 100%;
      justify-content: space-between;
      flex-wrap: nowrap;
    }

    .helper-menu {
      // Ensure right-aligned items (Health/Power/Refresh/User) are pushed to the end of the header.
      // We do this in CSS (not just via utility classes) because we've observed the margin utility
      // class not always being applied as expected in the rendered DOM.
      margin-inline-start: auto;
      justify-content: flex-end;

      @include media-breakpoint-down(sm) {
        background-color: $gray-800;
        width: 100%;
        justify-content: flex-end;

        .nav-link,
        .btn {
          padding: calc(#{$spacer} / 1.125) calc(#{$spacer} / 2);
        }

        .nav-link:focus,
        .btn:focus {
          @include focus-box-shadow($gray-800);
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
    .nav-tags {
      color: theme-color-level(light, 3);
      @include media-breakpoint-down(sm) {
        @include visually-hidden;
      }
      .asset-tag {
        @include media-breakpoint-down($responsive-layout-bp) {
          @include visually-hidden;
        }
      }
    }
  }

  .nav-trigger {
    fill: theme-color('light');
    width: $header-height;
    height: $header-height;
    transition: none;
    display: inline-flex;
    flex: 0 0 20px;
    align-items: center;

    svg {
      margin: 0;
    }

    &:hover {
      fill: theme-color('light');
      background-color: theme-color-level(light, 10);
    }

    &.open {
      background-color: $gray-800;
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

  .navbar-expand {
    @include media-breakpoint-down(sm) {
      flex-flow: wrap;
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
