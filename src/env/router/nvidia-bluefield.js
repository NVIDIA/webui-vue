import AppLayout from '@/layouts/AppLayout.vue';
import ChangePassword from '@/views/ChangePassword';
import ConsoleLayout from '@/layouts/ConsoleLayout.vue';
import DateTime from '@/views/Settings/DateTime';
import Dumps from '@/views/Logs/Dumps';
import EventLogs from '@/views/Logs/EventLogs';
import SelLogs from '@/views/Logs/SelLogs';
import FactoryReset from '@/views/Operations/FactoryReset';
import Firmware from '@/views/Operations/Firmware';
import KvmConsole from '@/views/Operations/Kvm/KvmConsole';
import Login from '@/views/Login';
import LoginLayout from '@/layouts/LoginLayout';
import Network from '@/views/Settings/Network';
import Overview from '@/views/Overview';
import PageNotFound from '@/views/PageNotFound';
import ProfileSettings from '@/views/ProfileSettings';
import RebootBmc from '@/views/Operations/RebootBmc';
import Sensors from '@/views/HardwareStatus/Sensors';
import SerialOverLan from '@/views/Operations/SerialOverLan';
import SerialOverLanConsole from '@/views/Operations/SerialOverLan/SerialOverLanConsole';
import ServerPowerOperations from '@/views/Operations/ServerPowerOperations';
import Inventory from '@/views/HardwareStatus/Inventory';
import Sessions from '@/views/SecurityAndAccess/Sessions';
import UserManagement from '@/views/SecurityAndAccess/UserManagement';
import Certificates from '@/views/SecurityAndAccess/Certificates';
import i18n from '@/i18n';

const roles = {
  administrator: 'Administrator',
  operator: 'Operator',
  readonly: 'ReadOnly',
  noaccess: 'NoAccess',
};

const routes = [
  {
    path: '/login',
    component: LoginLayout,
    children: [
      {
        path: '',
        name: 'login',
        component: Login,
        meta: {
          title: i18n.t('appPageTitle.login'),
        },
      },
      {
        path: '/change-password',
        name: 'change-password',
        component: ChangePassword,
        meta: {
          title: i18n.t('appPageTitle.changePassword'),
          requiresAuth: true,
        },
      },
    ],
  },
  {
    path: '/console',
    component: ConsoleLayout,
    meta: {
      requiresAuth: true,
    },
    children: [
      {
        path: 'serial-over-lan-console',
        name: 'serial-over-lan-console',
        component: SerialOverLanConsole,
        meta: {
          title: i18n.t('appPageTitle.serialOverLan'),
        },
      },
      {
        path: 'kvm',
        name: 'kvm-console',
        component: KvmConsole,
        meta: {
          title: i18n.t('appPageTitle.kvm'),
        },
      },
    ],
  },
  {
    path: '/',
    meta: {
      requiresAuth: true,
    },
    component: AppLayout,
    children: [
      {
        path: '',
        name: 'overview',
        component: Overview,
        meta: {
          title: i18n.t('appPageTitle.overview'),
        },
      },
      {
        path: '/profile-settings',
        name: 'profile-settings',
        component: ProfileSettings,
        meta: {
          title: i18n.t('appPageTitle.profileSettings'),
        },
      },
      {
        path: '/logs/event-logs',
        name: 'event-logs',
        component: EventLogs,
        meta: {
          title: i18n.t('appPageTitle.eventLogs'),
        },
      },
      {
        path: '/logs/sel-logs',
        name: 'sel-logs',
        component: SelLogs,
        meta: {
          title: i18n.t('appPageTitle.eventLogs'),
        },
      },
      {
        path: '/logs/dumps',
        name: 'dumps',
        component: Dumps,
        meta: {
          title: i18n.t('appPageTitle.dumps'),
        },
      },
      {
        path: '/hardware-status/inventory',
        name: 'inventory',
        component: Inventory,
        meta: {
          title: i18n.t('appPageTitle.inventory'),
        },
      },
      {
        path: '/hardware-status/sensors',
        name: 'sensors',
        component: Sensors,
        meta: {
          title: i18n.t('appPageTitle.sensors'),
        },
      },
      {
        path: '/settings/date-time',
        name: 'date-time',
        component: DateTime,
        meta: {
          title: i18n.t('appPageTitle.dateTime'),
        },
      },
      {
        path: '/operations/factory-reset',
        name: 'factory-reset',
        component: FactoryReset,
        meta: {
          title: i18n.t('appPageTitle.factoryReset'),
        },
      },
      {
        path: '/operations/firmware',
        name: 'firmware',
        component: Firmware,
        meta: {
          title: i18n.t('appPageTitle.firmware'),
        },
      },
      {
        path: '/settings/network',
        name: 'network',
        component: Network,
        meta: {
          title: i18n.t('appPageTitle.network'),
        },
      },
      {
        path: '/security-and-access/sessions',
        name: 'sessions',
        component: Sessions,
        meta: {
          title: i18n.t('appPageTitle.sessions'),
        },
      },
      {
        path: '/security-and-access/user-management',
        name: 'user-management',
        component: UserManagement,
        meta: {
          title: i18n.t('appPageTitle.userManagement'),
        },
      },
      {
        path: '/security-and-access/certificates',
        name: 'certificates',
        component: Certificates,
        meta: {
          title: i18n.t('appPageTitle.certificates'),
        },
      },
      {
        path: '/operations/reboot-bmc',
        name: 'reboot-bmc',
        component: RebootBmc,
        meta: {
          title: i18n.t('appPageTitle.rebootBmc'),
        },
      },
      {
        path: '/operations/serial-over-lan',
        name: 'serial-over-lan',
        component: SerialOverLan,
        meta: {
          title: i18n.t('appPageTitle.serialOverLan'),
          exclusiveToRoles: [roles.administrator],
        },
      },
      {
        path: '/operations/server-power-operations',
        name: 'server-power-operations',
        component: ServerPowerOperations,
        meta: {
          title: i18n.t('appPageTitle.serverPowerOperations'),
        },
      },
      {
        path: '*',
        name: 'page-not-found',
        component: PageNotFound,
        meta: {
          title: i18n.t('appPageTitle.pageNotFound'),
        },
      },
    ],
  },
];

export default routes;
