<template>
  <overview-card
    :title="showLeds ? $t('pageOverview.inventory') : $t('pageOverview.inventoryNoLeds')"
    :to="`/hardware-status/inventory`"
  >
    <b-row class="mt-3" v-if="showLeds">
      <b-col sm="6">
        <dl sm="6">
          <dt>{{ $t('pageOverview.systemIdentifyLed') }}</dt>
          <dd>
            <b-form-checkbox
              id="identifyLedSwitch"
              v-model="systems.locationIndicatorActive"
              data-test-id="overviewInventory-checkbox-identifyLed"
              switch
              @change="toggleIdentifyLedSwitch"
            >
              <span v-if="systems.locationIndicatorActive">
                {{ $t('global.status.on') }}
              </span>
              <span v-else>{{ $t('global.status.off') }}</span>
            </b-form-checkbox>
          </dd>
        </dl>
      </b-col>
    </b-row>
  </overview-card>
</template>

<script>
import OverviewCard from './OverviewCard';
import BVToastMixin from '@/components/Mixins/BVToastMixin';

export default {
  name: 'Inventory',
  components: {
    OverviewCard,
  },
  mixins: [BVToastMixin],
  data() {
    return {
      showLeds:
        process.env.VUE_APP_HIDE_INVENTORY_LED !== 'true',
    }
  },
  computed: {
    systems() {
      let systemData = this.$store.getters['system/systems'][0];
      return systemData ? systemData : {};
    },
  },
  created() {
    this.$store.dispatch('system/getSystem').finally(() => {
      this.$root.$emit('overview-inventory-complete');
    });
  },
  methods: {
    toggleIdentifyLedSwitch(state) {
      this.$store
        .dispatch('system/changeIdentifyLedState', state)
        .then((message) => this.successToast(message))
        .catch(({ message }) => this.errorToast(message));
    },
  },
};
</script>
