<template>
  <b-modal
    v-model="show"
    :title="$t('global.systemRecovery.title')"
    centered
    no-close-on-backdrop
    no-close-on-esc
    hide-header-close
    hide-footer
  >
    <div class="text-center py-2">
      <b-spinner v-if="!recoveryTimedOut" class="mb-3" :label="$t('global.status.loading')" />
      <p class="mb-0">
        {{
          recoveryTimedOut
            ? $t('global.systemRecovery.timeoutMessage')
            : $t('global.systemRecovery.message')
        }}
      </p>
    </div>
  </b-modal>
</template>

<script>
export default {
  name: 'SystemRecoveryModal',
  computed: {
    recoveryTimedOut() {
      return this.$store.getters['global/recoveryTimedOut'];
    },
    show: {
      get() {
        return (
          this.$store.getters['global/recoveryInProgress'] ||
          this.recoveryTimedOut
        );
      },
      set() {
        // Ignore user-initiated close attempts while recovery is active.
      },
    },
  },
};
</script>
