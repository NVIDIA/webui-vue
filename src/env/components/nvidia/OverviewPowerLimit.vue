<template>
  <overview-card
    :title="$t('pageOverview.powerLimitInformation')"
    :to="`/resource-management/power-limit`"
  >
    <b-row class="mt-3">
      <b-col sm="6">
        <dl v-if="isLoading">
          <em>{{ $t('global.status.loading') }}</em>
        </dl>
        <dl v-else-if="!hasData">
          {{ $t('global.status.notAvailable') }}
        </dl>
        <dl v-else>
          <dt>{{ $t('pageOverview.gpuCount') }}</dt>
          <dd>{{ gpuCount }}</dd>
          <dt>{{ $t('pageOverview.totalGpuPower') }}</dt>
          <dd>{{ totalGpuPower }}</dd>
        </dl>
      </b-col>
      <b-col v-if="cpuCount > 0" sm="6">
        <dl>
          <dt>{{ $t('pageOverview.cpuCount') }}</dt>
          <dd>{{ cpuCount }}</dd>
          <dt>{{ $t('pageOverview.totalCpuPower') }}</dt>
          <dd>{{ totalCpuPower }}</dd>
        </dl>
      </b-col>
    </b-row>
  </overview-card>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import OverviewCard from '@/views/Overview/OverviewCard';
import eventBus from '@/eventBus';
import { usePowerLimits } from '@/api/composables/usePowerLimits';

const { t } = useI18n();

const { GpuMetrics, CpuMetrics, isLoading } = usePowerLimits();

const hasData = computed(
  () => GpuMetrics.value.length > 0 || CpuMetrics.value.length > 0,
);

const gpuCount = computed(() => GpuMetrics.value.length);
const cpuCount = computed(() => CpuMetrics.value.length);

const totalGpuPower = computed(() => {
  const total = GpuMetrics.value.reduce((sum, gpu) => {
    const reading = gpu.PowerWatts?.Reading;
    return typeof reading === 'number' ? sum + reading : sum;
  }, 0);
  return hasData.value && GpuMetrics.value.length > 0
    ? `${Math.round(total)} W`
    : t('global.status.notAvailable');
});

const totalCpuPower = computed(() => {
  const total = CpuMetrics.value.reduce((sum, cpu) => {
    const reading = cpu.PowerWatts?.Reading;
    return typeof reading === 'number' ? sum + reading : sum;
  }, 0);
  return CpuMetrics.value.length > 0
    ? `${Math.round(total)} W`
    : t('global.status.notAvailable');
});

// Emit completion event when loading finishes (matches Overview loading bar pattern)
watch(
  isLoading,
  (loading) => {
    if (!loading) {
      eventBus.$emit('overview-power-limit-complete');
    }
  },
  { immediate: true },
);
</script>
