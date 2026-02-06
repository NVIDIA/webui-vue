/**
 * Firmware Store - Pinia store for firmware update operations
 *
 * Manages firmware update state machine, progress tracking, and task polling.
 * Migrated from Vuex FirmwareStore.js to Pinia.
 *
 * State machine:
 *   null -> 'TaskStarted' -> 'TaskCompleted' -> 'Done'
 *                                            -> 'ResetFailed'
 *                                            -> 'WaitReadyFailed'
 *                         -> 'TaskFailed'
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { apiInstance } from '@/api/mutator/axios-instance';
import {
  getTaskServiceTasks,
  getTaskServiceTaskById,
  getGetUpdateServiceQueryOptions,
} from '@/api/endpoints/redfish.gen';
import { useGlobalStore } from '@/stores/global';
import type { Task } from '@/api/model/Task';
import type { UpdateService } from '@/api/model/UpdateService';
import i18n from '@/i18n';

// ============================================================================
// Configuration
// ============================================================================

function envInt(key: string, defaultValue: number): number {
  const envValue = import.meta.env[key];
  if (envValue == null) return defaultValue;
  const value = parseInt(envValue, 10);
  if (isNaN(value)) return defaultValue;
  return value;
}

const TASK_POLL_INTERVAL = envInt('VITE_FIRMWARE_UPDATE_POLL_INTERVAL', 4);
const TASK_POLL_TIMEOUT = envInt('VITE_FIRMWARE_UPDATE_POLL_TIMEOUT', 1200);
const MAX_TASK_POLL_TIME = TASK_POLL_TIMEOUT / TASK_POLL_INTERVAL;
const WAIT_FOR_READY_INTERVAL = envInt('VITE_WAIT_FOR_READY_INTERVAL', 8);
const WAIT_FOR_READY_TIME = envInt('VITE_WAIT_FOR_READY_TIME', 40);

// ============================================================================
// Types
// ============================================================================

/**
 * UI-specific state for firmware update workflow.
 * These states represent the UI state machine, not Redfish TaskState.
 */
export type FirmwareUpdateState =
  | null
  | 'TaskStarted'
  | 'TaskCompleted'
  | 'Done'
  | 'ResetFailed'
  | 'WaitReadyFailed'
  | 'TaskFailed';

/**
 * Firmware update tracking info.
 * Extends Redfish Task with UI-specific fields (PascalCase per Redfish-first).
 *
 * Redfish Task fields used:
 * - @odata.id: Task URI (replaces taskHandle)
 * - PercentComplete: Progress 0-100 (replaces taskPercent)
 * - Messages: Error/status messages (replaces errMsg)
 * - TaskState: Redfish task state
 * - TaskStatus: Redfish task health status
 */
export interface FirmwareUpdateInfo extends Partial<Omit<Task, 'PercentComplete'>> {
  /** UI state machine state (not the same as TaskState) */
  State: FirmwareUpdateState;
  /** Whether this client initiated the update */
  Initiator: boolean;
  /** Toggle to trigger reactivity on updates */
  Touch: boolean;
  /** Upload progress (0-100) before task is created */
  UploadProgress: number;
  /** Task progress 0-100 (writable override of readonly Task.PercentComplete) */
  PercentComplete?: number;
}

// ============================================================================
// Store Definition
// ============================================================================

export const useFirmwareStore = defineStore('firmware', () => {
  // ---------------------------------------------------------------------------
  // Vue Query client (for imperative fetchQuery calls)
  // ---------------------------------------------------------------------------
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const applyTime = ref<string | null>(null);
  const multipartHttpPushUri = ref<string | null>(null);
  const httpPushUri = ref<string | null>(null);
  const simpleUpdateUri = ref<string | null>(null);
  const allowableActions = ref<string[]>([]);
  const publicKeyExchangeUri = ref<string | null>(null);

  const firmwareUpdateInfo = ref<FirmwareUpdateInfo>({
    // UI-specific fields
    State: null,
    Initiator: false,
    Touch: false,
    UploadProgress: 0,
    // Redfish Task fields (initialized to defaults)
    PercentComplete: 0,
  });

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  const isFirmwareUpdateInProgress = computed(() => {
    const state = firmwareUpdateInfo.value.State;
    return (
      state !== null &&
      state !== 'Done' &&
      state !== 'ResetFailed' &&
      state !== 'WaitReadyFailed' &&
      state !== 'TaskFailed'
    );
  });

  const firmwareUploadProgress = computed(
    () => firmwareUpdateInfo.value.UploadProgress,
  );

  const sshAuthenticationMethods = computed(() => {
    const methods: string[] = [];
    if (publicKeyExchangeUri.value != null) methods.push('PublicKey');
    return methods;
  });

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  function sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  function extractResolutionFromError(error: unknown): string {
    const err = error as {
      response?: {
        data?: {
          error?: {
            '@Message.ExtendedInfo'?: Array<{ Resolution?: string }>;
          };
        };
      };
    };

    let resolutions = '';
    err?.response?.data?.error?.['@Message.ExtendedInfo']?.forEach((msg) => {
      if (msg?.Resolution != null && msg?.Resolution !== 'None.') {
        if (resolutions.length > 0) resolutions += '; ';
        resolutions += msg?.Resolution;
      }
    });

    if (resolutions.length > 0) return resolutions;
    return i18n.global.t('pageFirmware.toast.errorUpdateFirmware') as string;
  }

  function extractResolutionFromTask(resp: { data?: Task }): string {
    let resolutions = '';
    resp?.data?.Messages?.forEach((msg) => {
      if (msg?.Resolution != null && msg?.Resolution !== 'None.') {
        if (resolutions.length > 0) resolutions += '; ';
        resolutions += msg?.Resolution;
      }
    });

    if (resolutions.length > 0) return resolutions;
    return i18n.global.t(
      'pageFirmware.toast.errorCompleteUpdateFirmware',
    ) as string;
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Initialize firmware update tracking with a task handle
   */
  function initFirmwareUpdate(params: {
    TaskHandle: string | null;
    TaskState: FirmwareUpdateState;
    Initiator: boolean;
  }): void {
    firmwareUpdateInfo.value['@odata.id'] = params.TaskHandle ?? undefined;
    firmwareUpdateInfo.value.State = params.TaskState;
    firmwareUpdateInfo.value.PercentComplete = 0;
    firmwareUpdateInfo.value.Messages = undefined;

    // Check sessionStorage for initiator status (persists across page refresh)
    const storedInitiator =
      params.Initiator ||
      sessionStorage.getItem('firmwareUpdateInitiator') === 'true';
    firmwareUpdateInfo.value.Initiator = storedInitiator;
    sessionStorage.setItem('firmwareUpdateInitiator', String(storedInitiator));
  }

  /**
   * Set firmware update task and start polling
   * Called when a firmware update is detected (via SSE or user action)
   */
  async function setFirmwareUpdateTask(params: {
    TaskHandle: string;
    Initiator: boolean;
  }): Promise<void> {
    if (isFirmwareUpdateInProgress.value) {
      console.log('[Firmware] Update already in progress, ignoring new task');
      return;
    }

    console.log('[Firmware] Starting task tracking:', params.TaskHandle);
    initFirmwareUpdate({
      TaskHandle: params.TaskHandle,
      TaskState: 'TaskStarted',
      Initiator: params.Initiator,
    });

    await pollTask(params.TaskHandle);
  }

  /**
   * Poll a task until completion or failure
   */
  async function pollTask(TaskHandle: string): Promise<void> {
    let resp: { data?: Task } | null = null;
    let percent = 0;
    let consecutiveFailCount = 0;

    for (let i = 0; i < MAX_TASK_POLL_TIME; i++) {
      try {
        resp = await apiInstance<Task>({
          url: TaskHandle,
          method: 'GET',
        }).then((data) => ({ data }));
        percent = resp?.data?.PercentComplete ?? 0;
        consecutiveFailCount = 0;
      } catch (error) {
        console.warn('[Firmware] Task poll failed:', error);
        percent = firmwareUpdateInfo.value.PercentComplete ?? 0;
        consecutiveFailCount++;
        if (consecutiveFailCount >= 3) break;
      }

      percent = Math.min(percent, 100);
      firmwareUpdateInfo.value.PercentComplete = percent;
      firmwareUpdateInfo.value.Touch = !firmwareUpdateInfo.value.Touch;

      if (percent >= 100 || resp?.data?.TaskStatus !== 'OK') break;
      await sleep(TASK_POLL_INTERVAL);
    }

    // Check final task state
    if (
      percent < 100 ||
      resp?.data?.TaskState !== 'Completed' ||
      resp?.data?.TaskStatus !== 'OK'
    ) {
      console.warn('[Firmware] Task failed or incomplete:', resp?.data);
      // Store the task's Messages for error extraction
      firmwareUpdateInfo.value.Messages = resp?.data?.Messages;
      firmwareUpdateInfo.value.State = 'TaskFailed';
      firmwareUpdateInfo.value.Initiator = false;
      sessionStorage.setItem('firmwareUpdateInitiator', 'false');
    } else {
      firmwareUpdateInfo.value.State = 'TaskCompleted';
      await waitToActivate(resp);
    }
  }

  /**
   * Wait for firmware to activate after task completion
   */
  async function waitToActivate(
    resp: { data?: Task } | null,
  ): Promise<void> {
    // Only initiator should trigger reset
    if (firmwareUpdateInfo.value.Initiator) {
      const resetSuccess = await resetIfRequired(resp);
      if (!resetSuccess) {
        firmwareUpdateInfo.value.State = 'ResetFailed';
        firmwareUpdateInfo.value.Initiator = false;
        sessionStorage.setItem('firmwareUpdateInitiator', 'false');
        return;
      }
    }

    // Wait for BMC to become ready
    const ready = await waitForReady();
    if (!ready) {
      firmwareUpdateInfo.value.State = 'WaitReadyFailed';
      firmwareUpdateInfo.value.Initiator = false;
      sessionStorage.setItem('firmwareUpdateInitiator', 'false');
      return;
    }

    firmwareUpdateInfo.value.State = 'Done';
    firmwareUpdateInfo.value.Initiator = false;
    sessionStorage.setItem('firmwareUpdateInitiator', 'false');
  }

  /**
   * Wait for manager to become ready after reset
   */
  async function waitForReady(): Promise<boolean> {
    for (let i = 0; i < WAIT_FOR_READY_TIME; i++) {
      await sleep(WAIT_FOR_READY_INTERVAL);
      if (await isManagerStateEnabled()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if the manager is in enabled state.
   * Uses the global store to get the Manager URI, then fetches fresh status.
   */
  async function isManagerStateEnabled(): Promise<boolean> {
    const globalStore = useGlobalStore();

    try {
      // Get Manager from global store (fetches if not loaded)
      const manager = await globalStore.getManager();
      if (!manager) {
        console.log('[Firmware] No Manager available');
        return false;
      }

      // Fetch fresh manager status (don't use cached data during BMC reset polling)
      const managerUri = manager['@odata.id'];
      const freshManager = await apiInstance<{ Status?: { State?: string } }>({
        url: managerUri,
        method: 'GET',
      });

      return freshManager?.Status?.State === 'Enabled';
    } catch {
      console.log('[Firmware] Manager not ready yet');
      return false;
    }
  }

  /**
   * Reset BMC if required after firmware update
   */
  async function resetIfRequired(
    resp: { data?: Task } | null,
  ): Promise<boolean> {
    if (!firmwareUpdateInfo.value.Initiator) return true;

    // Check if reset is required from task messages
    const awaitMsg = resp?.data?.Messages?.find((e) =>
      e?.MessageId?.includes('AwaitToActivate'),
    );
    if (!awaitMsg?.Resolution?.includes('power cycle')) return true;

    const resetMsg = resp?.data?.Messages?.find((e) =>
      e?.MessageId?.includes('ResetRequired'),
    );
    const args = resetMsg?.MessageArgs;

    if (args?.length === 2) {
      try {
        await apiInstance({
          url: args[0],
          method: 'POST',
          data: { ResetType: args[1] },
        });
        return true;
      } catch (error) {
        console.error('[Firmware] Reset failed:', error);
        return false;
      }
    }

    return true;
  }

  /**
   * Find an existing firmware update task that may have been started before
   */
  async function findExistingUpdateTask(): Promise<string | null> {
    try {
      const tasksResp = await getTaskServiceTasks();

      const members = tasksResp?.Members ?? [];
      if (members.length === 0) return null;

      // Check tasks in reverse order (newest first)
      for (let i = members.length - 1; i >= 0; i--) {
        const taskHandle = members[i]?.['@odata.id'];
        if (!taskHandle) continue;

        try {
          // Extract task ID from URI (e.g., /redfish/v1/TaskService/Tasks/1 -> 1)
          const taskId = taskHandle.split('/').pop();
          if (!taskId) continue;

          const taskInfo = await getTaskServiceTaskById(taskId);

          const targetUri = taskInfo?.Payload?.TargetUri;
          if (
            targetUri != null &&
            (targetUri === multipartHttpPushUri.value ||
              targetUri === simpleUpdateUri.value ||
              targetUri === httpPushUri.value)
          ) {
            return taskHandle;
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      console.warn('[Firmware] Failed to find existing tasks:', error);
    }

    return null;
  }

  /**
   * Attach to an existing firmware update task if one exists
   */
  async function attachExistingUpdateTask(): Promise<void> {
    if (isFirmwareUpdateInProgress.value) return;

    const TaskHandle = await findExistingUpdateTask();
    if (TaskHandle) {
      console.log('[Firmware] Found existing task, attaching:', TaskHandle);
      await setFirmwareUpdateTask({
        TaskHandle,
        Initiator: false,
      });
    }
  }

  /**
   * Get update service settings
   */
  async function getUpdateServiceSettings(): Promise<void> {
    try {
      const data = await queryClient.fetchQuery(
        getGetUpdateServiceQueryOptions<UpdateService>(),
      );

      applyTime.value =
        data.HttpPushUriOptions?.HttpPushUriApplyTime?.ApplyTime ?? null;
      httpPushUri.value = data.HttpPushUri ?? null;
      multipartHttpPushUri.value = data.MultipartHttpPushUri ?? null;

      // TransferProtocol@Redfish.AllowableValues is a dynamic property not in the schema
      const simpleUpdate = data?.Actions?.['#UpdateService.SimpleUpdate'] as
        | { target?: string; 'TransferProtocol@Redfish.AllowableValues'?: string[] }
        | undefined;

      const actions = simpleUpdate?.['TransferProtocol@Redfish.AllowableValues'];
      if (actions) {
        allowableActions.value = actions;
      }

      simpleUpdateUri.value = simpleUpdate?.target ?? null;

      // Find public key exchange URI
      publicKeyExchangeUri.value = findPublicKeyExchangeUri(
        data?.Actions as Record<string, unknown> | undefined,
      );
    } catch (error) {
      console.error('[Firmware] Failed to get update service settings:', error);
    }
  }

  /**
   * Find public key exchange URI in actions
   */
  function findPublicKeyExchangeUri(
    actions: Record<string, unknown> | undefined,
  ): string | null {
    if (typeof actions !== 'object' || actions === null) return null;

    for (const key of Object.keys(actions)) {
      if (key.startsWith('#') && key.endsWith('.PublicKeyExchange')) {
        const action = actions[key] as { target?: string };
        return action?.target ?? null;
      }

      const nested = findPublicKeyExchangeUri(
        actions[key] as Record<string, unknown>,
      );
      if (nested) return nested;
    }

    return null;
  }

  /**
   * Reset the firmware update state
   */
  function resetFirmwareUpdateState(): void {
    firmwareUpdateInfo.value = {
      // UI-specific fields
      State: null,
      Initiator: false,
      Touch: false,
      UploadProgress: 0,
      // Redfish Task fields (initialized to defaults)
      PercentComplete: 0,
    };
    sessionStorage.removeItem('firmwareUpdateInitiator');
  }

  /**
   * Set upload progress (for upload progress bar)
   */
  function setUploadProgress(progress: number): void {
    firmwareUpdateInfo.value.UploadProgress = progress;
  }

  // ---------------------------------------------------------------------------
  // Return public API
  // ---------------------------------------------------------------------------

  return {
    // State
    applyTime,
    multipartHttpPushUri,
    httpPushUri,
    simpleUpdateUri,
    allowableActions,
    publicKeyExchangeUri,
    firmwareUpdateInfo,

    // Getters
    isFirmwareUpdateInProgress,
    firmwareUploadProgress,
    sshAuthenticationMethods,

    // Actions
    initFirmwareUpdate,
    setFirmwareUpdateTask,
    pollTask,
    findExistingUpdateTask,
    attachExistingUpdateTask,
    getUpdateServiceSettings,
    resetFirmwareUpdateState,
    setUploadProgress,

    // Helpers exposed for testing/external use
    extractResolutionFromError,
  };
});
