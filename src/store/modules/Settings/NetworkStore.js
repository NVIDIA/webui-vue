import api from '@/store/api';
import i18n from '@/i18n';

const NetworkStore = {
  namespaced: true,
  state: {
    ethernetData: [],
    firstInterfaceId: '', //used for setting global DHCP settings
    globalNetworkSettings: [],
    selectedInterfaceId: '', // which tab is selected
    selectedInterfaceIndex: 0, // which tab is selected
  },
  getters: {
    ethernetData: (state) => state.ethernetData,
    firstInterfaceId: (state) => state.firstInterfaceId,
    globalNetworkSettings: (state) => state.globalNetworkSettings,
    selectedInterfaceId: (state) => state.selectedInterfaceId,
    selectedInterfaceIndex: (state) => state.selectedInterfaceIndex,
  },
  mutations: {
    setDomainNameState: (state, domainState) =>
      (state.domainState = domainState),
    setDnsState: (state, dnsState) => (state.dnsState = dnsState),
    setEthernetData: (state, ethernetData) =>
      (state.ethernetData = ethernetData),
    setFirstInterfaceId: (state, firstInterfaceId) =>
      (state.firstInterfaceId = firstInterfaceId),
    setGlobalNetworkSettings: (state, data) => {
      state.globalNetworkSettings = data.map(({ data }) => {
        const {
          DHCPv4,
          HostName,
          IPv4Addresses,
          IPv4StaticAddresses,
          IPv6Addresses,
          IPv6StaticAddresses,
          LinkStatus,
          MACAddress,
        } = data;
        return {
          defaultGateway: IPv4StaticAddresses[0]?.Gateway, //First static gateway is the default gateway
          dhcpAddress: IPv4Addresses.filter(
            (ipv4) => ipv4.AddressOrigin === 'DHCP',
          ),
          dhcpAddressV6: IPv6Addresses.filter(
            (ipv6) =>
              ipv6.AddressOrigin === 'SLAAC' || ipv6.AddressOrigin === 'DHCPv6'
          ),
          dhcpEnabled: DHCPv4.DHCPEnabled,
          hostname: HostName,
          macAddress: MACAddress,
          linkStatus: LinkStatus,
          staticAddress: IPv4StaticAddresses[0]?.Address, // Display first static address on overview page
          staticAddressV6: IPv6StaticAddresses[0]?.Address, // Display first static address on overview page
          useDnsEnabled: DHCPv4.UseDNSServers,
          useDomainNameEnabled: DHCPv4.UseDomainName,
          useNtpEnabled: DHCPv4.UseNTPServers,
        };
      });
    },
    setNtpState: (state, ntpState) => (state.ntpState = ntpState),
    setSelectedInterfaceId: (state, selectedInterfaceId) =>
      (state.selectedInterfaceId = selectedInterfaceId),
    setSelectedInterfaceIndex: (state, selectedInterfaceIndex) =>
      (state.selectedInterfaceIndex = selectedInterfaceIndex),
  },
  actions: {
    async getEthernetData({ commit }) {
      return await api
        .get(`${await this.dispatch('global/getBmcPath')}/EthernetInterfaces`)
        .then((response) =>
          response.data.Members.map(
            (ethernetInterface) => ethernetInterface['@odata.id'],
          ),
        )
        .then((ethernetInterfaceIds) =>
          api.all(
            ethernetInterfaceIds.map((ethernetInterface) =>
              api.get(ethernetInterface),
            ),
          ),
        )
        .then((ethernetInterfaces) => {
          const ethernetData = ethernetInterfaces.map(
            (ethernetInterface) => ethernetInterface.data,
          );
          const firstInterfaceId = ethernetData[0].Id;

          commit('setEthernetData', ethernetData);
          commit('setFirstInterfaceId', firstInterfaceId);
          commit('setSelectedInterfaceId', firstInterfaceId);
          commit('setGlobalNetworkSettings', ethernetInterfaces);
        })
        .catch((error) => {
          console.log('Network Data:', error);
        });
    },
    async saveDhcpEnabledState({ state, dispatch }, dhcpState) {
      const data = {
        DHCPv4: {
          DHCPEnabled: dhcpState,
        },
      };
      return api
        .patch(
<<<<<<< HEAD
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${
            state.selectedInterfaceId
          }`,
          data
||||||| 6236b11
          `/redfish/v1/Managers/bmc/EthernetInterfaces/${state.selectedInterfaceId}`,
          data
=======
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${state.selectedInterfaceId}`,
          data,
>>>>>>> origin/master
        )
        .then(dispatch('getEthernetData'))
        .then(() => {
          return i18n.t('pageNetwork.toast.successSaveNetworkSettings', {
            setting: i18n.t('pageNetwork.dhcp'),
          });
        })
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.t('pageNetwork.toast.errorSaveNetworkSettings', {
              setting: i18n.t('pageNetwork.dhcp'),
            }),
          );
        });
    },
    async saveDomainNameState({ commit, state }, domainState) {
      commit('setDomainNameState', domainState);
      const data = {
        DHCPv4: {
          UseDomainName: domainState,
        },
      };
      // Saving to the first interface automatically updates DHCPv4 and DHCPv6
      // on all interfaces
      return api
        .patch(
<<<<<<< HEAD
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${
            state.firstInterfaceId
          }`,
          data
||||||| 6236b11
          `/redfish/v1/Managers/bmc/EthernetInterfaces/${state.firstInterfaceId}`,
          data
=======
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${state.firstInterfaceId}`,
          data,
>>>>>>> origin/master
        )
        .then(() => {
          return i18n.t('pageNetwork.toast.successSaveNetworkSettings', {
            setting: i18n.t('pageNetwork.domainName'),
          });
        })
        .catch((error) => {
          console.log(error);
          commit('setDomainNameState', !domainState);
          throw new Error(
            i18n.t('pageNetwork.toast.errorSaveNetworkSettings', {
              setting: i18n.t('pageNetwork.domainName'),
            }),
          );
        });
    },
    async saveDnsState({ commit, state }, dnsState) {
      commit('setDnsState', dnsState);
      const data = {
        DHCPv4: {
          UseDNSServers: dnsState,
        },
      };
      // Saving to the first interface automatically updates DHCPv4 and DHCPv6
      // on all interfaces
      return api
        .patch(
<<<<<<< HEAD
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${
            state.firstInterfaceId
          }`,
          data
||||||| 6236b11
          `/redfish/v1/Managers/bmc/EthernetInterfaces/${state.firstInterfaceId}`,
          data
=======
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${state.firstInterfaceId}`,
          data,
>>>>>>> origin/master
        )
        .then(() => {
          return i18n.t('pageNetwork.toast.successSaveNetworkSettings', {
            setting: i18n.t('pageNetwork.dns'),
          });
        })
        .catch((error) => {
          console.log(error);
          commit('setDnsState', !dnsState);
          throw new Error(
            i18n.t('pageNetwork.toast.errorSaveNetworkSettings', {
              setting: i18n.t('pageNetwork.dns'),
            }),
          );
        });
    },
    async saveNtpState({ commit, state }, ntpState) {
      commit('setNtpState', ntpState);
      const data = {
        DHCPv4: {
          UseNTPServers: ntpState,
        },
      };
      // Saving to the first interface automatically updates DHCPv4 and DHCPv6
      // on all interfaces
      return api
        .patch(
<<<<<<< HEAD
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${
            state.firstInterfaceId
          }`,
          data
||||||| 6236b11
          `/redfish/v1/Managers/bmc/EthernetInterfaces/${state.firstInterfaceId}`,
          data
=======
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${state.firstInterfaceId}`,
          data,
>>>>>>> origin/master
        )
        .then(() => {
          return i18n.t('pageNetwork.toast.successSaveNetworkSettings', {
            setting: i18n.t('pageNetwork.ntp'),
          });
        })
        .catch((error) => {
          console.log(error);
          commit('setNtpState', !ntpState);
          throw new Error(
            i18n.t('pageNetwork.toast.errorSaveNetworkSettings', {
              setting: i18n.t('pageNetwork.ntp'),
            }),
          );
        });
    },
    async setSelectedTabIndex({ commit }, tabIndex) {
      commit('setSelectedInterfaceIndex', tabIndex);
    },
    async setSelectedTabId({ commit }, tabId) {
      commit('setSelectedInterfaceId', tabId);
    },
    async saveIpv4Address({ dispatch, state }, ipv4Form) {
      const originalAddresses = state.ethernetData[
        state.selectedInterfaceIndex
      ].IPv4StaticAddresses.map((ipv4) => {
        const { Address, SubnetMask, Gateway } = ipv4;
        return {
          Address,
          SubnetMask,
          Gateway,
        };
      });
      const newAddress = [ipv4Form];
      return api
        .patch(
<<<<<<< HEAD
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${
            state.selectedInterfaceId
          }`,
          { IPv4StaticAddresses: originalAddresses.concat(newAddress) }
||||||| 6236b11
          `/redfish/v1/Managers/bmc/EthernetInterfaces/${state.selectedInterfaceId}`,
          { IPv4StaticAddresses: originalAddresses.concat(newAddress) }
=======
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${state.selectedInterfaceId}`,
          { IPv4StaticAddresses: originalAddresses.concat(newAddress) },
>>>>>>> origin/master
        )
        .then(dispatch('getEthernetData'))
        .then(() => {
          return i18n.t('pageNetwork.toast.successSaveNetworkSettings', {
            setting: i18n.t('pageNetwork.ipv4'),
          });
        })
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.t('pageNetwork.toast.errorSaveNetworkSettings', {
              setting: i18n.t('pageNetwork.ipv4'),
            }),
          );
        });
    },
    async editIpv4Address({ dispatch, state }, ipv4TableData) {
      return api
        .patch(
<<<<<<< HEAD
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${
            state.selectedInterfaceId
          }`,
          { IPv4StaticAddresses: ipv4TableData }
||||||| 6236b11
          `/redfish/v1/Managers/bmc/EthernetInterfaces/${state.selectedInterfaceId}`,
          { IPv4StaticAddresses: ipv4TableData }
=======
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${state.selectedInterfaceId}`,
          { IPv4StaticAddresses: ipv4TableData },
>>>>>>> origin/master
        )
        .then(dispatch('getEthernetData'))
        .then(() => {
          return i18n.t('pageNetwork.toast.successSaveNetworkSettings', {
            setting: i18n.t('pageNetwork.ipv4'),
          });
        })
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.t('pageNetwork.toast.errorSaveNetworkSettings', {
              setting: i18n.t('pageNetwork.ipv4'),
            }),
          );
        });
    },
    async saveSettings({ state, dispatch }, interfaceSettingsForm) {
      return api
        .patch(
<<<<<<< HEAD
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${
            state.selectedInterfaceId
          }`,
          interfaceSettingsForm
||||||| 6236b11
          `/redfish/v1/Managers/bmc/EthernetInterfaces/${state.selectedInterfaceId}`,
          interfaceSettingsForm
=======
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${state.selectedInterfaceId}`,
          interfaceSettingsForm,
>>>>>>> origin/master
        )
        .then(dispatch('getEthernetData'))
        .then(() => {
          return i18n.t('pageNetwork.toast.successSaveNetworkSettings', {
            setting: i18n.t('pageNetwork.network'),
          });
        })
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.t('pageNetwork.toast.errorSaveNetworkSettings', {
              setting: i18n.t('pageNetwork.network'),
            }),
          );
        });
    },
    async saveDnsAddress({ dispatch, state }, dnsForm) {
      const newAddress = dnsForm;
      const originalAddresses =
        state.ethernetData[state.selectedInterfaceIndex].StaticNameServers;
      const newDnsArray = originalAddresses.concat(newAddress);
      return api
        .patch(
<<<<<<< HEAD
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${
            state.selectedInterfaceId
          }`,
          { StaticNameServers: newDnsArray }
||||||| 6236b11
          `/redfish/v1/Managers/bmc/EthernetInterfaces/${state.selectedInterfaceId}`,
          { StaticNameServers: newDnsArray }
=======
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${state.selectedInterfaceId}`,
          { StaticNameServers: newDnsArray },
>>>>>>> origin/master
        )
        .then(dispatch('getEthernetData'))
        .then(() => {
          return i18n.t('pageNetwork.toast.successSaveNetworkSettings', {
            setting: i18n.t('pageNetwork.dns'),
          });
        })
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.t('pageNetwork.toast.errorSaveNetworkSettings', {
              setting: i18n.t('pageNetwork.dns'),
            }),
          );
        });
    },
    async editDnsAddress({ dispatch, state }, dnsTableData) {
      return api
        .patch(
<<<<<<< HEAD
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${
            state.selectedInterfaceId
          }`,
          { StaticNameServers: dnsTableData }
||||||| 6236b11
          `/redfish/v1/Managers/bmc/EthernetInterfaces/${state.selectedInterfaceId}`,
          { StaticNameServers: dnsTableData }
=======
          `${await this.dispatch('global/getBmcPath')}/EthernetInterfaces/${state.selectedInterfaceId}`,
          { StaticNameServers: dnsTableData },
>>>>>>> origin/master
        )
        .then(dispatch('getEthernetData'))
        .then(() => {
          return i18n.t('pageNetwork.toast.successSaveNetworkSettings', {
            setting: i18n.t('pageNetwork.dns'),
          });
        })
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.t('pageNetwork.toast.errorSaveNetworkSettings', {
              setting: i18n.t('pageNetwork.dns'),
            }),
          );
        });
    },
  },
};

export default NetworkStore;
