<template>
  <b-container fluid="xl">
    <page-title />
    <b-row>
      <b-col md="8" xl="6">
        <alert variant="info" class="mb-4">
          <span>
            {{ $t('pageDateTime.alert.message') }}
            <b-link to="/profile-settings">
              {{ $t('pageDateTime.alert.link') }}</b-link
            >
          </span>
        </alert>
      </b-col>
    </b-row>
    <page-section>
      <b-row>
        <b-col lg="3">
          <dl>
            <dt>{{ $t('pageDateTime.form.date') }}</dt>
            <dd v-if="bmcTime">{{ bmcTime | formatDate }}</dd>
            <dd v-else>--</dd>
          </dl>
        </b-col>
        <b-col lg="3">
          <dl>
            <dt>{{ $t('pageDateTime.form.time.label') }}</dt>
            <dd v-if="bmcTime">{{ bmcTime | formatTime }}</dd>
            <dd v-else>--</dd>
          </dl>
        </b-col>
      </b-row>
    </page-section>
    <page-section :section-title="$t('pageDateTime.configureSettings')">
      <b-form novalidate @submit.prevent="submitForm">
        <b-form-group
          label="Configure date and time"
          :disabled="loading"
          label-sr-only
        >
          <b-form-radio
            v-model="form.configurationSelected"
            value="manual"
            data-test-id="dateTime-radio-configureManual"
          >
            {{ $t('pageDateTime.form.manual') }}
          </b-form-radio>
          <b-row class="mt-3 ml-3">
            <b-col sm="6" lg="4" xl="3">
              <b-form-group
                :label="$t('pageDateTime.form.date')"
                label-for="input-manual-date"
              >
                <b-form-text id="date-format-help">YYYY-MM-DD</b-form-text>
                <b-input-group>
                  <b-form-input
                    id="input-manual-date"
                    v-model="form.manual.date"
                    :state="getValidationState($v.form.manual.date)"
                    :disabled="ntpOptionSelected"
                    data-test-id="dateTime-input-manualDate"
                    class="form-control-with-button"
                    @blur="$v.form.manual.date.$touch()"
                  />
                  <b-form-invalid-feedback role="alert">
                    <div v-if="!$v.form.manual.date.pattern">
                      {{ $t('global.form.invalidFormat') }}
                    </div>
                    <div v-if="!$v.form.manual.date.required">
                      {{ $t('global.form.fieldRequired') }}
                    </div>
                  </b-form-invalid-feedback>
                  <b-form-datepicker
                    v-model="form.manual.date"
                    class="btn-datepicker btn-icon-only"
                    button-only
                    right
                    :hide-header="true"
                    :locale="locale"
                    :label-help="
                      $t('global.calendar.useCursorKeysToNavigateCalendarDates')
                    "
                    :title="$t('global.calendar.selectDate')"
                    :disabled="ntpOptionSelected"
                    button-variant="link"
                    aria-controls="input-manual-date"
                  >
                    <template #button-content>
                      <icon-calendar />
                      <span class="sr-only">
                        {{ $t('global.calendar.selectDate') }}
                      </span>
                    </template>
                  </b-form-datepicker>
                </b-input-group>
              </b-form-group>
            </b-col>
            <b-col sm="6" lg="4" xl="3">
              <b-form-group
                :label="$t('pageDateTime.form.time.timezone', { timezone })"
                label-for="input-manual-time"
              >
                <b-form-text id="time-format-help">HH:MM</b-form-text>
                <b-input-group>
                  <b-form-input
                    id="input-manual-time"
                    v-model="form.manual.time"
                    :state="getValidationState($v.form.manual.time)"
                    :disabled="ntpOptionSelected"
                    data-test-id="dateTime-input-manualTime"
                    @blur="$v.form.manual.time.$touch()"
                  />
                  <b-form-invalid-feedback role="alert">
                    <div v-if="!$v.form.manual.time.pattern">
                      {{ $t('global.form.invalidFormat') }}
                    </div>
                    <div v-if="!$v.form.manual.time.required">
                      {{ $t('global.form.fieldRequired') }}
                    </div>
                  </b-form-invalid-feedback>
                </b-input-group>
              </b-form-group>
            </b-col>
          </b-row>
          <b-form-radio
            v-model="form.configurationSelected"
            value="ntp"
            data-test-id="dateTime-radio-configureNTP"
          >
            NTP
          </b-form-radio>
          <b-row class="mt-3 ml-3">
            <b-col
              v-for="(item, index) in form.ntpItems"
              :key="index"
              sm="6"
              lg="4"
              xl="3"
            >
              <b-form-group
                :label="$t('pageDateTime.form.ntpServers.server', { index })"
                :label-for="item.id"
              >
                <b-input-group v-if="index == 0">
                  <b-form-input
                    :id="item.id"
                    v-model="form.ntp.firstAddress"
                    :state="getValidationState($v.form.ntp.firstAddress)"
                    :disabled="manualOptionSelected"
                    :data-test-id="item.dataTestId"
                    @blur="$v.form.ntp.firstAddress.$touch()"
                  />
                  <b-form-invalid-feedback role="alert">
                    <div v-if="!$v.form.ntp.firstAddress.required">
                      {{ $t('global.form.fieldRequired') }}
                    </div>
                  </b-form-invalid-feedback>
                </b-input-group>
                <b-input-group v-else>
                  <b-form-input
                    :id="item.id"
                    v-model="form.ntpAddresses[index]"
                    :disabled="manualOptionSelected"
                    :data-test-id="item.dataTestId"
                  />
                </b-input-group>
              </b-form-group>
            </b-col>
          </b-row>
          <b-button
            variant="primary"
            type="submit"
            data-test-id="dateTime-button-saveSettings"
          >
            {{ $t('global.action.saveSettings') }}
          </b-button>
        </b-form-group>
      </b-form>
    </page-section>
  </b-container>
</template>

<script>
import Alert from '@/components/Global/Alert';
import IconCalendar from '@carbon/icons-vue/es/calendar/20';
import PageTitle from '@/components/Global/PageTitle';
import PageSection from '@/components/Global/PageSection';

import BVToastMixin from '@/components/Mixins/BVToastMixin';
import LoadingBarMixin, { loading } from '@/components/Mixins/LoadingBarMixin';
import LocalTimezoneLabelMixin from '@/components/Mixins/LocalTimezoneLabelMixin';
import VuelidateMixin from '@/components/Mixins/VuelidateMixin.js';

import { mapState } from 'vuex';
import { requiredIf, helpers } from 'vuelidate/lib/validators';

const isoDateRegex = /([12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))/;
const isoTimeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;

export default {
  name: 'DateTime',
  components: { Alert, IconCalendar, PageTitle, PageSection },
  mixins: [
    BVToastMixin,
    LoadingBarMixin,
    LocalTimezoneLabelMixin,
    VuelidateMixin,
  ],
  beforeRouteLeave(to, from, next) {
    this.hideLoader();
    next();
  },
  data() {
    const ntpServerNumber = process.env.VUE_APP_NTP_SERVER_NUMBER
      ? process.env.VUE_APP_NTP_SERVER_NUMBER
      : 3;
    const addresses = [];
    const items = [];
    for (let i = 0; i < ntpServerNumber; i++) {
      addresses.push('');
      const item = {
        id: 'input-ntp-' + i.toString(),
        dataTestId: 'dateTime-input-ntpServer' + i.toString(),
      };
      items.push(item);
    }
    return {
      locale: this.$store.getters['global/languagePreference'],
      form: {
        configurationSelected: 'manual',
        manual: {
          date: '',
          time: '',
        },
        ntpItems: items,
        ntpAddresses: addresses,
        ntp: {
          firstAddress: '',
        },
      },
      loading,
    };
  },
  validations() {
    return {
      form: {
        manual: {
          date: {
            required: requiredIf(function () {
              return this.form.configurationSelected === 'manual';
            }),
            pattern: helpers.regex('pattern', isoDateRegex),
          },
          time: {
            required: requiredIf(function () {
              return this.form.configurationSelected === 'manual';
            }),
            pattern: helpers.regex('pattern', isoTimeRegex),
          },
        },
        ntp: {
          firstAddress: {
            required: requiredIf(function () {
              return this.form.configurationSelected === 'ntp';
            }),
          },
        },
      },
    };
  },
  computed: {
    ...mapState('dateTime', ['ntpServers', 'isNtpProtocolEnabled']),
    bmcTime() {
      return this.$store.getters['global/bmcTime'];
    },
    ntpOptionSelected() {
      return this.form.configurationSelected === 'ntp';
    },
    manualOptionSelected() {
      return this.form.configurationSelected === 'manual';
    },
    isUtcDisplay() {
      return this.$store.getters['global/isUtcDisplay'];
    },
    timezone() {
      if (this.isUtcDisplay) {
        return 'UTC';
      }
      return this.localOffset();
    },
  },
  watch: {
    ntpServers() {
      this.setNtpValues();
    },
    manualDate() {
      this.emitChange();
    },
    bmcTime() {
      this.form.manual.date = this.$options.filters.formatDate(
        this.$store.getters['global/bmcTime'],
      );
      this.form.manual.time = this.$options.filters
        .formatTime(this.$store.getters['global/bmcTime'])
        .slice(0, 5);
    },
  },
  created() {
    this.startLoader();
    this.setNtpValues();
    Promise.all([
      this.$store.dispatch('global/getBmcTime'),
      this.$store.dispatch('dateTime/getNtpData'),
    ]).finally(() => this.endLoader());
  },
  methods: {
    emitChange() {
      if (this.$v.$invalid) return;
      this.$v.$reset(); //reset to re-validate on blur
      this.$emit('change', {
        manualDate: this.manualDate ? new Date(this.manualDate) : null,
      });
    },
    setNtpValues() {
      this.form.configurationSelected = this.isNtpProtocolEnabled
        ? 'ntp'
        : 'manual';
      this.form.ntp.firstAddress = this.ntpServers[0];
      for (let i = 0; i < this.ntpServers.length; i++) {
        this.form.ntpAddresses[i] = this.ntpServers[i];
      }
    },
    submitForm() {
      this.$v.$touch();
      if (this.$v.$invalid) return;
      this.startLoader();

      let dateTimeForm = {};
      let isNTPEnabled = this.form.configurationSelected === 'ntp';

      if (!isNTPEnabled) {
        const isUtcDisplay = this.$store.getters['global/isUtcDisplay'];
        let date;

        dateTimeForm.ntpProtocolEnabled = false;

        if (isUtcDisplay) {
          // Create UTC Date
          date = this.getUtcDate(this.form.manual.date, this.form.manual.time);
        } else {
          // Create local Date
          date = new Date(`${this.form.manual.date} ${this.form.manual.time}`);
        }

        dateTimeForm.updatedDateTime = date.toISOString();
      } else {
        dateTimeForm.ntpProtocolEnabled = true;
        // Shift address up if address is empty in the middle
        // to avoid refreshing after delay when updating NTP
        let i = 1,
          j = 1;
        for (; i < this.form.ntpAddresses.length; i++) {
          if (this.form.ntpAddresses[i]) {
            this.form.ntpAddresses[j++] = this.form.ntpAddresses[i];
          }
        }
        for (; j < this.form.ntpAddresses.length; ) {
          this.form.ntpAddresses[j++] = '';
        }
        const ntpArray = [this.form.ntp.firstAddress];
        for (let i = 1; i < this.form.ntpAddresses.length; i++) {
          ntpArray.push(this.form.ntpAddresses[i]);
        }

        // Filter the ntpArray to remove empty strings,
        // per Redfish spec there should be no empty strings or null on the ntp array.
        const ntpArrayFiltered = ntpArray.filter((x) => x);

        dateTimeForm.ntpServersArray = [...ntpArrayFiltered];

        for (let i = 0; i < this.form.ntpAddresses.length; i++) {
          this.ntpServers[i] = '';
        }
        for (let i = 0; i < dateTimeForm.ntpServersArray.length; i++) {
          this.ntpServers[i] = dateTimeForm.ntpServersArray[i];
        }

        this.setNtpValues();
      }

      this.$store
        .dispatch('dateTime/updateDateTime', dateTimeForm)
        .then((success) => {
          this.successToast(success);
          if (!isNTPEnabled) return;
        })
        .then(() => {
          this.$store.dispatch('global/getBmcTime');
        })
        .catch(({ message }) => this.errorToast(message))
        .finally(() => {
          this.$v.form.$reset();
          this.endLoader();
        });
    },
    getUtcDate(date, time) {
      // Split user input string values to create
      // a UTC Date object
      const datesArray = date.split('-');
      const timeArray = time.split(':');
      let utcDate = Date.UTC(
        datesArray[0], // User input year
        //UTC expects zero-index month value 0-11 (January-December)
        //for reference https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/UTC#Parameters
        parseInt(datesArray[1]) - 1, // User input month
        datesArray[2], // User input day
        timeArray[0], // User input hour
        timeArray[1], // User input minute
      );
      return new Date(utcDate);
    },
  },
};
</script>
