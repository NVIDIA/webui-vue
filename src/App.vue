<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
export default {
  name: 'App',
  computed: {
    ...mapGetters('global', ['assetTag', 'modelType', 'serialNumber']),
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
    document.title = this.$route.meta.title || 'Page is missing title';
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
