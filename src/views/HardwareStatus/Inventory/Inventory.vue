<template>
  <b-container fluid="xl">
    <page-title style="display: none;" />
    <div class="page-title"><h1>{{showLeds ? $t('appPageTitle.inventory') : $t('appPageTitle.inventoryNoLeds') }}</h1></div>

    <!-- Service indicators -->
    <service-indicator />

    <!-- Quicklinks section -->
    <page-section :section-title="$t('pageInventory.quicklinkTitle')">
      <b-row class="w-75">
        <b-col v-for="column in quicklinkColumns" :key="column.id" xl="4">
          <div v-for="item in column" :key="item.id">
            <b-link
              :href="item.href"
              :data-ref="item.dataRef"
              @click.prevent="scrollToOffset"
            >
              <jump-link /> {{ item.linkText }}
            </b-link>
          </div>
        </b-col>
      </b-row>
    </page-section>

    <!-- System table -->
    <table-system ref="system" v-bind:show-leds="showSystemLeds" />

    <!-- BMC manager table -->
    <table-bmc-manager ref="bmc" v-bind:show-leds="showLeds" />

    <!-- Chassis table -->
    <table-chassis ref="chassis" v-bind:show-leds="showLeds" />

    <!-- DIMM slot table -->
    <table-dimm-slot ref="dimms" v-bind:show-leds="showLeds" />

    <!-- Fans table -->
    <table-fans ref="fans" v-bind:show-leds="showLeds" />

    <!-- Power supplies table -->
    <table-power-supplies ref="powerSupply" v-bind:show-leds="showLeds" />

    <!-- Processors table -->
    <table-processors ref="processors" v-bind:show-leds="showLeds" />

    <!-- Assembly table -->
    <table-assembly ref="assembly" v-bind:show-leds="showLeds" />

    <!-- NetworkAdapter table -->
    <table-network-adapter ref="networkAdapter" v-bind:show-leds="showLeds" />
  </b-container>
</template>

<script>
import PageTitle from '@/components/Global/PageTitle';
import ServiceIndicator from './InventoryServiceIndicator';
import TableSystem from './InventoryTableSystem';
import TablePowerSupplies from './InventoryTablePowerSupplies';
import TableDimmSlot from './InventoryTableDimmSlot';
import TableFans from './InventoryTableFans';
import TableBmcManager from './InventoryTableBmcManager';
import TableChassis from './InventoryTableChassis';
import TableProcessors from './InventoryTableProcessors';
import TableAssembly from './InventoryTableAssembly';
import TableNetworkAdapter from './InventoryTableNetworkAdapter';
import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import PageSection from '@/components/Global/PageSection';
import JumpLink16 from '@carbon/icons-vue/es/jump-link/16';
import JumpLinkMixin from '@/components/Mixins/JumpLinkMixin';
import { chunk } from 'lodash';
import { useI18n } from 'vue-i18n';
import i18n from '@/i18n';

export default {
  components: {
    PageTitle,
    ServiceIndicator,
    TableDimmSlot,
    TablePowerSupplies,
    TableSystem,
    TableFans,
    TableBmcManager,
    TableChassis,
    TableProcessors,
    TableAssembly,
    TableNetworkAdapter,
    PageSection,
    JumpLink: JumpLink16,
  },
  mixins: [LoadingBarMixin, JumpLinkMixin],
  beforeRouteLeave(_to, _from, next) {
    // Hide loader if user navigates away from page
    // before requests complete
    this.hideLoader();
    next();
  },
  data() {
    return {
      $t: useI18n().t,
      showLeds:
        (process.env.VUE_APP_ENV_NAME === 'nvidia-gb') ? false :
        process.env.VUE_APP_HIDE_INVENTORY_LED !== 'true',
      showSystemLeds:
        process.env.VUE_APP_HIDE_INVENTORY_LED !== 'true',
      observer: null,
      validLinks: [],
      links: [
        {
          id: 'system',
          dataRef: 'system',
          href: '#system',
          linkText: i18n.global.t('pageInventory.system'),
        },
        {
          id: 'bmc',
          dataRef: 'bmc',
          href: '#bmc',
          linkText: i18n.global.t('pageInventory.bmcManager'),
        },
        {
          id: 'chassis',
          dataRef: 'chassis',
          href: '#chassis',
          linkText: i18n.global.t('pageInventory.chassis'),
        },
        {
          id: 'dimms',
          dataRef: 'dimms',
          href: '#dimms',
          linkText: i18n.global.t('pageInventory.dimmSlot'),
        },
        {
          id: 'fans',
          dataRef: 'fans',
          href: '#fans',
          linkText: i18n.global.t('pageInventory.fans'),
        },
        {
          id: 'powerSupply',
          dataRef: 'powerSupply',
          href: '#powerSupply',
          linkText: i18n.global.t('pageInventory.powerSupplies'),
        },
        {
          id: 'processors',
          dataRef: 'processors',
          href: '#processors',
          linkText: i18n.global.t('pageInventory.processors'),
        },
        {
          id: 'assembly',
          dataRef: 'assembly',
          href: '#assembly',
          linkText: i18n.global.t('pageInventory.assemblies'),
        },
        {
          id: 'networkAdapter',
          dataRef: 'networkAdapter',
          href: '#networkAdapter',
          linkText: i18n.global.t('pageInventory.networkAdapters'),
        },
        {
          id: 'networkAdapter',
          dataRef: 'networkAdapter',
          href: '#networkAdapter',
          linkText: i18n.global.t('pageInventory.networkAdapters'),
        },
      ],
    };
  },
  computed: {
    quicklinkColumns() {
      // Chunk links array to 3 array's to display 3 items per column
      return chunk(this.validLinks, 3);
    },
  },
  mounted() {
    // Use observer to make the rendering of tables reactive, allow us to update the Quick Links
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation) {
          this.validateLinks();
        }
      });
    });
    this.observer.observe(this.$el, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    this.$nextTick(() => {
      // Validate links once the component is fully mounted
      this.validateLinks();
    });
  },
  beforeCreate() {
    let init = async () => {
      await this.$store.dispatch('system/getSystem');
    };

    init();
  },
  created() {
    this.startLoader();

    const bmcManagerTablePromise = new Promise((resolve) => {
      this.$root.$on('hardware-status-bmc-manager-complete', () => resolve());
    });
    const chassisTablePromise = new Promise((resolve) => {
      this.$root.$on('hardware-status-chassis-complete', () => resolve());
    });
    const dimmSlotTablePromise = new Promise((resolve) => {
      this.$root.$on('hardware-status-dimm-slot-complete', () => resolve());
    });
    const fansTablePromise = new Promise((resolve) => {
      this.$root.$on('hardware-status-fans-complete', () => resolve());
    });
    const powerSuppliesTablePromise = new Promise((resolve) => {
      this.$root.$on('hardware-status-power-supplies-complete', () =>
        resolve(),
      );
    });
    const processorsTablePromise = new Promise((resolve) => {
      this.$root.$on('hardware-status-processors-complete', () => resolve());
    });
    const serviceIndicatorPromise = new Promise((resolve) => {
      this.$root.$on('hardware-status-service-complete', () => resolve());
    });
    const systemTablePromise = new Promise((resolve) => {
      this.$root.$on('hardware-status-system-complete', () => resolve());
    });
    const assemblyTablePromise = new Promise((resolve) => {
      this.$root.$on('hardware-status-assembly-complete', () => resolve());
    });
    const networkAdapterTablePromise = new Promise((resolve) => {
      this.$root.$on('hardware-status-network-adapter-complete', () =>
        resolve(),
      );
    });
    // Combine all child component Promises to indicate
    // when page data load complete
    Promise.all([
      bmcManagerTablePromise,
      chassisTablePromise,
      dimmSlotTablePromise,
      fansTablePromise,
      powerSuppliesTablePromise,
      processorsTablePromise,
      serviceIndicatorPromise,
      systemTablePromise,
      assemblyTablePromise,
      networkAdapterTablePromise,
    ]).finally(() => {
      this.endLoader();
      this.validateLinks();
    });
  },
  beforeDestroy() {
    this.observer.disconnect();
  },
  methods: {
    validateLinks() {
      this.validLinks = this.links.filter((link) => this.isValid(link.dataRef));
    },
    isValid(dataRef) {
      const ref = this.$refs[dataRef];
      return (
        typeof ref !== 'undefined' &&
        ref.$el &&
        ref.$el.nodeType !== Node.COMMENT_NODE
      );
    },
  },
};
</script>
