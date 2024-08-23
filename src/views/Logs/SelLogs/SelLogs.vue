<template>
  <common-logs
    :log-store="`selLog`"
    :export-file-name="`sel_log`"
    :opt-fields="[`sensor`, `asserted`]"
    :hide-fields="[`status`]"
  />
</template>

<script>
import CommonLogs from '@/views/Logs/CommonLogs';
export default {
  components: {
    CommonLogs,
  },
};
</script>
