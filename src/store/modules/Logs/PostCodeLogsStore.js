import api from '@/store/api';
import i18n from '@/i18n';

const PostCodeLogsStore = {
  namespaced: true,
  state: {
    allPostCodes: [],
  },
  getters: {
    allPostCodes: (state) => state.allPostCodes,
  },
  mutations: {
    setAllPostCodes: (state, allPostCodes) =>
      (state.allPostCodes = allPostCodes),
  },
  actions: {
    async getPostCodesLogData({ commit }) {
      return await api
<<<<<<< HEAD
        .get(
          `${await this.dispatch(
            'global/getSystemPath'
          )}/LogServices/PostCodes/Entries`
        )
||||||| 6236b11
        .get('/redfish/v1/Systems/system/LogServices/PostCodes/Entries')
=======
        .get(
          `${await this.dispatch('global/getSystemPath')}/LogServices/PostCodes/Entries`,
        )
>>>>>>> origin/master
        .then(({ data: { Members = [] } = {} }) => {
          const postCodeLogs = Members.map((log) => {
            const { Created, MessageArgs, AdditionalDataURI } = log;
            return {
              date: new Date(Created),
              bootCount: MessageArgs[0],
              timeStampOffset: MessageArgs[1],
              postCode: MessageArgs[2],
              uri: AdditionalDataURI,
            };
          });
          commit('setAllPostCodes', postCodeLogs);
        })
        .catch((error) => {
          console.log('POST Codes Log Data:', error);
        });
    },
    async deleteAllPostCodeLogs({ dispatch }, data) {
      return await api
        .post(
<<<<<<< HEAD
          `${await this.dispatch(
            'global/getSystemPath'
          )}/LogServices/PostCodes/Actions/LogService.ClearLog`
||||||| 6236b11
          '/redfish/v1/Systems/system/LogServices/PostCodes/Actions/LogService.ClearLog'
=======
          `${await this.dispatch('global/getSystemPath')}/LogServices/PostCodes/Actions/LogService.ClearLog`,
>>>>>>> origin/master
        )
        .then(() => dispatch('getPostCodesLogData'))
        .then(() =>
          i18n.tc('pagePostCodeLogs.toast.successDelete', data.length),
        )
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.tc('pagePostCodeLogs.toast.errorDelete', data.length),
          );
        });
    },
  },
};

export default PostCodeLogsStore;
