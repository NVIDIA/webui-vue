<template>
  <b-button class="d-flex align-items-center" variant="primary" @click="href()">
    {{ $t('global.action.export') }}
  </b-button>
</template>

<script>
import { TextLogHandler } from '@/store/modules/Logs/TextLogHandler';
export default {
  props: {
    data: {
      type: Array,
      default: () => [],
    },
    fileName: {
      type: String,
      default: 'data',
    },
  },
  methods: {
    href() {
      var exportData = TextLogHandler().exportDataFromJSON(
        this.data,
        this.fileName,
        null
      );
      return `data:text/json;charset=utf-8,${exportData}`;
    },
  },
};
</script>
