<template>
  <div :class="containerClass">
    <!-- Terminal Panel - Full height console -->
    <div class="terminal-panel" :class="{ 'terminal-panel--fullscreen': isTerminalFullscreen }">
      <!-- Terminal Header / Control Bar with integrated status -->
      <div class="terminal-header">
        <div class="terminal-header__left">
          <!-- Connection Status -->
          <div class="connection-indicator" :class="connectionIndicatorClass">
            <span class="connection-indicator__dot"></span>
            <span class="connection-indicator__text">{{ connectionStatusText }}</span>
          </div>

          <!-- Reconnect / Connect buttons -->
          <b-button 
            v-if="connectionState === ConnectionState.CLOSED && !isReconnecting" 
            size="sm" 
            variant="success"
            class="ms-3"
            @click="closeTerminal(); openTerminal()"
          >
            {{ $t('global.action.connect') }}
          </b-button>
          <b-button 
            v-if="isReconnecting" 
            size="sm" 
            variant="outline-secondary"
            class="ms-3"
            @click="cancelReconnect()"
          >
            <span class="spinner-border spinner-border-sm me-1"></span>
            {{ $t('pageSerialOverLan.cancelReconnect') }}
          </b-button>

          <span class="terminal-header__divider"></span>

          <!-- Power State (compact) -->
          <div class="header-status" :class="powerStatusClass">
            <icon-power class="header-status__icon" />
            <span class="header-status__value">{{ powerState || '—' }}</span>
          </div>

          <!-- Boot Progress (compact, if booting) -->
          <div v-if="isBooting" class="header-status header-status--info">
            <icon-boot class="header-status__icon header-status__icon--spin" />
            <span class="header-status__value">{{ bootProgressLabel }}</span>
          </div>

          <!-- Power Off Warning -->
          <div v-if="powerState === 'Off'" class="header-warning">
            <b-link to="/operations/server-power-operations" class="header-warning__link">
              {{ $t('pageSerialOverLan.alert.disconnectedAlertMessage') }}
            </b-link>
          </div>
        </div>

        <div class="terminal-header__right">
          <!-- Search Toggle -->
          <button 
            v-b-tooltip.hover.bottom 
            :title="$t('pageSerialOverLan.searchTerminal')"
            class="terminal-action-btn"
            :class="{ active: showSearch }"
            @click="toggleSearch()"
          >
            <icon-search />
          </button>

          <!-- Clear Terminal -->
          <button 
            v-b-tooltip.hover.bottom 
            :title="$t('pageSerialOverLan.clearTerminal')"
            class="terminal-action-btn"
            :disabled="!term"
            @click="clearTerminal()"
          >
            <icon-clean />
          </button>

          <!-- Download Logs -->
          <button 
            v-b-tooltip.hover.bottom 
            :title="$t('pageSerialOverLan.downloadLogs')"
            class="terminal-action-btn"
            :disabled="!term"
            @click="downloadLogs()"
          >
            <icon-download />
          </button>

          <span class="terminal-header__divider"></span>

          <!-- Fullscreen Toggle -->
          <button 
            v-b-tooltip.hover.bottom 
            :title="isTerminalFullscreen ? $t('pageSerialOverLan.exitFullscreen') : $t('pageSerialOverLan.enterFullscreen')"
            class="terminal-action-btn"
            @click="toggleFullscreen()"
          >
            <icon-maximize v-if="!isTerminalFullscreen" />
            <icon-minimize v-else />
          </button>

          <!-- Open in New Tab -->
          <button 
            v-if="!isFullWindow && !isTerminalFullscreen" 
            v-b-tooltip.hover.bottom 
            :title="$t('pageSerialOverLan.openNewTab')"
            class="terminal-action-btn"
            @click="openConsoleWindow()"
          >
            <icon-launch />
          </button>
        </div>
      </div>

      <!-- Error Banner (slides in below header when needed) -->
      <transition name="search-slide">
        <div v-if="connectionError" class="terminal-error">
          <span>{{ connectionError }}</span>
          <span v-if="reconnectAttempt > 0" class="terminal-error__attempt">
            ({{ $t('pageSerialOverLan.reconnectAttempt', { attempt: reconnectAttempt }) }})
          </span>
        </div>
      </transition>

      <!-- Search Bar (slides in below header) -->
      <transition name="search-slide">
        <div v-if="showSearch" class="terminal-search">
          <div class="terminal-search__input-group">
            <icon-search class="terminal-search__icon" />
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              class="terminal-search__input"
              :placeholder="$t('pageSerialOverLan.searchPlaceholder')"
              @keyup.enter="findNext()"
              @keyup.esc="toggleSearch()"
            />
            <span v-if="searchResultInfo" class="terminal-search__results">
              {{ searchResultInfo }}
            </span>
          </div>
          <div class="terminal-search__actions">
            <button 
              class="terminal-search__btn"
              :disabled="!searchQuery"
              @click="findPrevious()"
            >
              <icon-chevron-up />
            </button>
            <button 
              class="terminal-search__btn"
              :disabled="!searchQuery"
              @click="findNext()"
            >
              <icon-chevron-down />
            </button>
            <button 
              class="terminal-search__btn terminal-search__btn--close"
              @click="toggleSearch()"
            >
              <icon-close />
            </button>
          </div>
        </div>
      </transition>

      <!-- Terminal Container -->
      <div 
        id="terminal" 
        ref="panel" 
        :class="terminalClass"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'bootstrap-vue-next';
import { AttachAddon } from 'xterm-addon-attach';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { Terminal } from 'xterm';
// @ts-expect-error — lodash has no bundled types; @types/lodash not installed
import { throttle } from 'lodash';
import IconLaunch from '@carbon/icons-vue/es/launch/20';
import IconDownload from '@carbon/icons-vue/es/download/20';
import IconSearch from '@carbon/icons-vue/es/search/20';
import IconClean from '@carbon/icons-vue/es/clean/20';
import IconMaximize from '@carbon/icons-vue/es/maximize/20';
import IconMinimize from '@carbon/icons-vue/es/minimize/20';
import IconChevronUp from '@carbon/icons-vue/es/chevron--up/16';
import IconChevronDown from '@carbon/icons-vue/es/chevron--down/16';
import IconClose from '@carbon/icons-vue/es/close/16';
import IconPower from '@carbon/icons-vue/es/power/20';
import IconBoot from '@carbon/icons-vue/es/boot/20';
import { useAuthStore } from '@/stores/auth';
import { useGlobalStore } from '@/stores/global';

// Window augmentation for pre-created WebSocket (index.html workaround)
declare global {
  interface Window {
    __solWebSocket: WebSocket | null;
    __solWebSocketReady: boolean;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Connection state enum mapping to WebSocket.readyState values (0-3) plus ERROR
const ConnectionState = {
  CONNECTING: 'connecting',  // 0
  OPEN: 'connected',         // 1
  CLOSING: 'closing',        // 2
  CLOSED: 'disconnected',    // 3
  ERROR: 'error',            // custom state
};

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

const enableCustomKeys = import.meta.env.VITE_ENABLE_CUSTOM_KEYS === 'true';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = defineProps({
  isFullWindow: {
    type: Boolean,
    default: true,
  },
});

// ---------------------------------------------------------------------------
// Composables
// ---------------------------------------------------------------------------

const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const globalStore = useGlobalStore();

// ---------------------------------------------------------------------------
// Template refs
// ---------------------------------------------------------------------------

const panel = ref<HTMLDivElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);

// ---------------------------------------------------------------------------
// Reactive state (used in template)
// ---------------------------------------------------------------------------

const connectionState = ref<string>(ConnectionState.CLOSED);
const connectionError = ref<string | null>(null);
const isTerminalFullscreen = ref(false);
const showSearch = ref(false);
const searchQuery = ref('');
const searchResultInfo = ref('');
const reconnectAttempt = ref(0);
const isReconnecting = ref(false);
const term = shallowRef<Terminal | null>(null);

// ---------------------------------------------------------------------------
// Non-reactive mutable state (internal only, not in template)
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null;
let fitAddon: FitAddon | null = null;
let searchAddon: SearchAddon | null = null;
let attachAddon: AttachAddon | null = null;
let terminalOpened = false;
let componentMounted = false;
let resizeConsoleWindow: ReturnType<typeof throttle> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Computed — Power / boot state (from Pinia store via Vue Query + SSE)
// ---------------------------------------------------------------------------

const powerState = computed(() => globalStore.PowerState ?? null);
const bootProgressState = computed(() => globalStore.BootProgressState ?? null);
const bootProgressOemState = computed(
  () => globalStore.BootProgressOemState ?? null,
);
const isBooting = computed(() => globalStore.IsBooting);

const bootProgressLabel = computed(() => {
  const state = bootProgressState.value;
  if (!state) return '';
  if (state === 'OEM' && bootProgressOemState.value) {
    return bootProgressOemState.value;
  }
  const translationKey = `pageSerialOverLan.bootProgressStates.${state}`;
  const translated = t(translationKey);
  if (translated === translationKey) {
    return state.replace(/([A-Z])/g, ' $1').trim();
  }
  return translated;
});

// ---------------------------------------------------------------------------
// Computed — Connection status
// ---------------------------------------------------------------------------

const connectionStateIcon = computed(() => {
  switch (connectionState.value) {
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
});

const connectionStatusText = computed(() => {
  if (isReconnecting.value) {
    return t('pageSerialOverLan.reconnecting');
  }
  switch (connectionState.value) {
    case ConnectionState.OPEN:
      return t('pageSerialOverLan.connected');
    case ConnectionState.CONNECTING:
      return t('pageSerialOverLan.connecting');
    case ConnectionState.ERROR:
      return t('pageSerialOverLan.connectionError');
    case ConnectionState.CLOSING:
      return t('pageSerialOverLan.disconnected');
    case ConnectionState.CLOSED:
    default:
      return t('pageSerialOverLan.disconnected');
  }
});

const connectionIndicatorClass = computed(() => {
  switch (connectionState.value) {
    case ConnectionState.OPEN:
      return 'connection-indicator--connected';
    case ConnectionState.CONNECTING:
    case ConnectionState.CLOSING:
      return 'connection-indicator--connecting';
    case ConnectionState.ERROR:
    case ConnectionState.CLOSED:
    default:
      return 'connection-indicator--disconnected';
  }
});

const connectionStatusGlowClass = computed(() => {
  switch (connectionState.value) {
    case ConnectionState.OPEN:
      return 'connection-glow connected';
    case ConnectionState.CONNECTING:
    case ConnectionState.CLOSING:
      return 'connection-glow transitioning';
    case ConnectionState.ERROR:
    case ConnectionState.CLOSED:
    default:
      return 'connection-glow disconnected';
  }
});

// ---------------------------------------------------------------------------
// Computed — Power / boot CSS classes
// ---------------------------------------------------------------------------

const isPowerTransitioning = computed(
  () => powerState.value === 'PoweringOn' || powerState.value === 'PoweringOff',
);

const powerStateGlowClass = computed(() => {
  switch (powerState.value) {
    case 'On':
      return 'power-state-glow power-on';
    case 'Off':
      return 'power-state-glow power-off';
    case 'PoweringOn':
    case 'PoweringOff':
      return 'power-state-glow power-transitioning';
    default:
      return '';
  }
});

const powerIconClass = computed(() => {
  if (powerState.value === 'On') return 'status-card__icon--success';
  if (powerState.value === 'Off') return 'status-card__icon--danger';
  if (isPowerTransitioning.value) return 'status-card__icon--warning';
  return '';
});

const powerValueClass = computed(() => {
  if (powerState.value === 'On') return 'status-value--success';
  if (powerState.value === 'Off') return 'status-value--danger';
  if (isPowerTransitioning.value) return 'status-value--warning';
  return '';
});

const bootIconClass = computed(() => {
  if (isBooting.value) return 'status-card__icon--info';
  if (bootProgressState.value === 'OSRunning') return 'status-card__icon--success';
  return '';
});

const powerStatusClass = computed(() => {
  if (powerState.value === 'On') return 'header-status--success';
  if (powerState.value === 'Off') return 'header-status--danger';
  if (isPowerTransitioning.value) return 'header-status--warning';
  return '';
});

// ---------------------------------------------------------------------------
// Computed — Layout
// ---------------------------------------------------------------------------

const containerClass = computed(() =>
  props.isFullWindow ? 'full-window-container' : 'terminal-container',
);

const terminalClass = computed(() => {
  const classes = [];
  if (props.isFullWindow) classes.push('full-window');
  if (isTerminalFullscreen.value) classes.push('terminal-fullscreen');
  return classes.join(' ');
});

// ---------------------------------------------------------------------------
// Toast helpers (replaces BVToastMixin)
// ---------------------------------------------------------------------------

function successToast(message: string) {
  toast.create({
    body: message,
    props: {
      title: t('global.status.success'),
      variant: 'success',
      isStatus: true,
      solid: false,
      interval: 10000,
    },
  });
}

function errorToast(message: string) {
  toast.create({
    body: message,
    props: {
      title: t('global.status.error'),
      variant: 'danger',
      isStatus: true,
      solid: false,
      interval: 0,
    },
  });
}

function infoToast(message: string) {
  toast.create({
    body: message,
    props: {
      title: t('global.status.informational'),
      variant: 'info',
      isStatus: true,
      solid: false,
      interval: 0,
    },
  });
}

// ---------------------------------------------------------------------------
// Keyboard / event handlers
// ---------------------------------------------------------------------------

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault();
    toggleSearch();
  }
  if (event.key === 'Escape') {
    if (showSearch.value) {
      toggleSearch();
    } else if (isTerminalFullscreen.value) {
      toggleFullscreen();
    }
  }
}

function handleFullscreenChange() {
  if (!document.fullscreenElement) {
    isTerminalFullscreen.value = false;
    nextTick(() => {
      if (fitAddon) fitAddon.fit();
    });
  }
}

function handleBeforeUnload() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('[SOL] Page unloading, closing WebSocket');
    ws.close(1000, 'Page unload');
  }
}

// ---------------------------------------------------------------------------
// Custom key handling
// ---------------------------------------------------------------------------

function customKeys(ev: KeyboardEvent) {
  const BACKSPACE = 8;
  let sequence = '';
  if (ev.type !== 'keydown' || ev.shiftKey || ev.altKey) {
    return true;
  }
  switch (ev.keyCode) {
    case BACKSPACE:
      sequence = '\b';
      break;
    default:
      return true;
  }
  ws?.send(sequence);
  return false;
}

function customKeyHandlers(ev: KeyboardEvent) {
  return customKeys(ev);
}

// ---------------------------------------------------------------------------
// WebSocket connection
// ---------------------------------------------------------------------------

function createWebSocketConnection() {
  connectionState.value = ConnectionState.CONNECTING;
  connectionError.value = null;

  // Check if a WebSocket was pre-created in index.html (before HTTP/2 kicked in)
  if (window.__solWebSocket && window.__solWebSocketReady) {
    ws = window.__solWebSocket;
    window.__solWebSocket = null;
    window.__solWebSocketReady = false;

    if (ws.readyState === WebSocket.OPEN) {
      connectionState.value = ConnectionState.OPEN;
    }
  } else {
    const token = authStore.token ?? '';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${window.location.host}/console/default?t=${Date.now()}`;

    try {
      ws = token ? new WebSocket(wsUrl, [token]) : new WebSocket(wsUrl);
    } catch (err) {
      console.error('WebSocket creation failed:', err);
      return;
    }
  }

  // WebSocket event handlers
  ws.onopen = () => {
    connectionState.value = ConnectionState.OPEN;
    connectionError.value = null;
    reconnectAttempt.value = 0;
    isReconnecting.value = false;

    if (term.value && terminalOpened && ws) {
      try {
        attachAddon = new AttachAddon(ws);
        term.value.loadAddon(attachAddon);
      } catch (e: unknown) {
        console.warn('Failed to attach WebSocket to terminal:', (e as Error).message);
      }
    }
  };

  ws.onclose = (event: CloseEvent) => {
    if (attachAddon) {
      try { attachAddon.dispose(); } catch (e) { /* ignore */ }
      attachAddon = null;
    }

    if (connectionState.value !== ConnectionState.ERROR) {
      connectionState.value = ConnectionState.CLOSED;
    }
    if (event.code !== 1000) {
      connectionError.value =
        event.reason || t('pageSerialOverLan.connectionClosedUnexpectedly');
      scheduleReconnect();
    }
  };

  ws.onerror = () => {
    connectionState.value = ConnectionState.ERROR;
    connectionError.value = t('pageSerialOverLan.failedToConnect');
    scheduleReconnect();
  };
}

// ---------------------------------------------------------------------------
// Terminal setup / teardown
// ---------------------------------------------------------------------------

function setupTerminal() {
  const SOL_THEME = {
    background: '#19273c',
    foreground: '#f0f0f0',
    cursor: 'rgba(83, 146, 255, .5)',
    cursorAccent: '#19273c',
    selection: 'rgba(83, 146, 255, 0.3)',
    black: '#4c566a',
    red: '#ff5f5f',
    green: '#76b900',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#7b88a1',
    brightRed: '#ff8080',
    brightGreen: '#a3be8c',
    brightYellow: '#ffd700',
    brightBlue: '#88c6ff',
    brightMagenta: '#d0a9e5',
    brightCyan: '#8be9fd',
    brightWhite: '#ffffff',
  };

  const terminal = new Terminal({
    fontSize: 15,
    fontFamily:
      'SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
    scrollback: 10000,
    cursorBlink: true,
    theme: SOL_THEME,
  });
  term.value = terminal;

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);

  if (panel.value) {
    terminal.open(panel.value);
    terminalOpened = true;
    fitAddon.fit();
    setTimeout(() => {
      if (fitAddon) fitAddon.fit();
    }, 100);
  }

  if (enableCustomKeys) {
    terminal.attachCustomKeyEventHandler(customKeyHandlers);
  }

  resizeConsoleWindow = throttle(() => {
    if (fitAddon) fitAddon.fit();
  }, 1000);
  window.addEventListener('resize', resizeConsoleWindow);

  // If WebSocket is already open, attach it now
  if (ws && ws.readyState === WebSocket.OPEN && term.value) {
    try {
      attachAddon = new AttachAddon(ws);
      term.value.loadAddon(attachAddon);
    } catch (e: unknown) {
      console.warn('Failed to attach WebSocket to terminal:', (e as Error).message);
    }
  }
}

function openTerminal() {
  if (!componentMounted) {
    console.log('[SOL] openTerminal: component not mounted, skipping');
    return;
  }
  createWebSocketConnection();
  setupTerminal();
}

function closeTerminal() {
  // 1. Neuter the WebSocket — strip our property-based handlers so they
  //    don't fire after the terminal is disposed.
  const socket = ws;
  ws = null;
  if (socket) {
    socket.onopen = null;
    socket.onclose = null;
    socket.onerror = null;
  }

  // 2. Dispose addons — this removes the AttachAddon's internal
  //    addEventListener('close') handler from the WebSocket, preventing
  //    the "Could not dispose an addon that has not been loaded" error
  //    when the async close event fires after terminal disposal.
  if (terminalOpened) {
    if (attachAddon) {
      try { attachAddon.dispose(); } catch (e) { /* ignore */ }
      attachAddon = null;
    }
    if (searchAddon) {
      try { searchAddon.dispose(); } catch (e) { /* ignore */ }
      searchAddon = null;
    }
    if (fitAddon) {
      try { fitAddon.dispose(); } catch (e) { /* ignore */ }
      fitAddon = null;
    }
    if (term.value) {
      try { term.value.dispose(); } catch (e) { /* ignore */ }
      term.value = null;
    }
    terminalOpened = false;
  } else {
    attachAddon = null;
    searchAddon = null;
    fitAddon = null;
    term.value = null;
  }

  // 3. Close the WebSocket last — all event listeners have been removed,
  //    so the async close event won't trigger any disposed-addon errors.
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    socket.close();
  }
  connectionState.value = ConnectionState.CLOSED;
}

// ---------------------------------------------------------------------------
// Console window
// ---------------------------------------------------------------------------

function openConsoleWindow() {
  window.open(
    '#/console/serial-over-lan-console',
    '_blank',
    'directories=no,titlebar=no,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=yes,width=600,height=550',
  );
}

// ---------------------------------------------------------------------------
// Reconnection with exponential backoff
// ---------------------------------------------------------------------------

function scheduleReconnect() {
  if (reconnectAttempt.value >= MAX_RECONNECT_ATTEMPTS) {
    isReconnecting.value = false;
    connectionError.value = t('pageSerialOverLan.maxReconnectAttemptsReached');
    return;
  }

  isReconnecting.value = true;
  reconnectAttempt.value++;

  const delay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempt.value - 1),
    MAX_RECONNECT_DELAY,
  );

  reconnectTimer = setTimeout(() => {
    if (isReconnecting.value && componentMounted) {
      closeTerminal();
      openTerminal();
    }
  }, delay);
}

function cancelReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  isReconnecting.value = false;
  reconnectAttempt.value = 0;
}

// ---------------------------------------------------------------------------
// Terminal actions
// ---------------------------------------------------------------------------

function downloadLogs() {
  if (!term.value) {
    errorToast(t('pageSerialOverLan.noLogsToDownload'));
    return;
  }

  try {
    const buffer = term.value.buffer.active;
    let content = '';

    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        content += line.translateToString(true) + '\n';
      }
    }

    if (!content.trim()) {
      infoToast(t('pageSerialOverLan.noLogsToDownload'));
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `sol-console-${timestamp}.log`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    successToast(t('pageSerialOverLan.logsDownloaded'));
  } catch (error) {
    console.error('Error downloading logs:', error);
    errorToast(t('pageSerialOverLan.downloadFailed'));
  }
}

function clearTerminal() {
  if (term.value) {
    term.value.clear();
    successToast(t('pageSerialOverLan.terminalCleared'));
  }
}

function toggleFullscreen() {
  isTerminalFullscreen.value = !isTerminalFullscreen.value;

  nextTick(() => {
    const addon = fitAddon;
    if (addon) {
      requestAnimationFrame(() => {
        addon.fit();
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function toggleSearch() {
  showSearch.value = !showSearch.value;
  if (showSearch.value) {
    nextTick(() => {
      if (searchInput.value) searchInput.value.focus();
    });
  } else {
    searchQuery.value = '';
    searchResultInfo.value = '';
    if (searchAddon) searchAddon.clearDecorations();
  }
}

function findNext() {
  if (!searchAddon || !searchQuery.value) return;
  const found = searchAddon.findNext(searchQuery.value, {
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  updateSearchInfo(found);
}

function findPrevious() {
  if (!searchAddon || !searchQuery.value) return;
  const found = searchAddon.findPrevious(searchQuery.value, {
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  updateSearchInfo(found);
}

function updateSearchInfo(found: boolean) {
  if (found) {
    searchResultInfo.value = t('pageSerialOverLan.matchFound');
  } else if (searchQuery.value) {
    searchResultInfo.value = t('pageSerialOverLan.noMatchFound');
  } else {
    searchResultInfo.value = '';
  }
}

// ---------------------------------------------------------------------------
// Watchers — debug logging for state changes driven by Pinia / SSE
// ---------------------------------------------------------------------------

watch(powerState, (newVal, oldVal) => {
  if (newVal !== oldVal) {
    console.log('[SOL] Power state:', oldVal, '->', newVal);
  }
});

watch(bootProgressState, (newVal, oldVal) => {
  if (newVal !== oldVal) {
    console.log('[SOL] Boot progress state:', oldVal, '->', newVal);
  }
});

// ---------------------------------------------------------------------------
// Lifecycle — created (runs during <script setup> evaluation)
// ---------------------------------------------------------------------------

// Power / boot state is provided by the Pinia globalStore (Vue Query +
// SSE-driven polling).  No local polling needed.
// Create WebSocket early, before HTTP/2 connection pooling kicks in.
createWebSocketConnection();

// ---------------------------------------------------------------------------
// Lifecycle — mounted
// ---------------------------------------------------------------------------

onMounted(() => {
  componentMounted = true;
  setupTerminal();
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  window.addEventListener('beforeunload', handleBeforeUnload);
});

// ---------------------------------------------------------------------------
// Lifecycle — beforeUnmount
// ---------------------------------------------------------------------------

onBeforeUnmount(() => {
  componentMounted = false;
  cancelReconnect();
  window.removeEventListener('resize', resizeConsoleWindow);
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  closeTerminal();
});
</script>

<style lang="scss">
@import 'xterm/css/xterm.css';
</style>

<style lang="scss" scoped>
// ============================================================================
// ENTERPRISE SOL CONSOLE STYLES
// A modern, polished interface for Serial Over LAN operations
// ============================================================================

// Color tokens
$color-success: #76b900; // NVIDIA green
$color-danger: #dc3545;
$color-warning: #fd7e14;
$color-info: #0d6efd;
$color-muted: #6c757d;
$color-dark: #1a1d21;
$color-darker: #0d1117;
$terminal-bg: #0d1117;
$terminal-header-bg: #161b22;
$card-bg: #f8f9fa;
$card-border: #e9ecef;

// ============================================================================
// HEADER STATUS INDICATORS - Compact inline status in header
// ============================================================================
.header-status {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border-radius: 4px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #8b949e;
  margin-left: 0.75rem;
  
  &__icon {
    width: 14px;
    height: 14px;
    
    &--spin {
      animation: spin 1.5s linear infinite;
    }
  }
  
  &__value {
    white-space: nowrap;
  }
  
  &--success {
    color: $color-success;
    
    .header-status__icon {
      filter: drop-shadow(0 0 4px rgba($color-success, 0.5));
    }
  }
  
  &--danger {
    color: $color-danger;
  }
  
  &--warning {
    color: $color-warning;
    animation: pulse-text 1s ease-in-out infinite;
  }
  
  &--info {
    color: $color-info;
  }
}

.header-warning {
  margin-left: 1rem;
  
  &__link {
    font-size: 0.8125rem;
    color: $color-warning;
    text-decoration: none;
    
    &:hover {
      text-decoration: underline;
    }
  }
}

// Error banner
.terminal-error {
  padding: 0.5rem 1rem;
  background: rgba($color-danger, 0.15);
  color: $color-danger;
  font-size: 0.8125rem;
  border-bottom: 1px solid rgba($color-danger, 0.3);
  
  &__attempt {
    color: rgba($color-danger, 0.7);
    margin-left: 0.5rem;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse-text {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

// ============================================================================
// TERMINAL PANEL - The main console container
// ============================================================================
.terminal-panel {
  background: $terminal-bg;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0; // Important for flex child to shrink properly
  
  &--fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
  }
}

// ============================================================================
// TERMINAL HEADER - Control bar above terminal
// ============================================================================
.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 1rem;
  background: $terminal-header-bg;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  &__left {
    display: flex;
    align-items: center;
  }
  
  &__right {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  &__divider {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.15);
    margin: 0 0.5rem;
  }
}

// Connection indicator pill
.connection-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8125rem;
  font-weight: 500;
  
  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  
  &__text {
    white-space: nowrap;
  }
  
  &--connected {
    background: rgba($color-success, 0.2);
    color: $color-success;
    
    .connection-indicator__dot {
      background: $color-success;
      box-shadow: 0 0 8px rgba($color-success, 0.6);
      animation: dot-pulse 2s ease-in-out infinite;
    }
  }
  
  &--connecting {
    background: rgba($color-warning, 0.2);
    color: $color-warning;
    
    .connection-indicator__dot {
      background: $color-warning;
      animation: dot-blink 1s ease-in-out infinite;
    }
  }
  
  &--disconnected {
    background: rgba($color-muted, 0.2);
    color: #adb5bd;
    
    .connection-indicator__dot {
      background: $color-muted;
    }
  }
}

// Terminal action buttons
.terminal-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #8b949e;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  
  &:active:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
  }
  
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  
  &.active {
    background: rgba($color-info, 0.2);
    color: $color-info;
  }
  
  svg {
    width: 18px;
    height: 18px;
  }
}

// ============================================================================
// TERMINAL SEARCH BAR
// ============================================================================
.terminal-search {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  &__input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    max-width: 400px;
  }
  
  &__icon {
    color: #6e7681;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
  }
  
  &__input {
    flex: 1;
    background: transparent;
    border: none;
    color: #e6edf3;
    font-size: 0.875rem;
    outline: none;
    
    &::placeholder {
      color: #6e7681;
    }
  }
  
  &__results {
    font-size: 0.75rem;
    color: #6e7681;
    white-space: nowrap;
  }
  
  &__actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  &__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    color: #8b949e;
    cursor: pointer;
    transition: all 0.15s ease;
    
    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.25);
    }
    
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    
    &--close {
      margin-left: 0.5rem;
    }
    
    svg {
      width: 14px;
      height: 14px;
    }
  }
}

// ============================================================================
// TERMINAL CONTAINER
// ============================================================================
#terminal {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  padding: 0.5rem;
  
  // xterm.js needs explicit dimensions
  .xterm {
    height: 100%;
  }
  
  .xterm-viewport {
    overflow-y: auto !important;
  }
  
  &.terminal-fullscreen {
    height: calc(100vh - 50px);
  }
}

// ============================================================================
// CONTAINER LAYOUTS
// ============================================================================
.full-window-container {
  width: 97%;
  margin: 1.5%;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0; // Allow flex item to shrink below content size
  overflow: hidden; // Prevent xterm content from expanding container
}

.terminal-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  min-height: 0; // Allow flex item to shrink below content size
  overflow: hidden; // Prevent xterm content from expanding container
}


// ============================================================================
// ANIMATIONS
// ============================================================================
@keyframes indicator-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.2);
  }
}

@keyframes dot-pulse {
  0%, 100% {
    box-shadow: 0 0 4px rgba($color-success, 0.4);
  }
  50% {
    box-shadow: 0 0 12px rgba($color-success, 0.8);
  }
}

@keyframes dot-blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

// Slide transitions
.slide-fade-enter-active,
.search-slide-enter-active {
  transition: all 0.2s ease-out;
}

.slide-fade-leave-active,
.search-slide-leave-active {
  transition: all 0.15s ease-in;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}

.search-slide-enter-from,
.search-slide-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

// ============================================================================
// LEGACY COMPATIBILITY (for power state etc if still used elsewhere)
// ============================================================================
.power-state-glow {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-weight: 600;
  
  &.power-on {
    color: $color-success;
  }
  
  &.power-off {
    color: $color-danger;
  }
  
  &.power-transitioning {
    color: $color-warning;
  }
}

.connection-glow {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.boot-progress-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  
  &.boot-none {
    background: rgba($color-muted, 0.1);
    color: $color-muted;
  }
  
  &.boot-in-progress {
    background: rgba($color-info, 0.1);
    color: $color-info;
    animation: pulse-boot 1.5s infinite;
  }
  
  &.boot-complete {
    background: rgba(25, 135, 84, 0.1);
    color: #198754;
  }
}

@keyframes pulse-boot {
  0%, 100% {
    box-shadow: 0 0 4px rgba(13, 110, 253, 0.3);
  }
  50% {
    box-shadow: 0 0 12px rgba(13, 110, 253, 0.5);
  }
}

</style>
