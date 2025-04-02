<template>
  <div id="app">
    <!-- RedfishLogger: conditionally render only when feature is enabled (reviewer fix #3) -->
    <component 
      :is="redfishLoggerComponent" 
      v-if="isRedfishLoggerEnabled && redfishLoggerComponent" 
    />
    <router-view />
    <confirm-modal />
    <b-orchestrator />
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import ConfirmModal from '@/components/Global/ConfirmModal.vue';
import { BOrchestrator } from 'bootstrap-vue-next';
import { defineAsyncComponent, shallowRef } from 'vue';

export default {
  name: 'App',
  components: { 
    ConfirmModal, 
    BOrchestrator,
  },
  data() {
    return {
      // Use shallowRef to avoid deep reactivity on component definition
      redfishLoggerComponent: shallowRef(null),
    };
  },
  computed: {
    ...mapGetters('global', ['assetTag', 'modelType', 'serialNumber']),
    isRedfishLoggerEnabled() {
      return process.env.VUE_APP_ENABLE_REDFISH_LOGGER === 'true';
    },
  },
  watch: {
    assetTag: function (tag) {
      if (tag) {
        document.title = `${tag} - ${this.$route.meta.title}`;
      }
    },
    modelType: function () {
      this.setTitle(this.$route.meta.title);
    },
    serialNumber: function () {
      this.setTitle(this.$route.meta.title);
    },
    '$route': function (to) {
      this.setTitle(to.meta.title);
    },
  },
  created() {
    // Set page title
    document.title = this.$route.meta.title || 'Page is missing title';
    // Only load RedfishLogger component when feature is enabled (reviewer fix #3)
    if (this.isRedfishLoggerEnabled) {
      this.redfishLoggerComponent = defineAsyncComponent(() => 
        import('@/components/Global/RedfishLogger')
      );
    }
  },
  methods: {
    setTitle(title) {
      let titlePrefix = "";
      if (this.assetTag) titlePrefix += `${this.assetTag} `;
      else {
        if (this.modelType) titlePrefix += `${this.modelType} `;
        if (this.serialNumber) titlePrefix += `${this.serialNumber} `;
      }

      document.title = titlePrefix.length > 0 ? `${titlePrefix}- ${title}` : title || document.title;
    },
  },
};
</script>

<style lang="scss">
@import '@/assets/styles/_obmc-custom';
</style>
