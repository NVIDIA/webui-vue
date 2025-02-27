<template>
  <footer class="app-footer">
    <div class="app-footer-content">
      <span v-if="gitCommitSha" class="version-info">
        {{ $t('global.footer.version') }}: {{ gitCommitSha }}
      </span>
    </div>
  </footer>
</template>

<script>
import versionInfo from '@/env/version-info';
import { useI18n } from 'vue-i18n';

export default {
  name: 'AppFooter',
  data() {
    return {
      $t: useI18n().t,
      gitCommitSha: versionInfo && versionInfo.gitCommitSha ? versionInfo.gitCommitSha : ''
    };
  }
};
</script>

<style lang="scss" scoped>
@import "@/assets/styles/bmc/helpers/_index.scss";

.app-footer {
  grid-area: footer;
  background-color: $gray-100;
  border-top: 1px solid $gray-200;
  padding-left: $spacer * 0.5;
  padding-right: $spacer * 0.5;
  text-align: center;
  font-size: 0.7rem;
  font-weight: 100;
  color: $gray-600;
}

.app-footer-content {
  display: flex;
  justify-content: start;
  align-items: center;
}

.version-info {
  display: inline-block;
}
</style> 