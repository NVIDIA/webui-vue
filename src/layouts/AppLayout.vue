<template>
  <div class="app-container">
    <app-header
      ref="focusTarget"
      class="app-header"
      :router-key="routerKey"
      @refresh="refresh"
    >
      <!-- SSE Status Indicator in header slot if available -->
      <template #status>
        <s-s-e-status-indicator />
      </template>
    </app-header>
    <app-navigation class="app-navigation" />
    <page-container class="app-content">
      <router-view ref="routerView" :key="routerKey" />
      <!-- Scroll to top button -->
      <button-back-to-top />
    </page-container>
  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader';
import AppNavigation from '@/components/AppNavigation';
import PageContainer from '@/components/Global/PageContainer';
import ButtonBackToTop from '@/components/Global/ButtonBackToTop';
import SSEStatusIndicator from '@/components/Global/SSEStatusIndicator.vue';
import JumpLinkMixin from '@/components/Mixins/JumpLinkMixin';
import eventBus from '@/eventBus';
import { useSSEInit } from '@/api/composables/useSSEInit';

export default {
  name: 'App',
  components: {
    AppHeader,
    AppNavigation,
    PageContainer,
    ButtonBackToTop,
    SSEStatusIndicator,
  },
  mixins: [JumpLinkMixin],
  setup() {
    // Initialize SSE connection for real-time events
    const sse = useSSEInit();

    return {
      sseStatus: sse.status,
      sseIsConnected: sse.isConnected,
    };
  },
  data() {
    return {
      routerKey: 0,
    };
  },
  watch: {
    $route: function () {
      this.$nextTick(function () {
        this.setFocus(this.$refs.focusTarget.$el);
      });
    },
  },
  mounted() {
    eventBus.$on('refresh-application', this.handleRefreshApplication);
    setInterval(() => {
      if (!localStorage.getItem('storedUsername')) {
        this.$eventBus.$consoleWindow?.close();
        this.refresh();
      }
    }, 10000);
  },
  beforeUnmount() {
    eventBus.$off('refresh-application', this.handleRefreshApplication);
  },
  methods: {
    handleRefreshApplication() {
      this.refresh();
    },
    refresh() {
      // Clear all toast messages
      document.querySelectorAll('.toast').forEach((toast) => {
        const toastId = toast.id;
        if (toastId) {
          this.$bvToast.hide(toastId);
        }
      });
      // Changing the component :key value will trigger
      // a component re-rendering and 'refresh' the view
      this.routerKey += 1;
    },
  },
};
</script>

<style lang="scss" scoped>
.app-container {
  display: grid;
  grid-template-columns: 100%;
  grid-template-rows: auto;
  grid-template-areas:
    'header'
    'content';

  @include media-breakpoint-up($responsive-layout-bp) {
    grid-template-columns: $navigation-width 1fr;
    grid-template-areas:
      'header header'
      'navigation content';
  }
}

.app-header {
  grid-area: header;
  position: sticky;
  top: 0;
  z-index: $zindex-fixed + 1;
}

.app-navigation {
  grid-area: navigation;
}

.app-content {
  grid-area: content;
  background-color: $white;
}
</style>
