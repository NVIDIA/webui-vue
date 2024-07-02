import api from '@/store/api';
import i18n from '@/i18n';

const KeyClearStore = {
  namespaced: true,
  actions: {
    async clearEncryptionKeys(_, selectedKey) {
      const selectedKeyForClearing = {
        Attributes: { hb_key_clear_request: selectedKey },
      };
      return await api
        .patch(
<<<<<<< HEAD
          `${await this.dispatch('global/getSystemPath')}/Bios/Settings`,
          selectedKeyForClearing
||||||| 6236b11
          '/redfish/v1/Systems/system/Bios/Settings',
          selectedKeyForClearing
=======
          `${await this.dispatch('global/getSystemPath')}/Bios/Settings`,
          selectedKeyForClearing,
>>>>>>> origin/master
        )
        .then(() => i18n.t('pageKeyClear.toast.selectedKeyClearedSuccess'))
        .catch((error) => {
          console.log('Key clear', error);
          throw new Error(i18n.t('pageKeyClear.toast.selectedKeyClearedError'));
        });
    },
  },
};

export default KeyClearStore;
