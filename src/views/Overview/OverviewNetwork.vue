<template>
  <overview-card
    v-if="network"
    :title="$t('pageOverview.networkInformation')"
    :to="`/settings/network`"
  >
    <b-row class="mt-3">
      <b-col sm="6">
        <dl>
          <dt>{{ $t('pageOverview.hostName') }}</dt>
          <dd>{{ dataFormatter(network.hostname) }}</dd>
        </dl>
      </b-col>
      <b-col sm="6">
        <dl>
          <dt>{{ $t('pageOverview.linkStatus') }}</dt>
          <dd>
            {{ dataFormatter(network.linkStatus) }}
          </dd>
        </dl>
      </b-col>
    </b-row>
    <b-row>
      <b-col>
        <dl>
          <dt>{{ $t('pageOverview.ipv4StaticAddress') }}</dt>
          <dd>
            {{ dataFormatter(network.staticAddress) }}
          </dd>
        </dl>
      </b-col>
      <b-col>
        <dl>
          <dt>{{ $t('pageOverview.dhcp') }}</dt>
          <dd>
            {{
              dataFormatter(
                network.dhcpAddress.length !== 0
                  ? network.dhcpAddress[0].Address
                  : null,
              )
            }}
          </dd>
        </dl>
      </b-col>
    </b-row>
    <b-row v-if="showIPv6">
      <b-col>
        <dl>
          <dt>{{ $t('pageOverview.ipv6StaticAddress') }}</dt>
          <dd>
            {{ dataFormatter(network.ipv6StaticAddress) }}
          </dd>
        </dl>
      </b-col>
      <b-col>
        <dl>
          <dt>{{ $t('pageOverview.dhcp6') }}</dt>
          <dd>
            {{
              dataFormatter(
                network.dhcpv6Address.length !== 0
                  ? network.dhcpv6Address[0].Address
                  : null,
              )
            }}
          </dd>
        </dl>
      </b-col>
    </b-row>
    <b-row v-if="showIPv6">
      <b-col>
      </b-col>
      <b-col>
        <dl>
          <dt>{{ $t('pageOverview.slaac') }}</dt>
          <dd>
            {{
              dataFormatter(
                network.slaacAddress.length !== 0
                  ? network.slaacAddress[0].Address
                  : null,
              )
            }}
          </dd>
        </dl>
      </b-col>
    </b-row>
  </overview-card>
</template>

<script>
import OverviewCard from './OverviewCard';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';

export default {
  name: 'Network',
  components: {
    OverviewCard,
  },
  mixins: [DataFormatterMixin],
  data() {
    return {
      showIPv6: process.env.VUE_APP_ENV_NAME === 'nvidia-bluefield',
    };
  },
  computed: {
    network() {
      return this.$store.getters['network/globalNetworkSettings'][0];
    },
  },
  created() {
    this.$store.dispatch('network/getEthernetData').finally(() => {
      this.$root.$emit('overview-network-complete');
    });
  },
};
</script>
