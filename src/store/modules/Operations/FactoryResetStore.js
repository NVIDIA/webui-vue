import api from '@/store/api';
import i18n from '@/i18n';

const FactoryResetStore = {
  namespaced: true,
  actions: {
    async resetToDefaults() {
      return await api
<<<<<<< HEAD
        .post(
          `${await this.dispatch(
            'global/getBmcPath'
          )}/Actions/Manager.ResetToDefaults`,
          {
            ResetToDefaultsType: 'ResetAll',
          }
        )
        .then(() => {
          i18n.t('pageFactoryReset.toast.resetToDefaultsSuccess');
          if (process.env.VUE_APP_ENV_NAME === 'nvidia-bluefield') {
            this.dispatch('controls/rebootBmc');
          }
        })
||||||| 6236b11
        .post('/redfish/v1/Managers/bmc/Actions/Manager.ResetToDefaults', {
          ResetToDefaultsType: 'ResetAll',
        })
        .then(() => i18n.t('pageFactoryReset.toast.resetToDefaultsSuccess'))
=======
        .post(
          `${await this.dispatch('global/getBmcPath')}/Actions/Manager.ResetToDefaults`,
          {
            ResetType: 'ResetAll',
          },
        )
        .then(() => i18n.t('pageFactoryReset.toast.resetToDefaultsSuccess'))
>>>>>>> origin/master
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
            }
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
<<<<<<< HEAD
        .post(
          `${await this.dispatch(
            'global/getSystemPath'
          )}/Bios/Actions/Bios.ResetBios`
        )
||||||| 6236b11
        .post('/redfish/v1/Systems/system/Bios/Actions/Bios.ResetBios')
=======
        .post(
          `${await this.dispatch('global/getSystemPath')}/Bios/Actions/Bios.ResetBios`,
        )
>>>>>>> origin/master
        .then(() => i18n.t('pageFactoryReset.toast.resetBiosSuccess'))
        .catch((error) => {
          console.log('Factory Reset: ', error);
          throw new Error(i18n.t('pageFactoryReset.toast.resetBiosError'));
        });
    },
  },
};

export default FactoryResetStore;
