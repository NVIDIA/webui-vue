<template>
  <common-logs :log-store="`eventLog`" :export-file-name="`event_log`" />
</template>

<script>
import CommonLogs from '@/views/Logs/CommonLogs';
export default {
  components: {
    CommonLogs,
  },
};
</script>
