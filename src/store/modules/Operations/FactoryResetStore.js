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
      const systems = await this.dispatch('system/getSystemsWithProp', {
        prop: 'Bios',
      });
      const promises = systems.map(async (system) => {
        const biosUri = system.Bios?.['@odata.id'];
        if (!biosUri) return null;
        try {
          const { data: bios } = await api.get(biosUri);
          const target = bios.Actions?.['#Bios.ResetBios']?.target;
          if (target) return { Id: system.Id, target };
        } catch {
          return null;
        }
        return null;
      });
      const results = await Promise.all(promises);
      commit('setResetBiosUris', results.filter(Boolean));
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
