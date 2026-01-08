<template>
  <page-section
    v-if="showLeds && !isLocationIndicatorUndefined"
    :section-title="$t('pageInventory.systemIndicator.sectionTitle')"
  >
    <div class="form-background ps-4 pt-4 pb-1">
      <b-row>
        <b-col sm="6" md="3">
          <dl>
            <dt>
              {{ $t('pageInventory.systemIndicator.powerStatus') }}
            </dt>
            <dd>
              {{ powerState ? $t(`global.powerState.${powerState}`) : '' }}
            </dd>
          </dl>
        </b-col>
        <b-col sm="6" md="3">
          <dl>
            <dt>
              {{ $t('pageInventory.systemIndicator.identifyLed') }}
            </dt>
            <dd>
              <b-form-checkbox
                id="identifyLedSwitchService"
                v-model="locationIndicatorActive"
                data-test-id="inventoryService-toggle-identifyLed"
                switch
                @update:model-value="toggleIdentifyLedSwitch"
              >
                <span v-if="locationIndicatorActive">
                  {{ $t('global.status.on') }}
                </span>
                <span v-else>{{ $t('global.status.off') }}</span>
              </b-form-checkbox>
            </dd>
          </dl>
        </b-col>
      </b-row>
    </div>
  </page-section>
</template>
<script>
import PageSection from '@/components/Global/PageSection';
import eventBus from '@/eventBus';
import BVToastMixin from '@/components/Mixins/BVToastMixin';

export default {
  components: { PageSection },
  mixins: [BVToastMixin],
  props: ['showLeds'],
  computed: {
    locationIndicatorActive() {
      return this.$store.getters['global/locationIndicatorActive'];
    },
    powerState() {
      return this.$store.getters['global/powerState'] || `global.status.off`;
    },
    isLocationIndicatorUndefined() {
      return typeof this.locationIndicatorActive === 'undefined';
    },
  },
  created() {
    this.$store.dispatch('global/getSystemInfo').finally(() => {
      // Emit initial data fetch complete to parent component
      eventBus.$emit('hardware-status-service-complete');
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
