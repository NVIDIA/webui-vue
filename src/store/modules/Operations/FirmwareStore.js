import api from '@/store/api';
import i18n from '@/i18n';
import { startManagerStatusCheck } from '@/services/ManagerStatusService';
import { getOdataId } from '@/utilities/redfishUtils';
import { isFirmwareUpdateTargetUri } from '@/utilities/firmwareUpdateTargetUri';

function envInt(key, defaultValue) {
  if (import.meta.env[key] == null) return defaultValue;
  const value = parseInt(import.meta.env[key]);
  if (isNaN(value)) return defaultValue;
  return value;
}

const TASK_POLL_INTERVAL = envInt('VITE_FIRMWARE_UPDATE_POLL_INTERVAL', 4);
const TASK_POLL_TIMEOUT = envInt('VITE_FIRMWARE_UPDATE_POLL_TIMEOUT', 1200);
const MAX_TASK_POLL_TIME = TASK_POLL_TIMEOUT / TASK_POLL_INTERVAL;
const WAIT_FOR_READY_INTERVAL = envInt('VITE_WAIT_FOR_READY_INTERVAL', 8);
const WAIT_FOR_READY_TIME = envInt('VITE_WAIT_FOR_READY_TIME', 40);

const TERMINAL_TASK_STATES = ['Completed', 'Exception', 'Killed', 'Cancelled'];

/** Prevent duplicate poll loops for the same task handle. */
let activeFirmwarePollTaskHandle = null;

/** Detect firmware tasks before Payload.TargetUri is populated. */
function isLikelyFirmwareUpdateTask(taskData) {
  if (!taskData || TERMINAL_TASK_STATES.includes(taskData.TaskState)) {
    return false;
  }
  const messages = taskData.Messages;
  if (!Array.isArray(messages)) return false;
  return messages.some((msg) => msg?.MessageId?.startsWith('Update.'));
}

function applyTaskPollSnapshot(commit, state, taskHandle, taskData) {
  if (!taskData) return;
  commit('setFirmwareUpdateTaskHandle', taskHandle);
  commit('setFirmwareUpdateTaskResponse', taskData);
  const percent = parsePercentComplete(taskData.PercentComplete);
  if (percent != null && percent !== state.firmwareUpdateInfo.taskPercent) {
    commit('setFirmwareUpdateTaskPercent', percent);
    commit('setFirmwareUpdateTouch');
  }
}

/** NVIDIA Update.1.0.ComponentUpdateSkipped — identical image, needs force. */
function findComponentUpdateSkipped(resp) {
  return resp?.data?.Messages?.find((msg) =>
    msg?.MessageId?.includes('ComponentUpdateSkipped'),
  );
}

function skippedUpdateMessage(skippedMsg) {
  const resolution = skippedMsg?.Resolution;
  if (resolution != null && resolution !== 'None.') return resolution;
  return skippedMsg?.Message ?? null;
}

function parsePercentComplete(value) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

/**
 * Firmware Store
 *
 * Handles firmware upload operations and UpdateService settings.
 * Firmware inventory fetching is now handled by useFirmwareInventory() composable.
 */
const FirmwareStore = {
  namespaced: true,
  state: {
    bmcFirmware: [],
    biosFirmware: [],
    firmwareInventory: [],
    bmcActiveFirmwareId: null,
    biosActiveFirmwareId: null,
    bmcSoftwareImageIds: [],
    biosSoftwareImageIds: [],
    checkedItems: [],
    applyTime: null,
    multipartHttpPushUri: null,
    httpPushUri: null,
    simpleUpdateUri: null,
    allowableActions: [],
    publicKeyExchangeUri: null,
    firmwareUpdateInfo: {
      /*  Firmware update states:
       *  null -> 'TaskStarted' -> 'TaskCompleted' -> 'Done'
       *                                           -> 'ResetFailed'
       *                                           -> 'WaitReadyFailed'
       *                        -> 'TaskFailed'
       *  TODO: try to use server-side states instead of this new client-side state machine
       */
      state: null,
      taskHandle: null,
      initiator: false,
      taskPercent: 0,
      errMsg: null,
      touch: false,
      uploadProgress: 0,
      jsonErrMsg: null,
      taskResponse: null,
      activationResetPerformed: false,
    },
  },
  getters: {
    multipartHttpPushUri: (state) => state.multipartHttpPushUri,
    allowableActions: (state) => state.allowableActions,
    sshAuthenticationMethods: (state) => {
      const methods = [];
      if (state.publicKeyExchangeUri != null) methods.push('PublicKey');
      return methods;
    },
    activeBmcFirmware: (state) => {
      return state.bmcFirmware.find(
        (firmware) => firmware.id === state.bmcActiveFirmwareId,
      );
    },
    activeBiosFirmware: (state) => {
      return state.biosFirmware.find(
        (firmware) => firmware.id === state.biosActiveFirmwareId,
      );
    },
    backupBmcFirmware: (state) => {
      return state.bmcFirmware.filter(
        (firmware) => firmware.id !== state.bmcActiveFirmwareId,
      );
    },
    backupBiosFirmware: (state) => {
      return state.biosFirmware.filter(
        (firmware) => firmware.id !== state.biosActiveFirmwareId,
      );
    },
    isBiosFirmwareAvailable: (state) => state.biosFirmware.length > 0,
    firmwareInventory: (state) => state.firmwareInventory,
    firmwareUpdateInfo: (state) => state.firmwareUpdateInfo,
    isFirmwareUpdateInProgress: (state) =>
      state.firmwareUpdateInfo.state !== null &&
      state.firmwareUpdateInfo.state !== 'Done' &&
      state.firmwareUpdateInfo.state !== 'ResetFailed' &&
      state.firmwareUpdateInfo.state !== 'WaitReadyFailed' &&
      state.firmwareUpdateInfo.state !== 'TaskFailed',
    getFirmwareUploadProgress: (state) =>
      state.firmwareUpdateInfo.uploadProgress,
  },
  mutations: {
    setActiveBmcFirmwareId: (state, id) => (state.bmcActiveFirmwareId = id),
    setActiveBiosFirmwareId: (state, id) => (state.biosActiveFirmwareId = id),
    setBmcFirmware: (state, firmware) => (state.bmcFirmware = firmware),
    setBiosFirmware: (state, firmware) => (state.biosFirmware = firmware),
    setBmcSoftwareImageIds: (state, ids) => (state.bmcSoftwareImageIds = ids),
    setBiosSoftwareImageIds: (state, ids) => (state.biosSoftwareImageIds = ids),
    setCheckedItems: (state, items) => (state.checkedItems = items),
    setFirmwareInventory(state, firmwareInventory) {
      state.firmwareInventory = firmwareInventory;
    },
    setApplyTime: (state, applyTime) => (state.applyTime = applyTime),
    setHttpPushUri: (state, httpPushUri) => (state.httpPushUri = httpPushUri),
    setMultipartHttpPushUri: (state, multipartHttpPushUri) =>
      (state.multipartHttpPushUri = multipartHttpPushUri),
    setSimpleUpdateUri: (state, simpleUpdateUri) =>
      (state.simpleUpdateUri = simpleUpdateUri),
    setAllowableActions: (state, allowableActions) =>
      (state.allowableActions = allowableActions),
    setPublicKeyExchangeUri: (state, publicKeyExchangeUri) =>
      (state.publicKeyExchangeUri = publicKeyExchangeUri),
    setFirmwareUpdateTaskHandle: (state, taskHandle) => {
      state.firmwareUpdateInfo.taskHandle = taskHandle;
    },
    setFirmwareUpdateInitiator: (state, initiator) => {
      state.firmwareUpdateInfo.initiator = initiator;
      sessionStorage.setItem('firmwareUpdateInitiator', initiator);
    },
    setFirmwareUpdateState: (state, updateState) =>
      (state.firmwareUpdateInfo.state = updateState),
    setFirmwareUpdateErrMsg: (state, errMsg) =>
      (state.firmwareUpdateInfo.errMsg = errMsg),
    setFirmwareUpdateTaskPercent: (state, percent) =>
      (state.firmwareUpdateInfo.taskPercent = percent),
    setFirmwareUpdateTouch: (state) =>
      (state.firmwareUpdateInfo.touch = !state.firmwareUpdateInfo.touch),
    setFirmwareUploadProgress: (state, progress) =>
      (state.firmwareUpdateInfo.uploadProgress = progress),
    setFirmwareUpdateJsonErrMsg: (state, jsonErrMsg) =>
      (state.firmwareUpdateInfo.jsonErrMsg = jsonErrMsg),
    setFirmwareUpdateTaskResponse: (state, taskResponse) =>
      (state.firmwareUpdateInfo.taskResponse = taskResponse),
    setFirmwareActivationResetPerformed: (state, performed) =>
      (state.firmwareUpdateInfo.activationResetPerformed = performed),
  },
  actions: {
    async getFirmwareInformation({ dispatch }) {
      await Promise.all([
        dispatch('getActiveBiosFirmware'),
        dispatch('getActiveBmcFirmware')
      ]);
      return await dispatch('getFirmwareInventory');
    },
    async getActiveBmcFirmware({ commit }) {
      return api
        .get(`${await this.dispatch('global/getBmcPath')}`)
        .then(({ data: { Links } }) => {
          const activeImageId = getOdataId(Links?.ActiveSoftwareImage);
          const softwareImageIds =
            Links?.SoftwareImages?.map((image) => getOdataId(image)) || [];

          commit('setActiveBmcFirmwareId', activeImageId);
          commit('setBmcSoftwareImageIds', softwareImageIds);
        })
        .catch((error) => console.log(error));
    },
    async getActiveBiosFirmware({ commit }) {
      return api
        .get(`${await this.dispatch('global/getSystemPath')}/Bios`)
        .then(({ data: { Links } }) => {
          const activeImageId = getOdataId(Links?.ActiveSoftwareImage);
          const softwareImageIds =
            Links?.SoftwareImages?.map((image) => getOdataId(image)) || [];
          commit('setActiveBiosFirmwareId', activeImageId);
          commit('setBiosSoftwareImageIds', softwareImageIds);
        })
        .catch((error) => console.log(error));
    },
    async getFirmwareInventory({ state, commit }) {
      const inventoryList = await api
        .get('/redfish/v1/UpdateService/FirmwareInventory')
        .then(({ data: { Members = [] } = {} }) =>
          Members.map((item) => api.get(getOdataId(item))),
        )
        .catch((error) => console.log(error));
      return await api
        .all(inventoryList)
        .then((response) => {
          const bmcFirmware = [];
          const biosFirmware = [];
          const firmwareInventory = [];
          response.forEach(({ data }) => {
            const item = {
              version: data?.Version,
              id: getOdataId(data),
              name: data?.Id,
              location: getOdataId(data),
              status: data?.Status?.Health,
              updateable: data?.Updateable,
              checked: false,
            };
            if (!item.name) {
              item.name = getOdataId(data)?.split('/').pop();
            }
            firmwareInventory.push(item);

            if (state.bmcSoftwareImageIds.includes(item.id)) {
              bmcFirmware.push(item);
            } else if (state.biosSoftwareImageIds.includes(item.id)) {
              biosFirmware.push(item);
            }
          });
          commit('setFirmwareInventory', firmwareInventory);
          commit('setBmcFirmware', bmcFirmware);
          commit('setBiosFirmware', biosFirmware);
          return firmwareInventory;
        })
        .catch((error) => {
          console.log(error);
        });
    },
    async getUpdateServiceSettings({ commit, dispatch }) {
      // Return the promise so callers can await it. findExistingUpdateTask /
      // attachExistingUpdateTask match a task's Payload.TargetUri against
      // multipartHttpPushUri (et al), so those URIs must be populated before the
      // task scan runs — otherwise the comparison is against null and silently
      // fails to attach an in-progress update on page load.
      return api
        .get('/redfish/v1/UpdateService')
        .then(async ({ data }) => {
          const applyTime =
            data.HttpPushUriOptions?.HttpPushUriApplyTime?.ApplyTime;
          commit('setApplyTime', applyTime);
          const httpPushUri = data.HttpPushUri;
          commit('setHttpPushUri', httpPushUri);
          const multipartHttpPushUri = data.MultipartHttpPushUri;
          commit('setMultipartHttpPushUri', multipartHttpPushUri);
          const allowableActions =
            data?.Actions?.['#UpdateService.SimpleUpdate']?.[
              'TransferProtocol@Redfish.AllowableValues'
            ];
          if (allowableActions != null)
            commit('setAllowableActions', allowableActions);
          const simpleUpdateUri =
            data?.Actions?.['#UpdateService.SimpleUpdate']?.['target'];
          commit('setSimpleUpdateUri', simpleUpdateUri);
          commit(
            'setPublicKeyExchangeUri',
            await dispatch('findPublicKeyExchangeUri', data?.Actions),
          );
        })
        .catch((error) => console.log(error));
    },
    async findPublicKeyExchangeUri({ dispatch }, actions) {
      if (typeof actions !== 'object') return null;
      for (const key of Object.keys(actions)) {
        if (key.startsWith('#') && key.endsWith('.PublicKeyExchange'))
          return actions[key]?.['target'];

        const uri = await dispatch('findPublicKeyExchangeUri', actions[key]);
        if (uri != null) return uri;
      }
      return null;
    },
    async uploadFirmware({ state, dispatch }, params) {
      if (state.multipartHttpPushUri != null) {
        return dispatch('uploadFirmwareMultipartHttpPush', params);
      } else if (state.httpPushUri != null) {
        return dispatch('uploadFirmwareHttpPush', params);
      } else {
        console.log('Do not support firmware push update');
      }
    },
    async uploadFirmwareHttpPush({ state, dispatch }, { image }) {
      return await api
        .post(state.httpPushUri, image, {
          headers: { 'Content-Type': 'application/octet-stream' },
        })
        .catch(async (error) => {
          console.log(error);
          throw new Error(
            await dispatch('extractResolutionForFailedCmd', error),
          );
        });
    },
    async uploadFirmwareMultipartHttpPush(
      { state, commit, dispatch },
      { image, targets, forceUpdate, applyTime = 'Immediate' },
    ) {
      commit('setFirmwareUploadProgress', 0);
      const formData = new FormData();
      const params = {};
      if (targets != null && targets.length > 0) {
        params.Targets = targets;
      }
      // When no targets selected, don't send Targets parameter
      // Let the server decide the default target
      if (forceUpdate) params.ForceUpdate = true;
      params['@Redfish.OperationApplyTime'] = applyTime;
      // Per the NVIDIA Firmware Update Guide (DU-12685-001), the UpdateParameters
      // part must be appended before UpdateFile AND must declare a Content-Type
      // of application/json. The bmcweb streaming multipart parser rejects any
      // other part order with Base.1.19.UnrecognizedRequestBody, and an
      // UpdateParameters part sent without a Content-Type (e.g. a plain string,
      // which FormData emits as text/plain with no type) with Base.1.19.HeaderMissing.
      // Appending a typed Blob makes the browser emit Content-Type: application/json
      // for this part, matching the documented `;type=application/json` form.
      formData.append(
        'UpdateParameters',
        new Blob([JSON.stringify(params)], { type: 'application/json' }),
      );
      formData.append('UpdateFile', image);
      return await api
        .post(state.multipartHttpPushUri, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
            commit('setFirmwareUploadProgress', percentCompleted);
          },
        })
        .catch(async (error) => {
          console.log(error);
          throw new Error(
            await dispatch('extractResolutionForFailedCmd', error),
            { cause: error },
          );
        });
    },
    async uploadFirmwareSimpleUpdate(
       
      { state, dispatch },
      { protocol, fileAddress, targets, username, forceUpdate },
    ) {
      const data = {
        TransferProtocol: protocol,
        ImageURI: fileAddress,
      };
      if (targets != null && targets.length > 0) data.Targets = targets;
      if (username != null) data.Username = username;
      if (forceUpdate) data.ForceUpdate = true;
      return await api
        .post(state.simpleUpdateUri, data)
        .catch(async (error) => {
          console.log(error);
          throw new Error(
            await dispatch('extractResolutionForFailedCmd', error),
            { cause: error },
          );
        });
    },
     
    extractResolutionForFailedCmd({ state }, error) {
      let resolutions = '';
      error?.response?.data?.error?.['@Message.ExtendedInfo']?.forEach(
        (msg) => {
          if (msg?.Resolution != null && msg?.Resolution !== 'None.') {
            if (resolutions.length > 0) resolutions += '; ';
            resolutions += msg?.Resolution;
          }
        },
      );

      if (resolutions.length > 0) return resolutions;
      else return i18n.global.t('pageFirmware.toast.errorUpdateFirmware');
    },
    initFirmwareUpdate({ commit }, { taskHandle, taskState, initiator }) {
      activeFirmwarePollTaskHandle = null;
      commit('setFirmwareUpdateTaskHandle', taskHandle);
      commit('setFirmwareUpdateState', taskState);
      commit('setFirmwareUpdateTaskPercent', 0);
      commit('setFirmwareUpdateErrMsg', null);
      commit('setFirmwareUpdateTaskResponse', null);
      commit('setFirmwareActivationResetPerformed', false);
      const resolvedInitiator =
        initiator !== undefined
          ? initiator
          : sessionStorage.getItem('firmwareUpdateInitiator') === 'true';
      commit('setFirmwareUpdateInitiator', resolvedInitiator);
    },
    async setFirmwareUpdateTask(
      { state, dispatch, commit, getters },
      { taskHandle, initiator },
    ) {
      const isCurrentTask =
        state.firmwareUpdateInfo.taskHandle === taskHandle;
      const inProgress = getters.isFirmwareUpdateInProgress;
      const clientState = state.firmwareUpdateInfo.state;

      if (inProgress && !isCurrentTask) return;

      const resp = await api.get(taskHandle).catch(() => null);
      const bmcState = resp?.data?.TaskState;
      const bmcStillActive =
        bmcState &&
        !TERMINAL_TASK_STATES.includes(bmcState) &&
        bmcState !== 'Completed';

      if (inProgress && isCurrentTask) {
        applyTaskPollSnapshot(commit, state, taskHandle, resp?.data);
        if (
          bmcStillActive &&
          clientState !== 'TaskStarted' &&
          clientState !== 'TaskCompleted'
        ) {
          commit('setFirmwareUpdateState', 'TaskStarted');
        }
        if (bmcStillActive && clientState === 'TaskStarted') {
          dispatch('pollTask', taskHandle);
        }
        return;
      }

      if (!bmcStillActive) return;

      await dispatch('initFirmwareUpdate', {
        taskHandle: taskHandle,
        taskState: 'TaskStarted',
        initiator: initiator,
      });
      applyTaskPollSnapshot(commit, state, taskHandle, resp?.data);
      dispatch('pollTask', taskHandle);
    },
    async pollTask({ state, commit, dispatch }, taskHandle) {
      if (activeFirmwarePollTaskHandle === taskHandle) return;
      activeFirmwarePollTaskHandle = taskHandle;

      let resp = null;
      let percent = 0;
      let consecutiveFailCount = 0;
      try {
        for (let i = 0; i < MAX_TASK_POLL_TIME; i++) {
          resp = await api.get(taskHandle).catch((error) => {
            console.log(error);
            return null;
          });
          const parsedPercent = parsePercentComplete(resp?.data?.PercentComplete);
          if (parsedPercent == null) {
            console.log(resp);
            percent = state.firmwareUpdateInfo.taskPercent;
            consecutiveFailCount++;
            if (consecutiveFailCount >= 3) break;
          } else {
            percent = parsedPercent;
            consecutiveFailCount = 0;
          }
          percent = percent <= 100 ? percent : 100;
          const prevPercent = state.firmwareUpdateInfo.taskPercent;
          if (percent !== prevPercent) {
            commit('setFirmwareUpdateTaskPercent', percent);
            commit('setFirmwareUpdateTouch');
          }
          if (resp?.data) {
            commit('setFirmwareUpdateTaskResponse', resp.data);
          }
          const taskStatus = resp?.data?.TaskStatus;
          if (
            (resp?.data && percent >= 100) ||
            (taskStatus != null && taskStatus !== 'OK')
          ) {
            break;
          }
          await dispatch('sleep', TASK_POLL_INTERVAL);
        }

        if (
          percent < 100 ||
          resp?.data?.TaskState !== 'Completed' ||
          resp?.data?.TaskStatus !== 'OK'
        ) {
          console.log(resp);
          const errMsg = await dispatch('extractResolutionForFailedTask', resp);
          commit('setFirmwareUpdateErrMsg', errMsg);
          commit('setFirmwareUpdateJsonErrMsg', resp?.data);
          commit('setFirmwareUpdateTaskPercent', 0);
          commit('setFirmwareUpdateState', 'TaskFailed');
          commit('setFirmwareUpdateInitiator', false);
        } else {
          const skippedMsg = findComponentUpdateSkipped(resp);
          if (skippedMsg) {
            commit('setFirmwareUpdateErrMsg', skippedUpdateMessage(skippedMsg));
            commit('setFirmwareUpdateJsonErrMsg', resp?.data);
            commit('setFirmwareUpdateTaskPercent', 0);
            commit('setFirmwareUpdateState', 'TaskFailed');
            commit('setFirmwareUpdateInitiator', false);
          } else {
            commit('setFirmwareUpdateState', 'TaskCompleted');
            await dispatch('waitToActive', resp);
          }
        }
      } finally {
        if (activeFirmwarePollTaskHandle === taskHandle) {
          activeFirmwarePollTaskHandle = null;
        }
      }
    },
    async waitToActive({ commit, dispatch, state }, resp) {
      if ((await dispatch('resetIfRequired', resp)) === false) {
        commit('setFirmwareUpdateState', 'ResetFailed');
        commit('setFirmwareUpdateInitiator', false);
        return;
      }

      // Only wait for the manager to become ready when this session already
      // performed an automatic activation reset. Otherwise offer manual reset
      // actions on the firmware form as soon as the flash task completes.
      if (state.firmwareUpdateInfo.activationResetPerformed) {
        if ((await dispatch('waitForReady', resp)) === false) {
          commit('setFirmwareUpdateState', 'WaitReadyFailed');
          commit('setFirmwareUpdateInitiator', false);
          return;
        }
      }

      commit('setFirmwareUpdateState', 'Done');
      commit('setFirmwareUpdateTaskPercent', 0);
      // Keep initiator set so FirmwareFormUpdate can show activation actions.
    },
    async waitForReady({ dispatch }, resp) {
      for (let i = 0; i < WAIT_FOR_READY_TIME; i++) {
        await dispatch('sleep', WAIT_FOR_READY_INTERVAL);
        if (await dispatch('isManagerStateEnabled')) return true;
      }
      return false;
    },
    async isManagerStateEnabled() {
      return await api
        .get(`${await this.dispatch('global/getBmcPath')}`, {timeout: 30 * 1000})
        .then((resp) => resp?.data?.Status?.State === 'Enabled')
        .catch(() => console.log('No response yet from Manager'));
    },
    async resetIfRequired({ state, commit, dispatch }, resp) {
      if (!state.firmwareUpdateInfo.initiator) return true;
      const resetRequired = await dispatch('extractResetRequired', resp);
      if (resetRequired == null) return true;
      const { resetUri, resetType, deviceId } = resetRequired;

      const bmcPath = await dispatch('global/getBmcPath');
      const isBmcManagerReset =
        resetUri === `${bmcPath}/Actions/Manager.Reset`;

      let promise = null;
      if (isBmcManagerReset) {
        promise = dispatch('controls/rebootBmc', {
          target: resetUri,
          parameters: { ResetType: resetType },
          managerId: deviceId,
        });
      } else {
        promise = api.post(resetUri, { ResetType: resetType });
        setTimeout(() => {
          try {
            startManagerStatusCheck();
          } catch (error) {
            console.log(error);
          }
        }, 5000);
      }

      return await promise
        .then(() => {
          commit('setFirmwareActivationResetPerformed', true);
          if (isBmcManagerReset) {
            // Match restartBmc / auxPowerResetSystem: show recovery modal while
            // the BMC is offline and reload once it responds again.
            dispatch('global/waitForBmcRecovery');
          }
          return true;
        })
        .catch((error) => {
          console.log(error);
          return false;
        });
    },
     
    async extractResetRequired({ state }, resp) {
      const resolutionMsg = resp?.data?.Messages?.find((e) =>
        e?.MessageId?.includes('AwaitToActivate'),
      );
      const deviceId = resolutionMsg?.MessageArgs?.[1];

      const resetRequiredMsg = resp?.data?.Messages?.find((e) =>
        e?.MessageId?.includes('ResetRequired'),
      );
      const args = resetRequiredMsg?.MessageArgs;
      if (args?.length === 2) return {
        resetUri: args[0],
        resetType: args[1],
        deviceId: deviceId,
      };

      // Bluefield bmc does not support resetRequired, use hard code instead
      if (import.meta.env.VITE_ENV_NAME === 'nvidia-bluefield') {
        const component = resolutionMsg?.MessageArgs;
        if (component?.includes('BMC_Firmware'))
          return {
            resetUri:
              '/redfish/v1/Managers/Bluefield_BMC/Actions/Manager.Reset',
            resetType: 'GracefulRestart',
            deviceId: 'BMC_Firmware',
          };
        else if (component?.includes('Bluefield_FW_ERoT'))
          return {
            resetUri:
              '/redfish/v1/Chassis/Bluefield_ERoT/Actions/Chassis.Reset',
            resetType: 'GracefulRestart',
            deviceId: 'Bluefield_FW_ERoT',
          };
      }
      return null;
    },
    async findExistingUpdateTask({ state }) {
      const resp = await api
        .get('/redfish/v1/TaskService/Tasks')
        .catch((error) => {
          console.log(error);
        });

      const members = resp?.data?.Members;
      if (!(members?.length > 0)) return null;

      for (let i = members.length - 1; i >= 0; i--) {
        const taskHandle = getOdataId(members[i]);
        const taskInfo = await api.get(taskHandle).catch((error) => {
          console.log(error);
        });
        const targetUri = taskInfo?.data?.Payload?.TargetUri;
        if (
          isFirmwareUpdateTargetUri(targetUri, state) ||
          isLikelyFirmwareUpdateTask(taskInfo?.data)
        ) {
          if (TERMINAL_TASK_STATES.includes(taskInfo?.data?.TaskState)) continue;
          return taskHandle;
        }
      }
      return null;
    },
    async attachExistingUpdateTask({ state, dispatch }) {
      if (state.multipartHttpPushUri == null && state.httpPushUri == null) {
        await dispatch('getUpdateServiceSettings');
      }
      const taskHandle = await dispatch('findExistingUpdateTask');
      if (taskHandle != null) {
        await dispatch('setFirmwareUpdateTask', {
          taskHandle,
          // Preserve initiator across refresh when this session started the update.
          initiator:
            sessionStorage.getItem('firmwareUpdateInitiator') === 'true',
        });
      }
    },
     
    extractResolutionForFailedTask({ state }, resp) {
      let resolutions = '';
      resp?.data?.Messages?.forEach((msg) => {
        if (msg?.Resolution != null && msg?.Resolution !== 'None.') {
          if (resolutions.length > 0) resolutions += '; ';
          resolutions += msg?.Resolution;
        }
      });

      if (resolutions.length > 0) return resolutions;
      else return i18n.global.t('pageFirmware.toast.errorCompleteUpdateFirmware');
    },
     
    sleep({ state }, seconds) {
      return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    },
    async switchBmcFirmwareAndReboot(_, backupLocation) {
      const data = {
        Links: {
          ActiveSoftwareImage: {
            '@odata.id': backupLocation,
          },
        },
      };
      return await api
        .patch(`${await this.dispatch('global/getBmcPath')}`, data)
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.global.t('pageFirmware.toast.errorSwitchImages'),
          );
        });
    },
    async restartBmc() {
      const bmcPath = await this.dispatch('global/getBmcPath');
      const message = await this.dispatch('controls/rebootBmc', {
        target: `${bmcPath}/Actions/Manager.Reset`,
        parameters: { ResetType: 'GracefulRestart' },
      });
      // Restarting the BMC takes the UI offline; show the recovery modal and
      // refresh the WebUI once it's back (shared with the AUX reset flow).
      this.dispatch('global/waitForBmcRecovery');
      return message;
    },
    // AUX power cycle (AC cycle) of the system chassis to activate staged
    // firmware. Uses the NVIDIA OEM action until a standard Chassis
    // FullPowerCycle ResetType is available. The OEM action lives on the BMC
    // chassis, which shares the BMC manager's id (derived from bmcPath).
    async auxPowerResetSystem({ dispatch }) {
      const bmcPath = await this.dispatch('global/getBmcPath');
      const bmcId = bmcPath?.split('/').filter(Boolean).pop();
      return await api
        .post(
          `/redfish/v1/Chassis/${bmcId}/Actions/Oem/NvidiaChassis.AuxPowerReset`,
          { ResetType: 'AuxPowerCycleForce' },
        )
        .then(() => {
          // The AC cycle takes the system (and BMC) offline briefly. The
          // session stays valid, so we must NOT log out on the resulting
          // timeouts — instead poll until the BMC responds again and then
          // refresh the whole WebUI (shared recovery flow used by BMC reset
          // too). Fire-and-forget so the toast shows now.
          this.dispatch('global/waitForBmcRecovery');
          return i18n.global.t('pageFirmware.toast.auxResetStartedMessage');
        })
        .catch(async (error) => {
          console.log(error);
          throw new Error(
            await dispatch('extractResolutionForFailedCmd', error),
          );
        });
    },
    async exchangePublicKey(
      { dispatch, state },
      { remoteServerIp, remoteServerKey },
    ) {
      const data = {
        RemoteServerIP: remoteServerIp,
        RemoteServerKeyString: remoteServerKey,
      };
      return await api
        .post(state.publicKeyExchangeUri, data)
        .then((resp) => {
          const bmcKey =
            resp?.data?.['@Message.ExtendedInfo']?.[0]?.MessageArgs?.[0];
          if (bmcKey == null || bmcKey.length == 0) return null;
          return bmcKey;
        })
        .catch(async (error) => {
          console.log(error);
          throw new Error(
            await dispatch('extractResolutionForFailedCmd', error),
          );
        });
    },
  },
};

export default FirmwareStore;
