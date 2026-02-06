<template>
  <b-button
    class="d-flex align-items-center"
    variant="primary"
    @click="exportData"
  >
    {{ $t('global.action.export') }}
  </b-button>
</template>

<script>
import { downloadAsJson } from '@/utilities/exportUtils';

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
    exportData() {
      downloadAsJson(this.data, this.fileName);
    },
  },
};
</script>
