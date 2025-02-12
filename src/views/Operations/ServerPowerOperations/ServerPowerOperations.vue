<template>
  <b-container fluid="xl">
    <page-title />
    <b-row class="mb-4">
      <b-col md="8" xl="6">
        <page-section
          :section-title="$t('pageServerPowerOperations.currentStatus')"
        >
          <b-row>
            <b-col>
              <dl>
                <dt>{{ $t('pageServerPowerOperations.systemStatus') }}</dt>
                <dd data-test-id="powerServerOps-text-hostStatus">
                  {{ serverStatus }}
                </dd>
              </dl>
            </b-col>
            <b-col>
              <dl>
                <dt>{{ $t('pageServerPowerOperations.powerState') }}</dt>
                <dd data-test-id="powerServerOps-text-powerState">
                  {{ powerState }}
                </dd>
              </dl>
            </b-col>
          </b-row>
          <b-row>
            <b-col>
              <dl>
                <dt>
                  {{ $t('pageServerPowerOperations.lastPowerOperation') }}
                </dt>
                <dd
                  v-if="lastPowerOperationTime"
                  data-test-id="powerServerOps-text-lastPowerOp"
                >
                  {{ lastPowerOperationTime | formatDate }}
                  {{ lastPowerOperationTime | formatTime }}
                </dd>
                <dd v-else>--</dd>
              </dl>
            </b-col>
          </b-row>
        </page-section>
      </b-col>
    </b-row>
    <b-row>
      <b-col v-if="hasBootSourceOptions" sm="8" md="6" xl="4">
        <page-section
          :section-title="$t('pageServerPowerOperations.serverBootSettings')"
        >
          <boot-settings />
        </page-section>
      </b-col>
      <b-col sm="8" md="6" xl="7">
        <page-section
          :section-title="$t('pageServerPowerOperations.operations')"
        >
          <alert :show="oneTimeBootEnabled" variant="warning">
            {{ $t('pageServerPowerOperations.oneTimeBootWarning') }}
          </alert>
          <template v-if="isOperationInProgress">
            <alert variant="info">
              {{ $t('pageServerPowerOperations.operationInProgress') }}
            </alert>
          </template>
          <template v-else-if="isPowerOff">
            <b-button
              variant="primary"
              data-test-id="serverPowerOperations-button-powerOn"
              @click="powerOn"
            >
              {{ $t('pageServerPowerOperations.powerOn') }}
            </b-button>
          </template>
          <template v-else>
            <!-- Reboot server options -->
            <b-form novalidate class="mb-5" @submit.prevent="rebootServer">
              <b-form-group
                :label="$t('pageServerPowerOperations.rebootServer')"
              >
                <b-form-radio
                  v-model="form.rebootOption"
                  name="reboot-option"
                  data-test-id="serverPowerOperations-radio-rebootOrderly"
                  value="orderly"
                >
                  {{ $t('pageServerPowerOperations.gracefulRestart') }}
                  <info-tooltip
                    :title="$t('pageServerPowerOperations.gracefulRestartInfo')"
                  />
                </b-form-radio>
                <b-form-radio
                  v-model="form.rebootOption"
                  name="reboot-option"
                  data-test-id="serverPowerOperations-radio-rebootImmediate"
                  value="immediate"
                >
                  {{ $t('pageServerPowerOperations.forceRestart') }}
                  <info-tooltip
                    :title="$t('pageServerPowerOperations.forceRestartInfo')"
                  />
                </b-form-radio>
                <b-form-radio
                  v-if="showPowerCycle"
                  v-model="form.rebootOption"
                  name="reboot-option"
                  data-test-id="serverPowerOperations-radio-powerCycle"
                  value="cycle"
                >
                  {{ $t('pageServerPowerOperations.powerCycle') }}
                  <info-tooltip
                    :title="$t('pageServerPowerOperations.powerCycleInfo')"
                  />
                </b-form-radio>
              </b-form-group>
              <b-button
                variant="primary"
                type="submit"
                data-test-id="serverPowerOperations-button-reboot"
              >
                {{ $t('pageServerPowerOperations.reboot') }}
              </b-button>
            </b-form>
            <!-- Shutdown server options -->
            <b-form novalidate @submit.prevent="shutdownServer">
              <b-form-group
                :label="$t('pageServerPowerOperations.shutdownServer')"
              >
                <b-form-radio
                  v-model="form.shutdownOption"
                  name="shutdown-option"
                  data-test-id="serverPowerOperations-radio-shutdownOrderly"
                  value="orderly"
                >
                  {{ $t('pageServerPowerOperations.gracefulShutdown') }}
                  <info-tooltip
                    :title="$t('pageServerPowerOperations.gracefulShutdownInfo')"
                  />
                </b-form-radio>
                <b-form-radio
                  v-if="showForceOff"
                  v-model="form.shutdownOption"
                  name="shutdown-option"
                  data-test-id="serverPowerOperations-radio-shutdownImmediate"
                  value="immediate"
                >
                  {{ $t('pageServerPowerOperations.forceOff') }}
                  <info-tooltip
                    :title="$t('pageServerPowerOperations.forceOffInfo')"
                  />
                </b-form-radio>
              </b-form-group>
              <b-button
                variant="primary"
                type="submit"
                data-test-id="serverPowerOperations-button-shutDown"
              >
                {{ $t('pageServerPowerOperations.shutDown') }}
              </b-button>
            </b-form>
          </template>
        </page-section>
      </b-col>
    </b-row>
  </b-container>
</template>

<script>
import PageTitle from '@/components/Global/PageTitle';
import PageSection from '@/components/Global/PageSection';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import BootSettings from './BootSettings';
import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import Alert from '@/components/Global/Alert';
import InfoTooltip from '@/components/Global/InfoTooltip';

export default {
  name: 'ServerPowerOperations',
  components: { PageTitle, PageSection, BootSettings, Alert, InfoTooltip },
  mixins: [BVToastMixin, LoadingBarMixin],
  beforeRouteLeave(to, from, next) {
    this.hideLoader();
    next();
  },
  data() {
    return {
      form: {
        rebootOption: 'orderly',
        shutdownOption: 'orderly',
      },
      showPowerCycle: process.env.VUE_APP_ENV_NAME === 'nvidia-bluefield',
      showForceOff: process.env.VUE_APP_ENV_NAME !== 'nvidia-bluefield',
    };
  },
  computed: {
    serverStatus() {
      return this.$store.getters['global/serverStatus'];
    },
    powerState() {
      return this.$store.getters['global/powerState'];
    },
    isPowerOff() {
      return this.$store.getters['global/isPowerOff'];
    },
    isOperationInProgress() {
      return this.$store.getters['controls/isOperationInProgress'];
    },
    lastPowerOperationTime() {
      return this.$store.getters['controls/lastPowerOperationTime'];
    },
    oneTimeBootEnabled() {
      return this.$store.getters['serverBootSettings/overrideEnabled'];
    },
    hasBootSourceOptions() {
      let bootOptions =
        this.$store.getters['serverBootSettings/bootSourceOptions'];
      return bootOptions.length !== 0;
    },
  },
  created() {
    this.startLoader();
    const bootSettingsPromise = new Promise((resolve) => {
      this.$root.$on('server-power-operations-boot-settings-complete', () =>
        resolve(),
      );
    });
    Promise.all([
      this.$store.dispatch('serverBootSettings/getBootSettings'),
      this.$store.dispatch('controls/getLastPowerOperationTime'),
      this.$store.dispatch('global/getSystemInfo'),
      bootSettingsPromise,
    ]).finally(() => this.endLoader());
  },
  methods: {
    powerOn() {
      this.$store.dispatch('controls/serverPowerOn');
    },
    rebootServer() {
      const modalMessage = this.$t(
        'pageServerPowerOperations.modal.confirmRebootMessage',
      );
      const modalOptions = {
        title: this.$t('pageServerPowerOperations.modal.confirmRebootTitle'),
        okTitle: this.$t('global.action.confirm'),
        cancelTitle: this.$t('global.action.cancel'),
        autoFocusButton: 'ok',
      };

      if (this.form.rebootOption === 'orderly') {
        this.$bvModal
          .msgBoxConfirm(modalMessage, modalOptions)
          .then((confirmed) => {
            if (confirmed) this.$store.dispatch('controls/serverSoftReboot');
          });
      } else if (this.form.rebootOption === 'immediate') {
        this.$bvModal
          .msgBoxConfirm(modalMessage, modalOptions)
          .then((confirmed) => {
            if (confirmed) this.$store.dispatch('controls/serverHardReboot');
          });
      } else if (this.form.rebootOption === 'cycle') {
        this.$bvModal
          .msgBoxConfirm(modalMessage, modalOptions)
          .then((confirmed) => {
            if (confirmed) this.$store.dispatch('controls/serverPowerCycle');
          });
      }
    },
    shutdownServer() {
      const modalMessage = this.$t(
        'pageServerPowerOperations.modal.confirmShutdownMessage',
      );
      const modalOptions = {
        title: this.$t('pageServerPowerOperations.modal.confirmShutdownTitle'),
        okTitle: this.$t('global.action.confirm'),
        cancelTitle: this.$t('global.action.cancel'),
        autoFocusButton: 'ok',
      };

      if (this.form.shutdownOption === 'orderly') {
        this.$bvModal
          .msgBoxConfirm(modalMessage, modalOptions)
          .then((confirmed) => {
            if (confirmed) this.$store.dispatch('controls/serverSoftPowerOff');
          });
      }
      if (this.form.shutdownOption === 'immediate') {
        this.$bvModal
          .msgBoxConfirm(modalMessage, modalOptions)
          .then((confirmed) => {
            if (confirmed) this.$store.dispatch('controls/serverHardPowerOff');
          });
      }
    },
  },
};
</script>
