import api from '@/store/api';
import i18n from '@/i18n';

const FactoryResetStore = {
  namespaced: true,
  actions: {
    async resetToDefaults() {
      return await api
        .post(
          `${await this.dispatch('global/getBmcPath')}/Actions/Manager.ResetToDefaults`,
          {
            ResetType: 'ResetAll',
          },
        )
        .then(() => i18n.t('pageFactoryReset.toast.resetToDefaultsSuccess'))
        .catch((error) => {
          console.log('Factory Reset: ', error);
          throw new Error(
            i18n.t('pageFactoryReset.toast.resetToDefaultsError'),
          );
        });
    },
    async resetBios() {
      if (process.env.VUE_APP_ENV_NAME === 'nvidia-bluefield') {
        return await api
          .patch(
            `${await this.dispatch('global/getSystemPath')}/Bios/Settings`,
            {
              Attributes: {
                ResetEfiVars: true,
              },
            },
          )
          .then(() => {
            i18n.t('pageFactoryReset.toast.resetBiosSuccessAndReboot');
            this.dispatch('controls/serverSoftReboot');
          })
          .catch((error) => {
            console.log('Factory Reset: ', error);
            throw new Error(i18n.t('pageFactoryReset.toast.resetBiosError'));
          });
      }
      return await api
        .post(
          `${await this.dispatch('global/getSystemPath')}/Bios/Actions/Bios.ResetBios`,
        )
        .then(() => i18n.t('pageFactoryReset.toast.resetBiosSuccess'))
        .catch((error) => {
          console.log('Factory Reset: ', error);
          throw new Error(i18n.t('pageFactoryReset.toast.resetBiosError'));
        });
    },
  },
};

export default FactoryResetStore;
