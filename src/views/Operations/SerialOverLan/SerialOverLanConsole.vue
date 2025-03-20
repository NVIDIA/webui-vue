<template>
  <div :class="isFullWindow ? 'full-window-container' : 'terminal-container'">
    <b-row class="d-flex">
      <b-col sm="4" md="6">
        <alert
          v-if="connectionError"
          variant="danger"
          :small="true"
          class="mt-4"
        >
          <p class="col-form-label">
            {{ $t('pageSerialOverLan.alert.errorAlertMessage') }}
            <span class="d-block mt-2 text-danger">
              <strong>{{ $t('pageSerialOverLan.error') }}:</strong> {{ connectionError }}
            </span>
          </p>
        </alert>
        <alert
          v-if="powerState === 'Off'"
          variant="warning"
          :small="true"
          class="mt-4"
        >
          <p class="col-form-label">
            {{ $t('pageSerialOverLan.alert.disconnectedAlertMessage') }}
          </p>
        </alert>
      </b-col>
    </b-row>
    <b-row class="d-flex">
      <b-col class="d-flex flex-column justify-content-end">
        <dl class="mb-2" sm="6" md="6">
          <dt class="d-inline font-weight-bold mr-1">
            {{ $t('pageSerialOverLan.status') }}:
          </dt>
          <dd class="d-inline">
            <status-icon :status="connectionStateIcon" />
            {{ connectionStatusText }}
            <b-button 
              v-if="connectionState === ConnectionState.CLOSED" 
              size="sm" 
              variant="primary" 
              class="ml-2"
              @click="closeTerminal(); openTerminal()"
            >
              {{ $t('global.action.connect') }}
            </b-button>
          </dd>
        </dl>
      </b-col>

      <b-col v-if="!isFullWindow" class="d-flex justify-content-end">
        <b-button variant="link" type="button" @click="openConsoleWindow()">
          <icon-launch />
          {{ $t('pageSerialOverLan.openNewTab') }}
        </b-button>
      </b-col>
    </b-row>
    <div id="terminal" ref="panel" :class="terminalClass"></div>
  </div>
</template>

<script>
import Alert from '@/components/Global/Alert';
import { AttachAddon } from 'xterm-addon-attach';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal } from 'xterm';
import { throttle } from 'lodash';
import IconLaunch from '@carbon/icons-vue/es/launch/20';
import StatusIcon from '@/components/Global/StatusIcon';

// Connection state enum mapping to WebSocket.readyState values (0-3) plus ERROR
const ConnectionState = {
  CONNECTING: 'connecting',  // 0
  OPEN: 'connected',         // 1
  CLOSING: 'closing',        // 2
  CLOSED: 'disconnected',    // 3
  ERROR: 'error'             // custom state
};

export default {
  name: 'SerialOverLanConsole',
  components: {
    Alert,
    IconLaunch,
    StatusIcon,
  },
  props: {
    isFullWindow: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      ConnectionState,
      enableCustomKeys: process.env.VUE_APP_ENABLE_CUSTOM_KEYS === 'true',
      resizeConsoleWindow: null,
      terminalClass: this.isFullWindow ? 'full-window' : '',
      connectionState: ConnectionState.CLOSED,
      connectionError: null
    };
  },
  computed: {
    powerState() {
      return this.$store.getters['global/powerState'];
    },
    connectionStateIcon() {
      switch (this.connectionState) {
        case ConnectionState.OPEN:
          return 'success';
        case ConnectionState.CONNECTING:
        case ConnectionState.CLOSING:
          return 'warning';
        case ConnectionState.ERROR:
        case ConnectionState.CLOSED:
        default:
          return 'danger';
      }
    },
    connectionStatusText() {
      switch (this.connectionState) {
        case ConnectionState.OPEN:
          return this.$t('pageSerialOverLan.connected');
        case ConnectionState.CONNECTING:
          return this.$t('pageSerialOverLan.connecting');
        case ConnectionState.ERROR:
          return this.$t('pageSerialOverLan.connectionError');
        case ConnectionState.CLOSING:
          return this.$t('pageSerialOverLan.disconnected');
        case ConnectionState.CLOSED:
        default:
          return this.$t('pageSerialOverLan.disconnected');
      }
    }
  },
  created() {
    this.$store.dispatch('global/getSystemInfo');
  },
  mounted() {
    this.openTerminal();
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.resizeConsoleWindow);
    this.closeTerminal();
  },
  methods: {
    customKeys(ev) {
      var BACKSPACE = 8;
      var sequence = '';
      if (ev.type != 'keydown' || ev.shiftKey || ev.altKey) {
        return true;
      }
      switch (ev.keyCode) {
        case BACKSPACE:
          sequence = '\b';
          break;
        default:
          return true;
      }
      this.ws.send(sequence);
      return false;
    },
    customKeyHandlers(ev) {
      return this.customKeys(ev);
    },
    openTerminal() {
      this.connectionState = ConnectionState.CONNECTING;
      this.connectionError = null;
      
      const token = this.$store.getters['authentication/token'];
      this.ws = new WebSocket(`wss://${window.location.host}/console/default`, [
        token,
      ]);

      // Refer https://github.com/xtermjs/xterm.js/ for xterm implementation and addons.

      this.term = new Terminal({
        fontSize: 15,
        fontFamily:
          'SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
      });

      const attachAddon = new AttachAddon(this.ws);
      this.term.loadAddon(attachAddon);

      const fitAddon = new FitAddon();
      this.term.loadAddon(fitAddon);

      const SOL_THEME = {
        background: '#19273c',
        cursor: 'rgba(83, 146, 255, .5)',
        scrollbar: 'rgba(83, 146, 255, .5)',
      };
      this.term.setOption('theme', SOL_THEME);

      this.term.open(this.$refs.panel);
      fitAddon.fit();

      if (this.enableCustomKeys) {
        this.term.attachCustomKeyEventHandler(this.customKeyHandlers);
      }
      this.resizeConsoleWindow = throttle(() => {
        fitAddon.fit();
      }, 1000);
      window.addEventListener('resize', this.resizeConsoleWindow);

      try {
        this.ws.onopen = () => {
          console.log('websocket console/default opened');
          this.connectionState = ConnectionState.OPEN;
          this.connectionError = null;
        };
        this.ws.onclose = (event) => {
          console.log(
            'websocket console/default closed. code: ' +
              event.code +
              ' reason: ' +
              event.reason,
          );
          // Only set to CLOSED if we're not already in ERROR state
          if (this.connectionState !== ConnectionState.ERROR) {
            this.connectionState = ConnectionState.CLOSED;
          }
          if (event.code !== 1000) { // Normal closure
            this.connectionError = event.reason || this.$t('pageSerialOverLan.connectionClosedUnexpectedly');
          }
        };
        this.ws.onerror = (error) => {
          console.log('websocket console/default error', error);
          this.connectionState = ConnectionState.ERROR;
          this.connectionError = this.$t('pageSerialOverLan.failedToConnect');
        };
      } catch (error) {
        console.log(error);
        this.connectionState = ConnectionState.ERROR;
        this.connectionError = error.message || this.$t('pageSerialOverLan.failedToConnect');
      }
    },
    closeTerminal() {
      console.log('closeTerminal');
      if (this.term) {
        this.term.dispose();
        this.term = null;
      }
      if (this.ws && 
          (this.ws.readyState === (WebSocket.OPEN || 1) || 
           this.ws.readyState === (WebSocket.CONNECTING || 0))) {
        this.connectionState = ConnectionState.CLOSING;
        this.ws.close();
      }
      this.ws = null;
      this.connectionState = ConnectionState.CLOSED;
    },
    openConsoleWindow() {
      window.open(
        '#/console/serial-over-lan-console',
        '_blank',
        'directories=no,titlebar=no,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=yes,width=600,height=550',
      );
    },
  },
};
</script>

<style lang="scss" scoped>
@import '~xterm/css/xterm.css';

#terminal {
  overflow: auto;
  height: calc(100vh - 300px);
  min-height: 500px;
  &.full-window {
    height: calc(100vh - 80px);
  }
}

.full-window-container {
  width: 97%;
  margin: 1.5%;
}
</style>
