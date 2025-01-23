<template>
  <b-modal
    id="json-modal"
    :title="title"
  >
    <pre>{{ parsedJsonContent() }}</pre>
    <template #modal-footer="{ ok }">
      <b-button variant="primary" @click="ok()">
        {{ $t('global.action.ok') }}
      </b-button>
    </template>
  </b-modal>
</template>

<script>
import { useI18n } from 'vue-i18n';

export default {
  props: {
    title: {
      required: true,
    },
  },
  data() {
    return {
      $t: useI18n().t,
    };
  },
  methods: {
    parsedJsonContent() {
      const slotContent = this.$slots.default?.()?.[0]?.children;
      if (slotContent) {
        try {
          return JSON.stringify(JSON.parse(slotContent), null, 2);
        } catch (e) {
          return slotContent;
        }
      } else {
        return "";
      }
    },
  },
};
</script>