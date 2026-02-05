<template>
  <div class="nav-item">
    <router-link
      class="nav-link"
      to="/logs/event-logs"
      data-test-id="appHeader-container-health"
      :aria-label="t('appHeader.health')"
    >
      <span id="tooltip-target-health">
        <StatusIcon :status="HealthStatusIconClass" :aria-hidden="true" />
        <span class="responsive-text">{{ t('appHeader.health') }}</span>
      </span>
      <BTooltip
        target="tooltip-target-health"
        triggers="hover focus"
        aria-live="polite"
        boundary="viewport"
      >
        <div role="region" :aria-label="t('appHeader.health')">
          <div>
            {{ t('appHeader.health') }}: {{ HealthRollup }}
          </div>
          <div
            v-if="hasMetrics && ComponentHealth.length > 0"
            class="mt-2"
          >
            <div
              class="health-tooltip-grid"
              role="table"
              :aria-label="'Health Metrics'"
            >
              <div class="header" role="columnheader">
                <strong>Component</strong>
              </div>
              <div class="header" role="columnheader">
                <strong>Health</strong>
              </div>
              <div class="header" role="columnheader">
                <strong>Rollup</strong>
              </div>

              <template
                v-for="(Metric, Index) in ComponentHealth"
                :key="Index"
              >
                <div role="cell" :aria-label="'Component: ' + Metric.Name">
                  {{ Metric.Name }}
                </div>
                <div
                  :class="getStatusClass(Metric.Health)"
                  role="cell"
                  :aria-label="'Health: ' + Metric.Health"
                >
                  {{ Metric.Health }}
                </div>
                <div
                  :class="getStatusClass(Metric.HealthRollup)"
                  role="cell"
                  :aria-label="'Rollup: ' + Metric.HealthRollup"
                >
                  {{ Metric.HealthRollup }}
                </div>
              </template>
            </div>
          </div>
        </div>
      </BTooltip>
    </router-link>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { BTooltip } from 'bootstrap-vue-next';

import { useHealthRollup } from '@/api/composables/useHealthRollup';
import {
  useHealthMetrics,
  getHealthStatusClass,
} from '@/api/composables/useHealthMetrics';
import { ResourceHealth } from '@/api/model/ResourceHealth';

import StatusIcon from '@/components/Global/StatusIcon';

const { t } = useI18n();

// Get health rollup status with fallback chain
const { HealthRollup } = useHealthRollup();

// Get detailed per-component health metrics for tooltip
const { ComponentHealth, hasMetrics } = useHealthMetrics();

// Map health status to StatusIcon status prop
const HealthStatusIconClass = computed<
  'success' | 'warning' | 'danger' | 'secondary'
>(() => {
  switch (HealthRollup.value) {
    case ResourceHealth.OK:
      return 'success';
    case ResourceHealth.Warning:
      return 'warning';
    case ResourceHealth.Critical:
      return 'danger';
    case 'Unknown':
    default:
      return 'secondary';
  }
});

// Get CSS class for health status color coding in tooltip
function getStatusClass(Status: string): string {
  return getHealthStatusClass(Status);
}
</script>

<style lang="scss" scoped>
// Prevent icon and label from wrapping on narrow screens
#tooltip-target-health {
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

// Hide text on very narrow screens (matches PowerStateIcon behavior)
.responsive-text {
  @media (max-width: 575.98px) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
</style>

<style lang="scss">
// Global styles for tooltip (rendered outside component scope via portal)
.tooltip-inner .health-tooltip-grid {
  display: grid;
  grid-template-columns: auto auto auto;
  gap: 2px 12px;
  margin-top: 6px;
  align-items: center;
  min-width: 200px;
  width: max-content;

  .header {
    margin-bottom: 4px;
    font-weight: bold;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    padding-bottom: 2px;
    white-space: nowrap;
    font-size: 0.85rem;
  }

  div {
    white-space: nowrap;
    font-size: 0.85rem;
    padding: 0 2px;
  }

  div:nth-child(3n + 2),
  div:nth-child(3n) {
    text-align: center;
  }

  .text-success {
    color: #28a745;
  }

  .text-warning {
    color: #ffc107;
  }

  .text-danger {
    color: #dc3545;
  }
}

// Override Bootstrap tooltip max-width for health tooltip
.tooltip:has(.health-tooltip-grid) .tooltip-inner {
  max-width: none;
}
</style>
