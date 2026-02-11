<template>
  <b-container fluid="xl">
    <page-title :description="$t('pagePowerLimit.description')" />
    <b-overlay :show="isLoading" rounded="sm">
      <b-container v-if="isLoading">
        <em>{{ $t('global.status.loading') }}</em>
      </b-container>
      <b-container v-else-if="!hasData">
        {{ $t('pagePowerLimit.noProcessors') }}
      </b-container>

      <!-- Module-based grid: full-width for 1 module, 2-col for 2+ -->
      <b-row v-else>
        <b-col
          v-for="(Module, mi) in moduleEdits"
          :key="Module.Id"
          :lg="moduleEdits.length === 1 ? 12 : 6"
        >
          <b-card class="mb-4">
            <template #header>
              <strong>{{ Module.Name }}</strong>
            </template>

            <!-- GPU entries -->
            <div
              v-for="(Gpu, gi) in Module.GpuMetrics"
              :key="Gpu['@odata.id']"
              class="mb-3 pb-3 border-bottom"
            >
              <!-- GPU header: name + read-only info -->
              <div class="d-flex justify-content-between align-items-center mb-2">
                <strong>{{ processorLabel(Gpu) }}</strong>
                <span class="text-muted small">
                  {{ $t('pagePowerLimit.currentPower') }}:
                  {{ formatWatts(Gpu.PowerWatts?.Reading) }}
                  <template v-if="Gpu.Oem?.Nvidia?.GPUViewCPULimitWatts != null">
                    &ensp;|&ensp;
                    {{ $t('pagePowerLimit.gpuViewCpuLimit') }}:
                    {{ formatWatts(Gpu.Oem.Nvidia.GPUViewCPULimitWatts) }}
                  </template>
                  &ensp;|&ensp;
                  {{ $t('pagePowerLimit.effectiveTgp') }}:
                  {{ formatWatts(effectiveTgp(Module, Gpu)) }}
                </span>
              </div>

              <!-- TGP (Power Limit) row -->
              <div class="d-flex align-items-center gap-2 mb-2">
                <label class="control-label text-nowrap mb-0">
                  {{ $t('pagePowerLimit.gpuLimitLabel') }}
                </label>
                <b-form-input
                  v-model.number="Gpu.PowerLimitWatts.SetPoint"
                  type="number"
                  size="sm"
                  :min="Gpu.PowerLimitWatts?.AllowableMin"
                  :max="Gpu.PowerLimitWatts?.AllowableMax"
                  :state="gpuValidation(mi, gi, 'PowerLimitWatts')"
                  class="set-point-input"
                />
                <b-form-input
                  v-model.number="Gpu.PowerLimitWatts.SetPoint"
                  type="range"
                  :min="Gpu.PowerLimitWatts?.AllowableMin"
                  :max="Gpu.PowerLimitWatts?.AllowableMax"
                  class="flex-grow-1"
                />
                <small class="text-muted text-nowrap">
                  {{ Gpu.PowerLimitWatts?.AllowableMin }}–{{ Gpu.PowerLimitWatts?.AllowableMax }} W
                </small>
              </div>

              <!-- Base Power row -->
              <div
                v-if="Gpu.Oem?.Nvidia?.BasePowerWatts"
                class="d-flex align-items-center gap-2 mb-2"
              >
                <label class="control-label text-nowrap mb-0">
                  {{ $t('pagePowerLimit.basePowerLabel') }}
                </label>
                <b-form-input
                  v-model.number="Gpu.Oem.Nvidia.BasePowerWatts.SetPoint"
                  type="number"
                  size="sm"
                  :min="Gpu.Oem.Nvidia.BasePowerWatts.AllowableMin"
                  :max="Gpu.Oem.Nvidia.BasePowerWatts.AllowableMax"
                  :state="gpuValidation(mi, gi, 'BasePowerWatts')"
                  class="set-point-input"
                />
                <b-form-input
                  v-model.number="Gpu.Oem.Nvidia.BasePowerWatts.SetPoint"
                  type="range"
                  :min="Gpu.Oem.Nvidia.BasePowerWatts.AllowableMin"
                  :max="Gpu.Oem.Nvidia.BasePowerWatts.AllowableMax"
                  class="flex-grow-1"
                />
                <small class="text-muted text-nowrap">
                  {{ Gpu.Oem.Nvidia.BasePowerWatts.AllowableMin }}–{{ Gpu.Oem.Nvidia.BasePowerWatts.AllowableMax }} W
                </small>
              </div>

              <!-- EDPp row + Apply button -->
              <div
                v-if="Gpu.Oem?.Nvidia?.EDPpPercent"
                class="d-flex align-items-center gap-2 mb-1"
              >
                <label class="control-label text-nowrap mb-0">
                  EDPp (%)
                </label>
                <b-form-input
                  v-model.number="Gpu.Oem.Nvidia.EDPpPercent.SetPoint"
                  type="number"
                  size="sm"
                  :min="Gpu.Oem.Nvidia.EDPpPercent.AllowableMin"
                  :max="Gpu.Oem.Nvidia.EDPpPercent.AllowableMax"
                  :state="gpuValidation(mi, gi, 'EDPpPercent')"
                  class="set-point-input"
                />
                <b-form-input
                  v-model.number="Gpu.Oem.Nvidia.EDPpPercent.SetPoint"
                  type="range"
                  :min="Gpu.Oem.Nvidia.EDPpPercent.AllowableMin"
                  :max="Gpu.Oem.Nvidia.EDPpPercent.AllowableMax"
                  class="flex-grow-1"
                />
                <small class="text-muted text-nowrap">
                  {{ Gpu.Oem.Nvidia.EDPpPercent.AllowableMin }}–{{ Gpu.Oem.Nvidia.EDPpPercent.AllowableMax }}%
                </small>
                <b-button
                  variant="primary"
                  size="sm"
                  @click="saveGpuLimit(mi, gi)"
                >
                  {{ $t('global.action.save') }}
                </b-button>
              </div>

              <!-- Apply button fallback (when no EDPp row to hold it) -->
              <div
                v-if="!Gpu.Oem?.Nvidia?.EDPpPercent"
                class="d-flex justify-content-end mt-1"
              >
                <b-button
                  variant="primary"
                  size="sm"
                  @click="saveGpuLimit(mi, gi)"
                >
                  {{ $t('global.action.save') }}
                </b-button>
              </div>
            </div>

            <!-- CPU entries -->
            <div
              v-for="(Cpu, ci) in Module.CpuMetrics"
              :key="Cpu['@odata.id']"
              class="mb-2"
            >
              <!-- CPU header -->
              <div class="d-flex justify-content-between align-items-center mb-2">
                <strong>{{ processorLabel(Cpu) }}</strong>
                <span class="text-muted small">
                  {{ $t('pagePowerLimit.currentPower') }}:
                  {{ formatWatts(Cpu.PowerWatts?.Reading) }}
                </span>
              </div>

              <!-- TDP row + Apply button -->
              <div class="d-flex align-items-center gap-2">
                <label class="control-label text-nowrap mb-0">
                  {{ $t('pagePowerLimit.cpuLimitLabel') }}
                </label>
                <b-form-input
                  v-model.number="Cpu.PowerLimitWatts.SetPoint"
                  type="number"
                  size="sm"
                  :min="Cpu.PowerLimitWatts?.AllowableMin"
                  :max="Cpu.PowerLimitWatts?.AllowableMax"
                  :state="cpuValidation(mi, ci)"
                  class="set-point-input"
                />
                <b-form-input
                  v-model.number="Cpu.PowerLimitWatts.SetPoint"
                  type="range"
                  :min="Cpu.PowerLimitWatts?.AllowableMin"
                  :max="Cpu.PowerLimitWatts?.AllowableMax"
                  class="flex-grow-1"
                />
                <small class="text-muted text-nowrap">
                  {{ Cpu.PowerLimitWatts?.AllowableMin }}–{{ Cpu.PowerLimitWatts?.AllowableMax }} W
                </small>
                <b-button
                  variant="primary"
                  size="sm"
                  @click="saveCpuLimit(mi, ci)"
                >
                  {{ $t('global.action.save') }}
                </b-button>
              </div>
            </div>
          </b-card>
        </b-col>
      </b-row>
    </b-overlay>
  </b-container>
</template>

<script setup>
// TODO: Add privilege check for PATCH operations. Disable save buttons and
// input controls when the user's role lacks write access to EnvironmentMetrics,
// rather than hiding the page entirely (see exclusiveToRoles pattern).

import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'bootstrap-vue-next';
import PageTitle from '@/components/Global/PageTitle';
import {
  usePowerLimits,
  normalizeSetPoint,
} from '@/api/composables/usePowerLimits';

const { t } = useI18n();
const toast = useToast();

const {
  modules,
  isLoading,
  setCpuLimit,
  setGpuLimit,
} = usePowerLimits();

// ---------------------------------------------------------------------------
// Mutable edit state -- deep-cloned from query data with normalized SetPoints
// ---------------------------------------------------------------------------

const moduleEdits = reactive([]);

const hasData = computed(() =>
  moduleEdits.some((m) => m.CpuMetrics.length > 0 || m.GpuMetrics.length > 0),
);

/**
 * Create mutable edit copies of modules, normalizing SetPoints.
 * Deep-clones only the mutable nested objects (PowerLimitWatts, OEM fields).
 */
function syncEdits() {
  moduleEdits.length = 0;
  moduleEdits.push(
    ...modules.value.map((Module) => ({
      ...Module,
      CpuMetrics: Module.CpuMetrics.map((Cpu) => ({
        ...Cpu,
        PowerLimitWatts: {
          SetPoint: null,
          AllowableMin: null,
          AllowableMax: null,
          ...Cpu.PowerLimitWatts,
          SetPoint: normalizeSetPoint(
            Cpu.PowerLimitWatts?.SetPoint,
            Cpu.PowerLimitWatts?.AllowableMin,
            Cpu.PowerLimitWatts?.AllowableMax,
            Cpu.PowerLimitWatts?.DefaultSetPoint,
          ),
        },
      })),
      GpuMetrics: Module.GpuMetrics.map((Gpu) => ({
        ...Gpu,
        PowerLimitWatts: {
          SetPoint: null,
          AllowableMin: null,
          AllowableMax: null,
          ...Gpu.PowerLimitWatts,
          SetPoint: normalizeSetPoint(
            Gpu.PowerLimitWatts?.SetPoint,
            Gpu.PowerLimitWatts?.AllowableMin,
            Gpu.PowerLimitWatts?.AllowableMax,
            Gpu.PowerLimitWatts?.DefaultSetPoint,
          ),
        },
        Oem: {
          ...Gpu.Oem,
          Nvidia: {
            ...Gpu.Oem?.Nvidia,
            BasePowerWatts: {
              SetPoint: null,
              AllowableMin: null,
              AllowableMax: null,
              ...Gpu.Oem?.Nvidia?.BasePowerWatts,
              SetPoint: normalizeSetPoint(
                Gpu.Oem?.Nvidia?.BasePowerWatts?.SetPoint,
                Gpu.Oem?.Nvidia?.BasePowerWatts?.AllowableMin,
                Gpu.Oem?.Nvidia?.BasePowerWatts?.AllowableMax,
                Gpu.Oem?.Nvidia?.BasePowerWatts?.DefaultSetPoint,
              ),
            },
            EDPpPercent: {
              SetPoint: null,
              AllowableMin: null,
              AllowableMax: null,
              ...Gpu.Oem?.Nvidia?.EDPpPercent,
              SetPoint: normalizeSetPoint(
                Gpu.Oem?.Nvidia?.EDPpPercent?.SetPoint,
                Gpu.Oem?.Nvidia?.EDPpPercent?.AllowableMin,
                Gpu.Oem?.Nvidia?.EDPpPercent?.AllowableMax,
              ),
            },
          },
        },
      })),
    })),
  );
}

watch(modules, syncEdits, { deep: true, immediate: true });

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Extract a display label from an EnvironmentMetrics @odata.id */
function processorLabel(Metrics) {
  const match = Metrics['@odata.id']?.match(/\/Processors\/((?:CPU|GPU)_\d+)/);
  return match ? match[1] : Metrics.Name ?? 'Unknown';
}

function formatWatts(value) {
  return typeof value === 'number'
    ? `${Math.round(value)} W`
    : t('global.status.notAvailable');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validate a SetPoint is within [AllowableMin, AllowableMax] */
function inRange(SetPoint, AllowableMin, AllowableMax) {
  if (AllowableMin == null || AllowableMax == null) return null;
  if (SetPoint == null || SetPoint === '') return false;
  const val = Number(SetPoint);
  return val >= AllowableMin && val <= AllowableMax ? null : false;
}

function cpuValidation(mi, ci) {
  const Cpu = moduleEdits[mi]?.CpuMetrics?.[ci];
  if (!Cpu) return null;
  return inRange(
    Cpu.PowerLimitWatts?.SetPoint,
    Cpu.PowerLimitWatts?.AllowableMin,
    Cpu.PowerLimitWatts?.AllowableMax,
  );
}

function gpuValidation(mi, gi, field) {
  const Gpu = moduleEdits[mi]?.GpuMetrics?.[gi];
  if (!Gpu) return null;
  if (field === 'PowerLimitWatts') {
    return inRange(
      Gpu.PowerLimitWatts?.SetPoint,
      Gpu.PowerLimitWatts?.AllowableMin,
      Gpu.PowerLimitWatts?.AllowableMax,
    );
  }
  if (field === 'BasePowerWatts') {
    const BasePower = Gpu.Oem?.Nvidia?.BasePowerWatts;
    return inRange(
      BasePower?.SetPoint,
      BasePower?.AllowableMin,
      BasePower?.AllowableMax,
    );
  }
  if (field === 'EDPpPercent') {
    const EDPp = Gpu.Oem?.Nvidia?.EDPpPercent;
    return inRange(EDPp?.SetPoint, EDPp?.AllowableMin, EDPp?.AllowableMax);
  }
  return null;
}

/** Check if any field on a GPU edit is invalid */
function gpuHasError(mi, gi) {
  return (
    gpuValidation(mi, gi, 'PowerLimitWatts') === false ||
    gpuValidation(mi, gi, 'BasePowerWatts') === false ||
    gpuValidation(mi, gi, 'EDPpPercent') === false
  );
}

// ---------------------------------------------------------------------------
// Toast helpers
// ---------------------------------------------------------------------------

function successToast(message) {
  toast?.show?.({
    body: message,
    props: {
      title: t('global.status.success'),
      variant: 'success',
      isStatus: true,
      interval: 10000,
    },
  });
}

function errorToast(message) {
  toast?.show?.({
    body: message,
    props: {
      title: t('global.status.error'),
      variant: 'danger',
      isStatus: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Save actions
// ---------------------------------------------------------------------------

async function saveCpuLimit(mi, ci) {
  if (cpuValidation(mi, ci) === false) return;

  const Cpu = moduleEdits[mi].CpuMetrics[ci];
  try {
    await setCpuLimit.mutateAsync({
      MetricsUri: Cpu['@odata.id'],
      SetPoint: Cpu.PowerLimitWatts.SetPoint,
    });
    successToast(t('pagePowerLimit.toast.successSave'));
  } catch (error) {
    console.error(error);
    errorToast(t('pagePowerLimit.toast.errorSave'));
  }
}

async function saveGpuLimit(mi, gi) {
  if (gpuHasError(mi, gi)) return;

  const Gpu = moduleEdits[mi].GpuMetrics[gi];
  try {
    await setGpuLimit.mutateAsync({
      MetricsUri: Gpu['@odata.id'],
      SetPoint: Gpu.PowerLimitWatts.SetPoint,
      BasePowerSetPoint: Gpu.Oem?.Nvidia?.BasePowerWatts?.SetPoint,
      EDPpSetPoint: Gpu.Oem?.Nvidia?.EDPpPercent?.SetPoint ?? undefined,
    });
    successToast(t('pagePowerLimit.toast.successSave'));
  } catch (error) {
    console.error(error);
    errorToast(t('pagePowerLimit.toast.errorSave'));
  }
}

// ---------------------------------------------------------------------------
// Computed display values
// ---------------------------------------------------------------------------

/**
 * Compute effective TGP for a GPU within a module.
 * TGP_eff = MIN(TGP, BasePower + (totalUnusedCpu / numGpus))
 */
function effectiveTgp(Module, Gpu) {
  const CpuMetrics = Module.CpuMetrics;
  const NumGpus = Module.GpuMetrics.length;
  if (CpuMetrics.length === 0 || NumGpus === 0) return null;

  const TotalUnusedCpu = CpuMetrics.reduce((sum, Cpu) => {
    const CpuLimit = Number(Cpu.PowerLimitWatts?.SetPoint);
    const CpuReading = Number(Cpu.PowerWatts?.Reading);
    if (Number.isNaN(CpuLimit) || Number.isNaN(CpuReading)) return sum;
    return sum + Math.max(0, CpuLimit - CpuReading);
  }, 0);

  const BasePower = Number(Gpu.Oem?.Nvidia?.BasePowerWatts?.SetPoint);
  const GpuLimit = Number(Gpu.PowerLimitWatts?.SetPoint);
  if (Number.isNaN(BasePower) || Number.isNaN(GpuLimit)) return null;

  const BonusPerGpu = TotalUnusedCpu / NumGpus;
  return Math.round(Math.min(GpuLimit, BasePower + BonusPerGpu));
}
</script>

<style scoped>
.control-label {
  min-width: 130px;
  font-size: 0.875rem;
}
.set-point-input {
  width: 100px;
  min-width: 100px;
}
</style>
