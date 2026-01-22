import api from '@/store/api';
import i18n from '@/i18n';
import { startManagerStatusCheck } from '@/services/ManagerStatusService';
import redfishUtils, { getOdataId } from '@/utilities/redfishUtils';
/**
 * Watch for serverStatus changes in GlobalStore module
 * to set isOperationInProgress state
 * Allows run get API from redfish function starting
 * after the interval of 5 seconds time, then repeating continuously
 * at that interval until serverStatus.State value matches passed argument
 * then Stop watching status changes and resolve Promise.
 * @param {string} serverState
 * @returns {Promise}
 */
const checkForServerState = function (serverState) {
  let unwatch = null;
  let timer = null;
  let timeout = null;
  let hasStateChanged = false;
  const store = this;
  const initialState = store.state.global.system?.Status?.State;
  const waitForTimeout = 300000; // 5 minutes

  const cleanup = () => {
    if (timeout) clearTimeout(timeout);
    if (unwatch) unwatch();
    if (timer) clearInterval(timer);
  };

  return new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      cleanup();
      if (store.state.global.system?.Status?.State === serverState) {
        resolve();
      } else {
        reject(new Error('Operation timed out'));
      }
    }, waitForTimeout);

    unwatch = store.watch(
      (state) => state.global.system,
      (value) => {
        if (!value.Status?.State) {
          return;
        }
        if (initialState !== value.Status?.State) {
          hasStateChanged = true;
        }
        if (value && value.PowerState === 'PoweringOff') {
          return;
        }
        if (value && value.Status?.State === serverState) {
          if (hasStateChanged) {
            cleanup();
            resolve();
          }
        }
      },
    );

    timer = setInterval(() => {
      store.dispatch('global/getSystemInfo', null, { root: true });
    }, 5000);

    store.dispatch('global/getSystemInfo', null, { root: true });
  }).finally(cleanup);
};

const ControlStore = {
  namespaced: true,
  state: {
    isOperationInProgress: false,
    Managers: [],
    managersLoading: false,
    managersError: null,
    systemActions: {}, // Store all available actions with their options
    systemActionsLoading: false,
    systemActionsError: null
  },
  getters: {
    isOperationInProgress: (state) => state.isOperationInProgress,
    Managers: (state) => state.Managers,
    isManagersLoading: (state) => state.managersLoading,
    managersError: (state) => state.managersError,
    systemActions: (state) => state.systemActions,
    isSystemActionsLoading: (state) => state.systemActionsLoading,
    systemActionsError: (state) => state.systemActionsError
  },
  mutations: {
    setOperationInProgress: (state, inProgress) => {
      state.isOperationInProgress = inProgress;
    },
    setManagers: (state, Managers) => {
      state.Managers = [...Managers];
    },
    setManagersLoading: (state, isLoading) => {
      state.managersLoading = isLoading;
    },
    setManagersError: (state, error) => {
      state.managersError = error;
    },
    setSystemActions: (state, actions) => {
      state.systemActions = { ...actions };
    },
    addSystemAction: (state, { actionName, options }) => {
      state.systemActions = { 
        ...state.systemActions, 
        [actionName]: options 
      };
    },
    setSystemActionsLoading: (state, isLoading) => {
      state.systemActionsLoading = isLoading;
    },
    setSystemActionsError: (state, error) => {
      state.systemActionsError = error;
    }
  },
  actions: {
    async rebootBmc({ commit, dispatch }, payload) {
      // Extract target and parameters from payload
      const { target, parameters= { ResetType: 'GracefulRestart' } } = payload;

      return await api
        .post(target, parameters)
        // FIXME: Wait a moment for the BMC to reboot?
        .then(() => {
          setTimeout(() => {
            try {
              startManagerStatusCheck();
            } catch (error) {
              console.log(error);
            }
          }, 5000);
          return i18n.global.t('pageRebootBmc.toast.successRebootStart')
        })

        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.global.t('pageRebootBmc.toast.errorRebootStart'),
          );
        });
    },
    async executeSystemAction({ state, commit, dispatch, rootGetters }, { actionName, parameters, waitForState }) {
      commit('setOperationInProgress', true);
      
      try {
        // Check if the action exists in systemActions
        if (!state.systemActions || !state.systemActions[actionName]) {
          throw new Error(i18n.global.t('global.error.paramValueNotAllowed', { param: 'action', value: actionName }));
        }

        // Execute the action - trust the provided parameters without verification
        await redfishUtils.executeAction(
          state.systemActions,
          actionName,
          parameters
        );
        // Wait for server state to change if specified
        await checkForServerState.bind(this, waitForState)();

      } catch (error) {
        console.error(`Error executing action ${actionName}:`, error);
        throw error;
      } finally {
        commit('setOperationInProgress', false);
      }
    },
    async fetchSystemActions({ commit, dispatch, state }) {
      // Set loading state
      commit('setSystemActionsLoading', true);
      
      try {
        // Use global/getSystemInfo to get the system data instead of making a direct API call
        const systemResource = await dispatch('global/getSystemInfo', null, { root: true });
        
        if (!systemResource) {
          throw new Error('Failed to retrieve system information');
        }
        
        // Define custom defaults for system actions
        const customDefaults = {
          'ComputerSystem.Reset': {
            ResetType: {
              required: true,
              allowableValues: [
                'On', 
                'ForceOff', 
                'GracefulShutdown', 
                'GracefulRestart', 
                'ForceRestart', 
                'PowerCycle'
              ]
            }
          }
        };
        
        // Use redfishUtils with the system resource and custom defaults in a single call
        const actions = await redfishUtils.discoverActions(systemResource, customDefaults);
        
        // Set all system actions
        commit('setSystemActions', actions);
        
        // Clear any previous error
        commit('setSystemActionsError', null);
        
        return actions;
      } catch (error) {
        console.error('Failed to fetch system actions:', error);
        
        // Set error state
        commit('setSystemActionsError', {
          message: i18n.global.t('pageServerPowerOperations.error.failedToLoadActions'),
          details: error.message,
          timestamp: new Date()
        });
        
        throw error;
      } finally {
        commit('setSystemActionsLoading', false);
      }
    },
    async fetchManagersInfo({ commit, dispatch, state }) {
      // Set a loading state
      commit('setManagersLoading', true);
      
      try {
        // Get manager resources
        const managers = await dispatch('bmc/getBmcInfo', null, { root: true });
        
        const managersInfo = await Promise.all(managers.map(async (manager) => {
          // Define custom defaults for manager actions
          const managerDefaults = {
            'Manager.Reset': {
              ResetType: {
                required: true,
                allowableValues: ['GracefulRestart', 'ForceRestart']
              }
            }
          };
          
          // Use redfishUtils with already loaded manager resource and defaults in a single call
          const managerActions = await redfishUtils.discoverActions(manager, managerDefaults);
          const resetAction = managerActions['Manager.Reset'];
          
          // Extract allowable values for ResetType
          let allowableValues = [];
          if (resetAction && resetAction.parameters && resetAction.parameters.ResetType) {
            allowableValues = resetAction.parameters.ResetType.allowableValues;
          }
          
          // Special case for NVIDIA
          if (process.env.VUE_APP_ENV_NAME === 'nvidia-gb') {
            allowableValues = ['GracefulRestart'];
          }
          
          // Special case for NVIDIA: Determine label based on manager ID
          const displayName = manager.Id === 'BMC_0' ? 'BMC' : 
                            manager.Id === 'HGX_BMC_0' ? 'HMC' : 
                            manager.Id;
          
          // Construct the target path for the action, with validation
          let targetPath;
          if (resetAction && resetAction.target) {
            targetPath = resetAction.target;
          } else if (getOdataId(manager)) {
            targetPath = `${getOdataId(manager)}/Actions/Manager.Reset`;
          } else {
            console.warn(`Manager ${manager.Id || 'unknown'} missing @odata.id property`);
            targetPath = `/redfish/v1/Managers/${manager.Id || 'default'}/Actions/Manager.Reset`;
          }
          
          return {
            ...manager,
            id: manager.Id,
            displayName,
            resetOptions: {
              label: displayName,
              allowableValues,
              target: targetPath
            }
          };
        }));

        commit('setManagers', managersInfo);
        commit('setManagersError', null);
        return managersInfo;
      } catch (error) {
        console.error('Failed to fetch manager information:', error);
        
        // Set an error state that the UI can display
        commit('setManagersError', {
          message: i18n.global.t('pageRebootBmc.error.failedToLoadManagers'),
          details: error.message,
          timestamp: new Date()
        });
        
        // Use any cached data if available
        if (state.Managers.length === 0) {
          // Fallback to a minimal default state if no data exists
          const bmcPath = await dispatch('global/getBmcPath', null, { root: true });
          
          // Validate bmcPath before using it
          const fallbackTarget = bmcPath ? 
            `${bmcPath}/Actions/Manager.Reset` : 
            '/redfish/v1/Managers/default/Actions/Manager.Reset';
          
          commit('setManagers', [{
            id: 'default',
            displayName: 'BMC',
            lastRebootTime: null,
            resetOptions: {
              label: 'BMC',
              allowableValues: ['GracefulRestart'],
              target: fallbackTarget
            }
          }]);
        }
        
        // Schedule a retry
        setTimeout(() => {
          dispatch('fetchManagersInfo');
        }, 30000); // Retry after 30 seconds
        
        return state.Managers;
      } finally {
        commit('setManagersLoading', false);
      }
    },
  },
};

export default ControlStore;
