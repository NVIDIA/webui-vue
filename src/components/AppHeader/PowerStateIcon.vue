<template>
  <li class="nav-item">
    <BDropdown
      id="power-dropdown"
      variant="link"
      end
      data-test-id="appHeader-container-power"
      :disabled="IsExecuting"
    >
      <template #button-content>
        <span id="power-tooltip-target">
          <PowerIcon :status="PowerStateIconStatus" :aria-hidden="true" />
          <span class="responsive-text">{{ t('appHeader.power') }}</span>
          <span
            v-if="IsExecuting"
            class="spinner-border spinner-border-sm ms-1"
            role="status"
            aria-hidden="true"
          ></span>
        </span>
        <BTooltip
          target="power-tooltip-target"
          triggers="hover"
          placement="bottom"
        >
          <div>Power State: {{ PowerState || 'Unknown' }}</div>
          <div v-if="SystemState">System State: {{ SystemState }}</div>
        </BTooltip>
      </template>

      <!-- Status Info Header -->
      <BDropdownHeader>
        {{ t('appHeader.power') }}: {{ PowerState || 'Unknown' }}
      </BDropdownHeader>
      <BDropdownText v-if="SystemState" class="text-muted small">
        System Status: {{ SystemState }}
      </BDropdownText>
      <BDropdownDivider />

      <!-- Power On -->
      <BDropdownItem
        v-if="isResetTypeSupported(ResourceResetType.On)"
        :disabled="IsExecuting"
        @click="executePowerAction(ResourceResetType.On)"
      >
        <IconPower class="me-2" />
        {{ t('pageServerPowerOperations.powerOn') }}
      </BDropdownItem>

      <!-- Graceful Shutdown -->
      <BDropdownItem
        v-if="isResetTypeSupported(ResourceResetType.GracefulShutdown)"
        :disabled="IsExecuting"
        @click="executePowerAction(ResourceResetType.GracefulShutdown)"
      >
        <IconPower class="me-2" />
        {{ t('pageServerPowerOperations.gracefulShutdown') }}
      </BDropdownItem>

      <!-- Graceful Restart -->
      <BDropdownItem
        v-if="isResetTypeSupported(ResourceResetType.GracefulRestart)"
        :disabled="IsExecuting"
        @click="executePowerAction(ResourceResetType.GracefulRestart)"
      >
        <IconRestart class="me-2" />
        {{ t('pageServerPowerOperations.gracefulRestart') }}
      </BDropdownItem>

      <!-- Force Actions Section (only show if any force actions are supported) -->
      <template
        v-if="
          isResetTypeSupported(ResourceResetType.ForceOn) ||
          isResetTypeSupported(ResourceResetType.ForceOff) ||
          isResetTypeSupported(ResourceResetType.ForceRestart) ||
          isResetTypeSupported(ResourceResetType.PowerCycle)
        "
      >
        <BDropdownDivider />
        <BDropdownHeader class="text-warning">
          Force Actions
        </BDropdownHeader>

        <!-- Force On -->
        <BDropdownItem
          v-if="isResetTypeSupported(ResourceResetType.ForceOn)"
          :disabled="IsExecuting"
          button-class="text-warning"
          @click="executePowerAction(ResourceResetType.ForceOn)"
        >
          <IconPower class="me-2" />
          Force On
        </BDropdownItem>

        <!-- Force Off -->
        <BDropdownItem
          v-if="isResetTypeSupported(ResourceResetType.ForceOff)"
          :disabled="IsExecuting"
          button-class="text-warning"
          @click="executePowerAction(ResourceResetType.ForceOff)"
        >
          <IconPower class="me-2" />
          {{ t('pageServerPowerOperations.forceOff') }}
        </BDropdownItem>

        <!-- Force Restart -->
        <BDropdownItem
          v-if="isResetTypeSupported(ResourceResetType.ForceRestart)"
          :disabled="IsExecuting"
          button-class="text-warning"
          @click="executePowerAction(ResourceResetType.ForceRestart)"
        >
          <IconRestart class="me-2" />
          {{ t('pageServerPowerOperations.forceRestart') }}
        </BDropdownItem>

        <!-- Power Cycle -->
        <BDropdownItem
          v-if="isResetTypeSupported(ResourceResetType.PowerCycle)"
          :disabled="IsExecuting"
          button-class="text-warning"
          @click="executePowerAction(ResourceResetType.PowerCycle)"
        >
          <IconRestart class="me-2" />
          Power Cycle
        </BDropdownItem>
      </template>
    </BDropdown>

    <!-- Error Toast -->
    <div
      v-if="ErrorMessage"
      class="position-fixed top-0 end-0 p-3"
      style="z-index: 1100"
    >
      <div class="toast show" role="alert">
        <div class="toast-header bg-danger text-white">
          <strong class="me-auto">{{ t('global.status.error') }}</strong>
          <button
            type="button"
            class="btn-close btn-close-white"
            @click="ErrorMessage = null"
          ></button>
        </div>
        <div class="toast-body">
          {{ ErrorMessage }}
        </div>
      </div>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery } from '@tanstack/vue-query';
import {
  BDropdown,
  BDropdownItem,
  BDropdownDivider,
  BDropdownHeader,
  BDropdownText,
  BTooltip,
} from 'bootstrap-vue-next';

import IconPower from '@carbon/icons-vue/es/power/16';
import IconRestart from '@carbon/icons-vue/es/restart/16';

import { apiInstance } from '@/api/mutator/axios-instance';
import { useGlobalStore } from '@/stores/global';
import { ResourcePowerState } from '@/api/model/ResourcePowerState';
import type { ComputerSystemResetRequestBody } from '@/api/model/ComputerSystemResetRequestBody';
import { ResourceResetType } from '@/api/model/ResourceResetType';
import type { ActionInfoParameters } from '@/api/model/ActionInfoParameters';

import PowerIcon from './PowerIcon.vue';

const { t } = useI18n();
const globalStore = useGlobalStore();

// Get system power state from global store (Vue Query backed)
const { PowerState, SystemState, ManagedSystem } = storeToRefs(globalStore);

// Type for ComputerSystem.Reset action
interface ResetAction {
  target?: string;
  '@Redfish.ActionInfo'?: string;
}

// Get Reset action from System.Actions
const ResetAction = computed<ResetAction | undefined>(() => {
  const Actions = ManagedSystem.value?.Actions as {
    '#ComputerSystem.Reset'?: ResetAction;
  } | undefined;
  return Actions?.['#ComputerSystem.Reset'];
});

// Get Reset action target
const ResetActionTarget = computed(() => ResetAction.value?.target);

// Get ActionInfo URL
const ActionInfoUrl = computed(() => ResetAction.value?.['@Redfish.ActionInfo']);

// ActionInfo response structure (Missing from OpenAPI.yaml)
// uses generated ActionInfoParameters type
interface ActionInfo {
  '@odata.id': string;
  '@odata.type': string;
  Id: string;
  Name: string;
  Parameters?: ActionInfoParameters[];
}

// Fetch ActionInfo to get AllowableValues for ResetType
const ActionInfoQuery = useQuery({
  queryKey: computed(() => ['actionInfo', ActionInfoUrl.value]),
  queryFn: async (): Promise<ActionInfo> => {
    const response = await apiInstance<ActionInfo>({
      url: ActionInfoUrl.value!,
      method: 'GET',
    });
    return response as ActionInfo;
  },
  enabled: computed(() => !!ActionInfoUrl.value),
  staleTime: 5 * 60 * 1000, // 5 minutes - action info rarely changes
});

// Get AllowableValues for ResetType parameter
const AllowableResetTypes = computed<string[]>(() => {
  const Parameters = ActionInfoQuery.data.value?.Parameters;
  if (!Parameters) return [];

  const ResetTypeParam = Parameters.find((p) => p.Name === 'ResetType');
  // Filter out null values from the readonly array
  return (ResetTypeParam?.AllowableValues ?? []).filter(
    (v): v is string => v !== null,
  );
});

// Check if a specific reset type is supported
function isResetTypeSupported(resetType: string): boolean {
  // If ActionInfo not loaded yet, assume all are supported (graceful degradation)
  if (!ActionInfoQuery.isSuccess.value) return true;
  // If AllowableValues is empty, assume all are supported
  if (AllowableResetTypes.value.length === 0) return true;
  return AllowableResetTypes.value.includes(resetType);
}

// Local state for error handling
const ErrorMessage = ref<string | null>(null);

// Map Redfish PowerState to PowerIcon status
const PowerStateIconStatus = computed<
  'on' | 'off' | 'on blink' | 'on blink 1Hz' | 'secondary'
>(() => {
  switch (PowerState.value) {
    case ResourcePowerState.On:
    case ResourcePowerState.PoweringOff:
      return 'on';
    case ResourcePowerState.Off:
      return 'off';
    case ResourcePowerState.PoweringOn:
      return 'on blink';
    case ResourcePowerState.Paused:
      return 'on blink 1Hz';
    default:
      return 'secondary';
  }
});

// Power action mutation
const PowerMutation = useMutation({
  mutationFn: async (ResetType: ComputerSystemResetRequestBody['ResetType']) => {
    // Use action target from System.Actions, fall back to constructed path
    const ActionTarget =
      ResetActionTarget.value ||
      (ManagedSystem.value?.['@odata.id']
        ? `${ManagedSystem.value['@odata.id']}/Actions/ComputerSystem.Reset`
        : null);

    if (!ActionTarget) {
      throw new Error('System not available');
    }

    return apiInstance<void>({
      url: ActionTarget,
      method: 'POST',
      data: { ResetType } as ComputerSystemResetRequestBody,
    });
  },
  onSuccess: () => {
    // Refetch system data after delay to allow BMC to process
    setTimeout(() => {
      globalStore.refetchManagedSystem();
    }, 2000);
  },
  onError: (error: unknown) => {
    // Extract error message from Redfish error response
    const ErrorResponse = error as {
      response?: { data?: { error?: { message?: string } } };
      message?: string;
    };
    const Message =
      ErrorResponse?.response?.data?.error?.message ||
      ErrorResponse?.message ||
      'Unknown error occurred';

    ErrorMessage.value = Message;

    // Auto-dismiss error after 5 seconds
    setTimeout(() => {
      ErrorMessage.value = null;
    }, 5000);
  },
});

const IsExecuting = computed(() => PowerMutation.isPending.value);

/**
 * Execute a power action on the system
 */
function executePowerAction(ResetType: ResourceResetType) {
  ErrorMessage.value = null;
  PowerMutation.mutate(ResetType);
}
</script>

<style scoped>
#power-tooltip-target {
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

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
