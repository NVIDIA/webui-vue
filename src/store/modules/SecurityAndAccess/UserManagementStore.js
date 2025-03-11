import api, { getResponseCount } from '@/store/api';
import i18n from '@/i18n';

/** FIXME: This is a temporary fix to get the resolution from the error message. 
 *  It is not translated and the current error message does not provide an easy way to translate.
*/
const getServerErrorMessages = function (error) {
  let errorData = error.response.data.error
    ? error.response.data.error
    : error.response.data;
  if (typeof errorData == 'string') {
    return [];
  }
  return Object.values(errorData)
    .reduce((a, b) => a.concat(b))
    .filter((info) => info.MessageArgs && info.MessageArgs?.[0] !== 'null')
    .map((info) => info?.Resolution?.length ? info.Resolution : info.Message);
};

const UserManagementStore = {
  namespaced: true,
  state: {
    allUsers: [],
    accountRoles: [],
    accountLockoutDuration: null,
    accountLockoutThreshold: null,
    accountMinPasswordLength: null,
    accountMaxPasswordLength: null,
  },
  getters: {
    allUsers(state) {
      return state.allUsers;
    },
    accountRoles(state) {
      return state.accountRoles;
    },
    accountSettings(state) {
      return {
        lockoutDuration: state.accountLockoutDuration,
        lockoutThreshold: state.accountLockoutThreshold,
      };
    },
    accountPasswordRequirements(state) {
      return {
        minLength: state.accountMinPasswordLength,
        maxLength: state.accountMaxPasswordLength,
      };
    },
  },
  mutations: {
    setUsers(state, allUsers) {
      state.allUsers = allUsers;
    },
    setAccountRoles(state, accountRoles) {
      state.accountRoles = accountRoles;
    },
    setLockoutDuration(state, lockoutDuration) {
      state.accountLockoutDuration = lockoutDuration;
    },
    setLockoutThreshold(state, lockoutThreshold) {
      state.accountLockoutThreshold = lockoutThreshold;
    },
    setAccountMinPasswordLength(state, minPasswordLength) {
      state.accountMinPasswordLength = minPasswordLength;
    },
    setAccountMaxPasswordLength(state, maxPasswordLength) {
      state.accountMaxPasswordLength = maxPasswordLength;
    },
  },
  actions: {
    async getUsers({ commit }) {
      return await api
        .get('/redfish/v1/AccountService/Accounts')
        .then((response) =>
          response.data.Members.map((user) => user['@odata.id']),
        )
        .then((userIds) => api.all(userIds.map((user) => api.get(user))))
        .then((users) => {
          const userData = users.map((user) => user.data);
          commit('setUsers', userData);
        })
        .catch((error) => {
          console.log(error);
          const message = i18n.t('pageUserManagement.toast.errorLoadUsers');
          throw new Error(message);
        });
    },
    getAccountSettings({ commit }) {
      api
        .get('/redfish/v1/AccountService')
        .then(({ data }) => {
          commit('setLockoutDuration', data.AccountLockoutDuration);
          commit('setLockoutThreshold', data.AccountLockoutThreshold);
          commit('setAccountMinPasswordLength', data.MinPasswordLength);
          commit('setAccountMaxPasswordLength', data.MaxPasswordLength);
        })
        .catch((error) => {
          console.log(error);
          const message = i18n.t(
            'pageUserManagement.toast.errorLoadAccountSettings',
          );
          throw new Error(message);
        });
    },
    getAccountRoles({ commit }) {
      api
        .get('/redfish/v1/AccountService/Roles')
        .then(({ data: { Members = [] } = {} }) => {
          const roles = Members.map((role) => {
            return role['@odata.id'].split('/').pop();
          });
          commit('setAccountRoles', roles);
        })
        .catch((error) => console.log(error));
    },
    async createUser({ dispatch }, { username, password, privilege, status }) {
      const data = {
        UserName: username,
        Password: password,
        RoleId: privilege,
        Enabled: status,
      };
      return await api
        .post('/redfish/v1/AccountService/Accounts', data)
        .then(() => dispatch('getUsers'))
        .then(() =>
          i18n.t('pageUserManagement.toast.successCreateUser', {
            username,
          }),
        )
        .catch((error) => {
          let serverMessages = getServerErrorMessages(error);
          let message =
            serverMessages.length > 0
              ? serverMessages.join(' ')
              : i18n.t('pageUserManagement.toast.errorCreateUser', {
                  username: username,
                });
                // FIXME:  Don't toast here
                // See redfish error handling in FirmwareUpdate
                // Keep the Add user modal open, match error to form element
          throw new Error(message);
        });
    },
    async updateUser(
      { dispatch },
      { originalUsername, username, password, privilege, status, locked },
    ) {
      const data = {};
      if (username) data.UserName = username;
      if (password) data.Password = password;
      if (privilege) data.RoleId = privilege;
      if (status !== undefined) data.Enabled = status;
      if (locked !== undefined) data.Locked = locked;
      return await api
        .patch(`/redfish/v1/AccountService/Accounts/${originalUsername}`, data)
        .then(() => dispatch('getUsers'))
        .then(() =>
          i18n.t('pageUserManagement.toast.successUpdateUser', {
            username: originalUsername,
          }),
        )
        .catch((error) => {
          console.log(error);
          const serverMessages = getServerErrorMessages(error);
          const message =
            serverMessages.length > 0
              ? serverMessages.join(' ')
              : i18n.t('pageUserManagement.toast.errorUpdateUser', {
                  username: originalUsername,
                });
          throw new Error(message);
        });
    },
    async deleteUser({ dispatch }, username) {
      return await api
        .delete(`/redfish/v1/AccountService/Accounts/${username}`)
        .then(() => dispatch('getUsers'))
        .then(() =>
          i18n.t('pageUserManagement.toast.successDeleteUser', {
            username,
          }),
        )
        .catch((error) => {
          console.log(error);
          const message = i18n.t('pageUserManagement.toast.errorDeleteUser', {
            username,
          });
          throw new Error(message);
        });
    },
    // Define createApiPromises as a Vuex action
    createApiPromises({ commit }, { users, apiMethod, data }) {
      return users.map(({ username }) => {
        return apiMethod(`/redfish/v1/AccountService/Accounts/${username}`, data)
          .then(response => ({ success: true, username, response }))
          .catch((error) => ({ success: false, username, error }));
      });
    },
    // Utility function to handle API responses and dispatch actions
    handleApiResponse({ dispatch }, { promises, successMessage, errorMessage }) {
      return api
        .all(promises)
        .then((response) => {
          dispatch('getUsers');
          return response;
        })
        .then(
          api.spread((...responses) => {
            const successResponses = responses.filter(r => r.success);
            const errorResponses = responses.filter(r => !r.success);
            const successCount = successResponses.length;
            const errorCount = errorResponses.length;
            
            let toastMessages = [];

            if (successCount) {
              const message = i18n.tc(successMessage, successCount);
              toastMessages.push({ type: 'success', message });
            }

            if (errorCount) {
              const message = i18n.tc(errorMessage, errorCount);
              const errorDetails = errorResponses.map(r => r.error?.response?.data || r.error);
              
              toastMessages.push({ 
                type: 'error', 
                message, 
                errorDetails 
              });
            }

            return toastMessages;
          }),
        );
    },
    // Refactor deleteUsers action
    async deleteUsers({ dispatch }, users) {
      const promises = await dispatch('createApiPromises', { users, apiMethod: api.delete });
      return dispatch('handleApiResponse', { promises, successMessage: 'pageUserManagement.toast.successBatchDelete', errorMessage: 'pageUserManagement.toast.errorBatchDelete' });
    },
    // Refactor enableUsers action
    async enableUsers({ dispatch }, users) {
      const data = { Enabled: true };
      const promises = await dispatch('createApiPromises', { users, apiMethod: api.patch, data });
      return dispatch('handleApiResponse', { promises, successMessage: 'pageUserManagement.toast.successBatchEnable', errorMessage: 'pageUserManagement.toast.errorBatchEnable' });
    },
    // Refactor disableUsers action
    async disableUsers({ dispatch }, users) {
      const data = { Enabled: false };
      const promises = await dispatch('createApiPromises', { users, apiMethod: api.patch, data });
      return dispatch('handleApiResponse', { promises, successMessage: 'pageUserManagement.toast.successBatchDisable', errorMessage: 'pageUserManagement.toast.errorBatchDisable' });
    },
    async saveAccountSettings(
      { dispatch },
      { lockoutThreshold, lockoutDuration },
    ) {
      const data = {};
      if (lockoutThreshold !== undefined) {
        data.AccountLockoutThreshold = lockoutThreshold;
      }
      if (lockoutDuration !== undefined) {
        data.AccountLockoutDuration = lockoutDuration;
      }

      return await api
        .patch('/redfish/v1/AccountService', data)
        //GET new settings to update view
        .then(() => dispatch('getAccountSettings'))
        .then(() => i18n.t('pageUserManagement.toast.successSaveSettings'))
        .catch((error) => {
          console.log(error);
          const message = i18n.t('pageUserManagement.toast.errorSaveSettings');
          throw new Error(message);
        });
    },
  },
};

export default UserManagementStore;
