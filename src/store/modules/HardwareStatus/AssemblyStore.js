import api from '@/store/api';
import i18n from '@/i18n';

const IPMI_FRU_CHASSIS_TYPE = {
  0: 'Unspecified',
  1: 'Other',
  2: 'Unknown',
  3: 'Desktop',
  4: 'Low Profile Desktop',
  5: 'Pizza Box',
  6: 'Mini Tower',
  7: 'Tower',
  8: 'Portable',
  9: 'LapTop',
  10: 'Notebook',
  11: 'Hand Held',
  12: 'Docking Station',
  13: 'All in One',
  14: 'Sub Notebook',
  15: 'Space-saving',
  16: 'Lunch Box',
  17: 'Main Server Chassis',
  18: 'Expansion Chassis',
  19: 'SubChassis',
  20: 'Bus Expansion Chassis',
  21: 'Peripheral Chassis',
  22: 'RAID Chassis',
  23: 'Rack Mount Chassis',
  24: 'Sealed-case PC',
  25: 'Multi-system Chassis',
  26: 'CompactPCI',
  27: 'AdvancedTCA',
  28: 'Blade',
  29: 'Blade Enclosure',
};

const AssemblyStore = {
  namespaced: true,
  state: {
    assemblies: null,
  },
  getters: {
    assemblies: (state) => state.assemblies,
  },
  mutations: {
    setAssemblyInfo: (state, data) => {
      state.assemblies = data.map((assembly) => {
        const {
          MemberId,
          PartNumber,
          SerialNumber,
          SparePartNumber,
          Model,
          Name,
          Location,
          LocationIndicatorActive,
          Oem,
        } = assembly;
        const keys = Oem ? Object.keys(Oem) : null;
        const properties = keys ? Oem[keys?.[0]] : null;
        return {
          id: MemberId,
          partNumber: PartNumber,
          serialNumber: SerialNumber,
          sparePartNumber: SparePartNumber,
          model: Model,
          name: Name,
          locationNumber: Location?.PartLocation?.ServiceLabel,
          identifyLed: LocationIndicatorActive,
          uri: assembly['@odata.id'],
          oem: Oem ? true : false,
          chassisType: properties?.ChassisType
            ? IPMI_FRU_CHASSIS_TYPE[properties?.ChassisType]
            : '',
          chassisPartNumber: properties?.ChassisPartNumber,
          chassisSerialNumber: properties?.ChassisSerialNumber,
          chassisExtra: properties?.ChassisExtra?.join(';'),
          boardManufatureDate: new Date(properties?.BoardManufatureDate),
          boardManufacturer: properties?.BoardManufacturer,
          boardProductName: properties?.BoardProductName,
          boardSerialNumber: properties?.BoardSerialNumber,
          boardPartNumber: properties?.BoardPartNumber,
          boardFruFileId: properties?.BoardFruFileId,
          boardExtra: properties?.BoardExtra?.join(';'),
          productProductName: properties?.ProductProductName,
          productManufacturer: properties?.ProductManufacturer,
          productPartNumber: properties?.ProductPartNumber,
          productVersion: properties?.ProductVersion,
          productSerialNumber: properties?.ProductSerialNumber,
          productAssetTag: properties?.ProductAssetTag,
          productFruFileId: properties?.ProductFruFileId,
          productExtra: properties?.ProductExtra?.join(';'),
        };
      });
    },
  },
  actions: {
    async getChassisCollection() {
      return await api
        .get('/redfish/v1/Chassis')
        .then(({ data: { Members } }) =>
          Members.map((member) => member['@odata.id']),
        )
        .catch((error) => console.log(error));
    },
    async getChassisAssembly(_, id) {
      return await api
        .get(`${id}/Assembly`)
        .then((response) => {
          return response?.data?.Assemblies;
        })
        .catch((error) => console.log(error));
    },
    async getAssemblyInfo({ commit, dispatch }) {
      const collection = await dispatch('getChassisCollection');
      if (!collection) return;
      return await api
        .all(
          collection.map((chassis) => dispatch('getChassisAssembly', chassis)),
        )
        .then((assemliesList) => {
          let assemblies = [];
          assemliesList.forEach((assemblyList) => {
            assemblies = [...assemblies, ...assemblyList];
          });
          commit('setAssemblyInfo', assemblies);
        })
        .catch((error) => console.log(error));
    },
    async updateIdentifyLedValue({ dispatch }, led) {
      const uri = led.uri;
      const updatedIdentifyLedValue = {
        Assemblies: [
          {
            MemberId: led.memberId,
            LocationIndicatorActive: led.identifyLed,
          },
        ],
      };

      return await api
        .patch(uri, updatedIdentifyLedValue)
        .then(() => {
          if (led.identifyLed) {
            return i18n.t('pageInventory.toast.successEnableIdentifyLed');
          } else {
            return i18n.t('pageInventory.toast.successDisableIdentifyLed');
          }
        })
        .catch((error) => {
          dispatch('getAssemblyInfo');
          console.log('error', error);
          if (led.identifyLed) {
            throw new Error(
              i18n.t('pageInventory.toast.errorEnableIdentifyLed'),
            );
          } else {
            throw new Error(
              i18n.t('pageInventory.toast.errorDisableIdentifyLed'),
            );
          }
        });
    },
  },
};

export default AssemblyStore;
