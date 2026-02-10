<template>
  <b-container fluid="xl">
    <page-title />

    <!-- Header bar with stats and actions -->
    <b-row class="mb-3 align-items-center">
      <b-col sm="8" class="d-flex align-items-center flex-wrap gap-3">
        <!-- Power State -->
        <span class="boot-stat">
          <icon-power class="boot-stat__icon" />
          <span class="boot-stat__label">{{ $t('pageBootProgress.stats.power') }}:</span>
          <strong>{{ powerState || '—' }}</strong>
        </span>
        <!-- Boot Stage -->
        <span class="boot-stat">
          <icon-boot
            class="boot-stat__icon"
            :class="{ 'boot-stat__icon--spin': isBooting }"
          />
          <span class="boot-stat__label">{{ $t('pageBootProgress.stats.stage') }}:</span>
          <strong>{{ bootStageLabel || '—' }}</strong>
        </span>
        <!-- Elapsed -->
        <span class="boot-stat">
          <span class="boot-stat__label">{{ $t('pageBootProgress.stats.elapsed') }}:</span>
          <strong class="font-monospace">{{ elapsedTime }}</strong>
        </span>
        <!-- Entry Count -->
        <span class="boot-stat">
          <span class="boot-stat__label">        {{ $t('pageBootProgress.stats.entries') }}:</span>
        <strong>{{ CurrentBootEntries.length }}</strong>
        </span>
        <!-- Errors -->
        <span v-if="errorCount > 0" class="boot-stat boot-stat--error">
          <span class="boot-stat__label">{{ $t('pageBootProgress.stats.errors') }}:</span>
          <strong>{{ errorCount }}</strong>
        </span>
      </b-col>
      <b-col sm="4" class="text-end d-flex justify-content-end gap-2">
        <!-- Open SOL Console -->
        <b-button variant="outline-secondary" size="sm" @click="openConsoleWindow">
          <icon-launch class="me-1" />
          {{ $t('pageBootProgress.action.openConsole') }}
        </b-button>
        <!-- Reset -->
        <b-button variant="outline-secondary" size="sm" @click="resetView">
          {{ $t('pageBootProgress.action.reset') }}
        </b-button>
      </b-col>
    </b-row>

    <!-- Legend -->
    <b-row class="mb-3">
      <b-col class="d-flex gap-3 flex-wrap">
        <span
          v-for="state in legendStates"
          :key="state.id"
          class="boot-legend-item"
        >
          <span class="boot-legend-dot" :class="state.id" />
          {{ $t(`pageBootProgress.legend.${state.id}`) }}
        </span>
      </b-col>
    </b-row>

    <!-- Loading -->
    <b-row v-if="isLoading && CurrentBootEntries.length === 0" class="justify-content-center mb-3">
      <b-spinner :label="$t('pageBootProgress.loading')" />
    </b-row>

    <!-- Socket sections -->
    <div
      v-for="socket in enabledSockets"
      :key="socket.id"
      class="boot-socket-section mb-3"
    >
      <!-- Socket header -->
      <div class="boot-socket-header">
        <icon-chip class="boot-socket-header__icon" />
        <span class="boot-socket-header__title">{{ socket.name }}</span>
        <span class="boot-socket-header__stats">
          {{ $t('pageBootProgress.socket.processors') }}: {{ socket.processors.length }}
          &bull;
          {{ $t('pageBootProgress.socket.stages') }}: {{ getTotalStages(socket) }}
        </span>
      </div>

      <!-- Processor grid -->
      <div class="boot-processor-grid">
        <template
          v-for="processor in sortedProcessors(socket)"
          :key="processor.id"
        >
          <!-- Processor label -->
          <div class="boot-processor-label">
            <div class="boot-processor-name" :style="{ color: processor.color }">
              {{ processor.name }}
            </div>
            <div class="boot-processor-type">{{ processor.type }}</div>
          </div>

          <!-- Flow container -->
          <div
            class="boot-flow-container"
            :class="{ ccplex: processor.hasELLevels }"
          >
            <!-- CCPLEX: EL-level sub-rows -->
            <template v-if="processor.hasELLevels">
              <div class="boot-flow-grid ccplex">
                <div
                  v-for="el in [3, 2, 1, 0]"
                  :key="el"
                  class="boot-el-row"
                >
                  <span class="boot-el-label">EL{{ el }}</span>
                  <div
                    v-for="stage in stagesForEL(processor, el)"
                    :key="stage.id"
                    class="boot-stage-box"
                    :class="getStageState(processor.id, stage.id)"
                    :style="stageStyle(stage)"
                    :title="stage.name"
                    @click="selectStage(processor, stage)"
                  >
                    <div class="boot-stage-label">{{ stage.name }}</div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Regular: single-row layout -->
            <template v-else>
              <div class="boot-flow-grid">
                <div
                  v-for="stage in processor.stages"
                  :key="stage.id"
                  class="boot-stage-box"
                  :class="getStageState(processor.id, stage.id)"
                  :style="stageStyle(stage)"
                  :title="stage.name"
                  @click="selectStage(processor, stage)"
                >
                  <div class="boot-stage-label">{{ stage.name }}</div>
                </div>
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>

    <!-- Details panel (slide-in from right) -->
    <transition name="slide-right">
      <div v-if="selectedStage" class="boot-details-panel">
        <div class="boot-details-header">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0">{{ selectedStage.stage.name }}</h6>
            <button
              type="button"
              class="btn-close"
              :aria-label="$t('global.action.close')"
              @click="selectedStage = null"
            />
          </div>
          <small class="text-muted">
            {{ selectedStage.processor.name }} &mdash; {{ selectedStage.processor.type }}
          </small>
        </div>
        <div class="boot-details-body p-3">
          <div class="mb-3">
            <div class="boot-detail-label">{{ $t('pageBootProgress.details.state') }}</div>
            <div class="boot-detail-value">
              {{ getStageState(selectedStage.processor.id, selectedStage.stage.id) }}
            </div>
          </div>
          <div v-if="selectedStage.stage.runtime !== undefined" class="mb-3">
            <div class="boot-detail-label">{{ $t('pageBootProgress.details.runtime') }}</div>
            <div class="boot-detail-value">
              {{ selectedStage.stage.runtime ? $t('global.status.yes') : $t('global.status.no') }}
            </div>
          </div>
          <div v-if="selectedStage.stage.el !== undefined" class="mb-3">
            <div class="boot-detail-label">{{ $t('pageBootProgress.details.exceptionLevel') }}</div>
            <div class="boot-detail-value">EL{{ selectedStage.stage.el }}</div>
          </div>
          <div v-if="selectedStage.stage.dependsOn?.length" class="mb-3">
            <div class="boot-detail-label">{{ $t('pageBootProgress.details.dependencies') }}</div>
            <div class="d-flex flex-wrap gap-1">
              <b-badge
                v-for="dep in selectedStage.stage.dependsOn"
                :key="dep"
                variant="secondary"
              >
                {{ dep }}
              </b-badge>
            </div>
          </div>
          <div v-if="stagePostCodes.length" class="mb-3">
            <div class="boot-detail-label">
              {{ $t('pageBootProgress.details.postCodes') }} ({{ stagePostCodes.length }})
            </div>
            <div class="boot-detail-codes">
              <div
                v-for="code in stagePostCodes.slice(0, 20)"
                :key="code.logEntry.Id"
                class="boot-detail-code"
                :class="{ 'boot-detail-code--error': code.decoded.isError }"
              >
                <span class="font-monospace">{{ code.hexCode }}</span>
                <span v-if="code.decoded.label" class="ms-2 text-muted">
                  {{ code.decoded.label }}
                </span>
                <span class="ms-auto text-muted font-monospace">
                  {{ code.timeOffset.toFixed(4) }}s
                </span>
              </div>
              <div v-if="stagePostCodes.length > 20" class="text-muted small mt-1">
                {{ $t('pageBootProgress.details.moreEntries', { count: stagePostCodes.length - 20 }) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </b-container>
</template>

<script setup>
import { ref, computed } from 'vue';
import IconPower from '@carbon/icons-vue/es/power/20';
import IconBoot from '@carbon/icons-vue/es/renew/20';
import IconLaunch from '@carbon/icons-vue/es/launch/20';
import IconChip from '@carbon/icons-vue/es/chip/20';
import PageTitle from '@/components/Global/PageTitle';
import { useGlobalStore } from '@/stores/global';
import { usePostCodePolling } from '@/api/composables/usePostCodePolling';
import bootProgressConfig from '@/utilities/bootProgressConfig.json';

// ---------------------------------------------------------------------------
// Stores & composables
// ---------------------------------------------------------------------------

const globalStore = useGlobalStore();
const {
  CurrentBootEntries,
  CurrentBootCount,
  isLoading,
} = usePostCodePolling({ enablePolling: false });

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

const selectedStage = ref(null);

// ---------------------------------------------------------------------------
// Computed: global store values
// ---------------------------------------------------------------------------

const powerState = computed(() => globalStore.PowerState);
const isBooting = computed(() => globalStore.IsBooting);
const bootStageLabel = computed(() => {
  const oem = globalStore.BootProgressOemState;
  const coarse = globalStore.BootProgressState;
  // If OEM state looks like a raw hex code (0x...), prefer the coarse state
  if (oem && /^0x[0-9a-fA-F]+$/.test(oem)) {
    return coarse || oem;
  }
  return oem || coarse || null;
});

// ---------------------------------------------------------------------------
// Computed: config-driven layout
// ---------------------------------------------------------------------------

const enabledSockets = computed(() =>
  bootProgressConfig.sockets.filter((s) => s.enabled),
);

const legendStates = [
  { id: 'pending' },
  { id: 'running' },
  { id: 'complete' },
  { id: 'error' },
  { id: 'runtime' },
];

// ---------------------------------------------------------------------------
// Computed: POST code derived stats
// ---------------------------------------------------------------------------

const errorCount = computed(() =>
  CurrentBootEntries.value.filter((e) => e.decoded.isError).length,
);

const elapsedTime = computed(() => {
  const entries = CurrentBootEntries.value;
  if (entries.length === 0) return '0.0s';
  let maxTime = 0;
  for (const entry of entries) {
    if (entry.timeOffset > maxTime) maxTime = entry.timeOffset;
  }
  return `${maxTime.toFixed(1)}s`;
});

/**
 * Per-processor POST code stats: count, error count, first/last timestamp.
 * Used for per-stage state determination.
 */
const processorStats = computed(() => {
  const stats = {};
  for (const entry of CurrentBootEntries.value) {
    const proc = entry.decoded.processor;
    if (!stats[proc]) {
      stats[proc] = {
        count: 0,
        errors: 0,
        firstTime: Infinity,
        lastTime: -Infinity,
      };
    }
    stats[proc].count++;
    if (entry.decoded.isError) stats[proc].errors++;
    if (entry.timeOffset < stats[proc].firstTime) stats[proc].firstTime = entry.timeOffset;
    if (entry.timeOffset > stats[proc].lastTime) stats[proc].lastTime = entry.timeOffset;
  }
  return stats;
});

/**
 * Find the processor that has the latest POST code (the "current" one).
 */
const latestActiveProcessor = computed(() => {
  const stats = processorStats.value;
  let latest = null;
  let latestTime = -Infinity;
  for (const [proc, s] of Object.entries(stats)) {
    if (s.lastTime > latestTime) {
      latestTime = s.lastTime;
      latest = proc;
    }
  }
  return latest;
});

/**
 * POST codes for the selected stage's processor.
 */
const stagePostCodes = computed(() => {
  if (!selectedStage.value) return [];
  const procId = selectedStage.value.processor.id;
  return CurrentBootEntries.value.filter((e) => e.decoded.processor === procId);
});

// ---------------------------------------------------------------------------
// Methods: layout helpers
// ---------------------------------------------------------------------------

function sortedProcessors(socket) {
  return [...socket.processors].sort((a, b) => (a.row || 0) - (b.row || 0));
}

function getTotalStages(socket) {
  return socket.processors.reduce((sum, p) => sum + p.stages.length, 0);
}

function stagesForEL(processor, el) {
  return processor.stages.filter((s) => s.el === el);
}

const columnWidth = bootProgressConfig.columnWidth || 15;

function stageStyle(stage) {
  const left = (stage.position - 1) * columnWidth;
  const width = stage.span * columnWidth - 4;
  return {
    left: `${left}px`,
    width: `${width}px`,
  };
}

// ---------------------------------------------------------------------------
// Early processor state inference
//
// The BMC's PostCodes/Entries endpoint only contains UEFI status codes from
// the CCPLEX. Early boot processors (PSC, BPMP, OOB, RAS, MSEQ, PXIR) don't
// report through this mechanism — their boot progress is visible via SOL
// terminal streams (as in LogBench) but not via Redfish POST codes.
//
// We infer their state from the Redfish BootProgressState and the presence
// of ANY POST code data (which means the CCPLEX has started, implying all
// early processors finished).
// ---------------------------------------------------------------------------

/** Processors whose state must be inferred (no POST code data available) */
const EARLY_PROCESSORS = new Set(['psc', 'oob', 'ras', 'bpmp', 'mseq', 'pxir']);

/**
 * Infer processor stage state when no POST code data exists for it.
 *
 * Logic:
 *   - If system is Off or no boot progress → pending
 *   - If POST codes exist (CCPLEX has started) → early processors are
 *     complete/runtime (they finished before the first UEFI code)
 *   - If BootProgressState is OSRunning → everything is complete/runtime
 *   - During active boot with POST codes → early processors are complete,
 *     CCPLEX stages use POST code data (handled by getStageState)
 */
function inferStateFromBootProgress(processorId, stageId) {
  const power = powerState.value;
  const boot = globalStore.BootProgressState;
  const hasPostCodes = CurrentBootEntries.value.length > 0;

  // System is off or no boot progress at all → pending
  if (power !== 'On' || !boot || boot === 'None') {
    return 'pending';
  }

  // Early processors: if POST codes exist OR boot stage is past early
  // boot, these processors have completed.
  if (EARLY_PROCESSORS.has(processorId)) {
    const stageConfig = findStageConfig(processorId, stageId);

    if (hasPostCodes || boot === 'OSRunning') {
      // All early processors are done — return runtime or complete
      // based on the stage's runtime flag
      if (stageConfig?.runtime) return 'runtime';
      return 'complete';
    }

    // Boot is in progress but no POST codes yet — early processors
    // could still be running. Use boot stage to narrow down.
    // Any stage past PrimaryProcessorInit means PSC/BPMP are done.
    if (boot !== 'PrimaryProcessorInitializationStarted') {
      if (stageConfig?.runtime) return 'runtime';
      return 'complete';
    }

    // Very early boot — could be running
    if (isBooting.value) return 'running';
    return 'pending';
  }

  // CCPLEX with no POST codes: infer from boot stage
  if (processorId === 'ccplex') {
    if (boot === 'OSRunning' && !isBooting.value) {
      const stageConfig = findStageConfig(processorId, stageId);
      if (stageConfig?.runtime) return 'runtime';
      return 'complete';
    }
  }

  return 'pending';
}

/** Helper: find stage config by processor and stage ID */
function findStageConfig(processorId, stageId) {
  for (const socket of enabledSockets.value) {
    for (const proc of socket.processors) {
      if (proc.id === processorId) {
        return proc.stages.find((s) => s.id === stageId) || null;
      }
    }
  }
  return null;
}

/**
 * Determine stage state based on POST code data.
 *
 * Logic: Each processor row's stages are ordered by position. We use the
 * POST code data to determine which processors have been active, and the
 * timing to figure out which stages within a multi-stage processor are
 * complete vs running.
 *
 * For single-stage processors (OOB HUB, RAS FW, MSEQ, PXIR), the stage
 * is either pending (no codes), running (latest active), or
 * complete/runtime (another processor started after it).
 *
 * For multi-stage processors (PSC, BPMP), we use the stage position and
 * config to determine transitions (e.g., MB1 → BPMP FW based on
 * milestone codes like 0x70C4C004 "MB1: Finished").
 */
function getStageState(processorId, stageId) {
  const stats = processorStats.value[processorId];

  // No POST codes for this processor — infer state from boot progress.
  //
  // The BMC's PostCodes/Entries endpoint only contains UEFI status codes
  // from the CCPLEX. Early boot processors (PSC, BPMP, OOB, RAS, MSEQ,
  // PXIR) don't report through POST codes — their state is inferred from
  // the Redfish BootProgressState / power state.
  //
  // If the system is powered on and boot has progressed to any meaningful
  // stage, all early processors have necessarily completed (they run
  // before the CCPLEX generates its first POST code).
  if (!stats || stats.count === 0) {
    return inferStateFromBootProgress(processorId, stageId);
  }

  // Find the stage config
  let stageConfig = null;
  let processorConfig = null;
  for (const socket of enabledSockets.value) {
    for (const proc of socket.processors) {
      if (proc.id === processorId) {
        processorConfig = proc;
        stageConfig = proc.stages.find((s) => s.id === stageId);
        break;
      }
    }
    if (stageConfig) break;
  }

  if (!stageConfig) return 'pending';

  // Check if this processor has errors -- but only mark error state,
  // don't let it override the per-stage logic for other stages
  const hasErrors = stats.errors > 0;

  // For multi-stage processors, determine which stage we're in
  if (processorConfig && processorConfig.stages.length > 1) {
    const stages = processorConfig.stages;
    const stageIndex = stages.findIndex((s) => s.id === stageId);
    const isLastStage = stageIndex === stages.length - 1;
    const isFirstStage = stageIndex === 0;

    // Check if a later stage's triggers/dependencies have been met
    // by looking at whether POST codes from later processors exist
    // For BPMP: if C4C004+ codes exist → MB1 done, BPMP FW running
    // For PSC: if C1 codes exist → PSC ROM done, PSC FMC running

    // Simple heuristic: for first stage of multi-stage processor,
    // mark as complete if codes exist and system isn't in earliest boot
    if (isFirstStage && !isLastStage) {
      // First stage is complete once later activity shows progression
      const latestProc = latestActiveProcessor.value;
      if (latestProc !== processorId || !isBooting.value) {
        return hasErrors ? 'error' : 'complete';
      }
      return hasErrors ? 'error' : 'running';
    }

    if (isLastStage) {
      // Last stage: runtime if flagged, otherwise complete/running
      if (!isBooting.value) {
        return stageConfig.runtime ? 'runtime' : 'complete';
      }
      if (latestActiveProcessor.value === processorId) {
        return hasErrors ? 'error' : 'running';
      }
      return stageConfig.runtime ? 'runtime' : 'complete';
    }

    // Middle stages: similar to first/last logic
    return hasErrors ? 'error' : 'complete';
  }

  // Single-stage processor
  const latestProc = latestActiveProcessor.value;

  if (latestProc === processorId && isBooting.value) {
    return hasErrors ? 'error' : 'running';
  }

  if (!isBooting.value || latestProc !== processorId) {
    if (stageConfig.runtime) return 'runtime';
    return hasErrors ? 'error' : 'complete';
  }

  return 'running';
}

// ---------------------------------------------------------------------------
// Methods: actions
// ---------------------------------------------------------------------------

function selectStage(processor, stage) {
  selectedStage.value = { processor, stage };
}

function resetView() {
  selectedStage.value = null;
}

function openConsoleWindow() {
  window.open(
    '#/console/serial-over-lan-console',
    '_blank',
    'directories=no,titlebar=no,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=yes,width=600,height=550',
  );
}
</script>

<style lang="scss" scoped>
// ============================================================================
// Stats bar
// ============================================================================

.boot-stat {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.85rem;

  &__icon {
    flex-shrink: 0;
  }

  &__icon--spin {
    animation: spin 2s linear infinite;
  }

  &__label {
    color: $text-muted;
  }

  &--error {
    color: $danger;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

// ============================================================================
// Legend
// ============================================================================

.boot-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
}

.boot-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 2px solid;

  &.pending { border-color: $gray-400; background: $gray-200; opacity: 0.5; }
  &.running { border-color: $warning; background: rgba($warning, 0.2); }
  &.complete { border-color: $success; background: rgba($success, 0.15); }
  &.error { border-color: $danger; background: rgba($danger, 0.2); }
  &.runtime { border-color: $info; background: rgba($info, 0.2); }
}

// ============================================================================
// Socket sections
// ============================================================================

.boot-socket-section {
  background: $white;
  border: 1px solid $gray-300;
  border-radius: 0.5rem;
  overflow: hidden;
}

.boot-socket-header {
  background: $gray-100;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid $gray-300;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  &__icon {
    color: theme-color('primary');
  }

  &__title {
    font-size: 0.9rem;
    font-weight: 600;
  }

  &__stats {
    margin-left: auto;
    font-size: 0.75rem;
    color: $text-muted;
  }
}

// ============================================================================
// Processor grid
// ============================================================================

.boot-processor-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 1px;
  background: $gray-300;
}

.boot-processor-label {
  background: $gray-100;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.25rem;
  border-right: 2px solid $gray-300;
}

.boot-processor-name {
  font-size: 0.8rem;
  font-weight: 600;
}

.boot-processor-type {
  font-size: 0.65rem;
  color: $text-muted;
}

// ============================================================================
// Flow container & grid
// ============================================================================

.boot-flow-container {
  background: $white;
  padding: 0.75rem 1rem;
  position: relative;
  min-height: 45px;
  max-height: 60px;
  overflow-x: auto;

  &.ccplex {
    min-height: 180px;
    max-height: none;
  }
}

.boot-flow-grid {
  position: relative;
  height: 33px;
  width: 900px;

  &.ccplex {
    height: 160px;
    display: flex;
    flex-direction: column;
  }
}

// ============================================================================
// CCPLEX EL rows
// ============================================================================

.boot-el-row {
  position: relative;
  height: 40px;
  width: 900px;
  border-bottom: 1px solid $gray-200;

  &:last-child {
    border-bottom: none;
  }
}

.boot-el-label {
  position: absolute;
  left: 8px;
  top: 8px;
  font-size: 0.65rem;
  font-weight: 600;
  color: $text-muted;
  background: $gray-100;
  padding: 0.125rem 0.5rem;
  border-radius: 3px;
  z-index: 5;
}

// ============================================================================
// Stage box
// ============================================================================

.boot-stage-box {
  height: 33px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 600;
  position: absolute;
  transition: all 0.2s;
  border: 2px solid;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 0.5rem;
  z-index: 2;
  top: 0;

  &:hover {
    transform: translateY(-2px);
    z-index: 3;
  }

  // States
  &.pending {
    background: $gray-100;
    border-color: $gray-300;
    color: $text-muted;
    opacity: 0.5;
  }

  &.running {
    background: rgba($warning, 0.15);
    border-color: $warning;
    color: $warning;
    animation: pulse-border 1.5s ease-in-out infinite;
  }

  &.complete {
    background: rgba($success, 0.12);
    border-color: $success;
    color: $success;
  }

  &.error {
    background: rgba($danger, 0.15);
    border-color: $danger;
    color: $danger;
    animation: shake 0.5s ease-in-out;
  }

  &.runtime {
    background: rgba($info, 0.12);
    border-color: $info;
    color: $info;
    animation: glow-runtime 2s ease-in-out infinite;
  }
}

.boot-stage-label {
  text-align: center;
  line-height: 1.3;
}

@keyframes pulse-border {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba($warning, 0.4);
  }
  50% {
    box-shadow: 0 0 0 6px rgba($warning, 0);
  }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}

@keyframes glow-runtime {
  0%, 100% {
    box-shadow: 0 0 10px rgba($info, 0.3);
  }
  50% {
    box-shadow: 0 0 20px rgba($info, 0.5);
  }
}

// ============================================================================
// Details panel
// ============================================================================

.boot-details-panel {
  position: fixed;
  right: 0;
  top: $header-height;
  width: 380px;
  height: calc(100vh - #{$header-height});
  background: $white;
  border-left: 1px solid $gray-300;
  z-index: $zindex-fixed + 2;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
}

.boot-details-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid $gray-200;
  background: $gray-100;
}

.boot-details-body {
  flex: 1;
  overflow-y: auto;
}

.boot-detail-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: $text-muted;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.boot-detail-value {
  font-size: 0.85rem;
  text-transform: capitalize;
}

.boot-detail-codes {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid $gray-200;
  border-radius: 0.25rem;
}

.boot-detail-code {
  display: flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
  border-bottom: 1px solid $gray-100;

  &:last-child {
    border-bottom: none;
  }

  &--error {
    background: rgba($danger, 0.05);
    color: $danger;
  }
}

// ============================================================================
// Slide transition
// ============================================================================

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
