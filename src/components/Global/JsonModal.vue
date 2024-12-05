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
export default {
  props: {
    title: {
      required: true,
    },
  },
  methods: {
    parsedJsonContent() {
      const slotContent = this.$slots.default?.[0]?.text;
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