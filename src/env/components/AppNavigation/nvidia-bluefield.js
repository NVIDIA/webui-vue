import IconDashboard from '@carbon/icons-vue/es/dashboard/16';
import IconTextLinkAnalysis from '@carbon/icons-vue/es/text-link--analysis/16';
import IconDataCheck from '@carbon/icons-vue/es/data--check/16';
import IconSettingsAdjust from '@carbon/icons-vue/es/settings--adjust/16';
import IconSettings from '@carbon/icons-vue/es/settings/16';
import IconSecurity from '@carbon/icons-vue/es/security/16';
import IconChevronUp from '@carbon/icons-vue/es/chevron--up/16';
import IconDataBase from '@carbon/icons-vue/es/data--base--alt/16';
const roles = {
  administrator: 'Administrator',
  operator: 'Operator',
  readonly: 'ReadOnly',
  noaccess: 'NoAccess',
};

const AppNavigationMixin = {
  components: {
    iconOverview: IconDashboard,
    iconLogs: IconTextLinkAnalysis,
    iconHealth: IconDataCheck,
    iconControl: IconSettingsAdjust,
    iconSettings: IconSettings,
    iconSecurityAndAccess: IconSecurity,
    iconExpand: IconChevronUp,
    iconResourceManagement: IconDataBase,
  },
  data() {
    return {
      navigationItems: [
        {
          id: 'overview',
          label: this.$t('appNavigation.overview'),
          route: '/',
          icon: 'iconOverview',
        },
        {
          id: 'logs',
          label: this.$t('appNavigation.logs'),
          icon: 'iconLogs',
          children: [
            {
              id: 'event-logs',
              label: this.$t('appNavigation.eventLogs'),
              route: '/logs/event-logs',
            },
            {
              id: 'sel-logs',
              label: this.$t('appNavigation.selLogs'),
              route: '/logs/sel-logs',
            },
            {
              id: 'dumps',
              label: this.$t('appNavigation.dumps'),
              route: '/logs/dumps',
            },
          ],
        },
        {
          id: 'hardware-status',
          label: this.$t('appNavigation.hardwareStatus'),
          icon: 'iconHealth',
          children: [
            {
              id: 'inventory',
              label: this.$t('appNavigation.inventory'),
              route: '/hardware-status/inventory',
            },
            {
              id: 'sensors',
              label: this.$t('appNavigation.sensors'),
              route: '/hardware-status/sensors',
            },
          ],
        },
        {
          id: 'operations',
          label: this.$t('appNavigation.operations'),
          icon: 'iconControl',
          children: [
            {
              id: 'factory-reset',
              label: this.$t('appNavigation.factoryReset'),
              route: '/operations/factory-reset',
            },
            {
              id: 'firmware',
              label: this.$t('appNavigation.firmware'),
              route: '/operations/firmware',
            },
            {
              id: 'reboot-bmc',
              label: this.$t('appNavigation.rebootBmc'),
              route: '/operations/reboot-bmc',
            },
            {
              id: 'serial-over-lan',
              label: this.$t('appNavigation.serialOverLan'),
              route: '/operations/serial-over-lan',
              exclusiveToRoles: [roles.administrator],
            },
            {
              id: 'server-power-operations',
              label: this.$t('appNavigation.serverPowerOperations'),
              route: '/operations/server-power-operations',
            },
          ],
        },
        {
          id: 'settings',
          label: this.$t('appNavigation.settings'),
          icon: 'iconSettings',
          children: [
            {
              id: 'date-time',
              label: this.$t('appNavigation.dateTime'),
              route: '/settings/date-time',
            },
            {
              id: 'network',
              label: this.$t('appNavigation.network'),
              route: '/settings/network',
            },
          ],
        },
      ],
    };
  },
};

export default AppNavigationMixin;
