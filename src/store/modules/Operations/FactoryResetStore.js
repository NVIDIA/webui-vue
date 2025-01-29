import api from '@/store/api';
import i18n from '@/i18n';

const FactoryResetStore = {
  namespaced: true,
  state: {
    resetBiosUris: [],
  },
  getters: {
    resetBiosUris: (state) => state.resetBiosUris,
  },
  mutations: {
    setResetBiosUris: (state, value) => {
      state.resetBiosUris = value;
    },
  },
  actions: {
    async preloadResetBiosTargets({ commit }) {
      const results = await this.dispatch('system/getSystemsResources', {
        name: 'Bios',
      });
      const resetBiosUris = results.flatMap(
        (bios) => {
          const uri = bios.Actions?.["#Bios.ResetBios"]?.['target'];
          if (uri) return { Id: bios.Id, target: uri }
        }
      );
      commit('setResetBiosUris', resetBiosUris);
    },
    async resetToDefaults(_context, target) {
      return await api
        .post(
          target,
          {
            ResetType: 'ResetAll',
          },
        )
        .then(() =>
          i18n.global.t('pageFactoryReset.toast.resetToDefaultsSuccess'),
        )
        .catch((error) => {
          console.log('Factory Reset: ', error);
          throw new Error(
            i18n.global.t('pageFactoryReset.toast.resetToDefaultsError'),
          );
        });
    },
    async resetBios(_context, target) {
      return await api
        .post(target)
        .then(() => i18n.global.t('pageFactoryReset.toast.resetBiosSuccess'))
        .catch((error) => {
          console.log('Factory Reset: ', error);
          throw new Error(
            i18n.global.t('pageFactoryReset.toast.resetBiosError'),
          );
        });
    },
  },
};

export default FactoryResetStore;
