/**
 * RedfishLoggerStore - Vuex module for Redfish API logging
 * 
 * Manages:
 * - API logs storage (capped at MAX_LOG_ENTRIES)
 * - Logging enable/disable state
 * - Logger visibility state
 * - Request/response counts
 */

const MAX_LOG_ENTRIES = 500;

// Sensitive header keys to filter out for security
const SENSITIVE_HEADERS = [
  'authorization',
  'x-auth-token',
  'x-xsrf-token',
  'xsrf-token',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'csrf-token'
];

// Sensitive body fields to filter out (e.g., login credentials)
const SENSITIVE_BODY_FIELDS = [
  'Password',
  'password',
  'NewPassword',
  'newPassword',
  'OldPassword',
  'oldPassword',
  'UserName',
  'userName',
  'username',
  'Username'
];

// Filter out sensitive headers for security (log all if logSensitiveHeaders is true)
const filterSensitiveHeaders = (headers, logSensitive = false) => {
  if (!headers) return headers;
  if (logSensitive) return headers;
  
  const filtered = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      filtered[key] = '[FILTERED]';
    } else {
      filtered[key] = value;
    }
  }
  return filtered;
};

// Filter out sensitive body fields for security (log all if logSensitiveHeaders is true)
const filterSensitiveBody = (data, logSensitive = false) => {
  if (!data || typeof data !== 'object') return data;
  if (logSensitive) return data;
  
  const filtered = { ...data };
  for (const field of SENSITIVE_BODY_FIELDS) {
    if (field in filtered) {
      filtered[field] = '[FILTERED]';
    }
  }
  return filtered;
};

const RedfishLoggerStore = {
  namespaced: true,
  state: {
    // Feature enabled via env var - read only once at startup
    featureEnabled: import.meta.env.VITE_ENABLE_REDFISH_LOGGER === 'true',
    // Runtime logging state - user controlled
    loggingEnabled: false,
    // Logger panel visibility - user controlled
    loggerVisible: false,
    // Minimized state (visible but collapsed)
    loggerMinimized: false,
    // Log sensitive headers like auth tokens (default: false for security)
    logSensitiveHeaders: false,
    // API logs array
    apiLogs: [],
    // Counters
    requestCount: 0,
    responseCount: 0,
    // Request ID counter for correlation
    requestIdCounter: 0,
  },
  getters: {
    isFeatureEnabled: (state) => state.featureEnabled,
    isLoggingEnabled: (state) => state.loggingEnabled,
    isLoggerVisible: (state) => state.loggerVisible,
    isLoggerMinimized: (state) => state.loggerMinimized,
    logSensitiveHeaders: (state) => state.logSensitiveHeaders,
    apiLogs: (state) => state.apiLogs,
    requestCount: (state) => state.requestCount,
    responseCount: (state) => state.responseCount,
    // Check if logging should occur
    shouldLog: (state) => state.featureEnabled && state.loggingEnabled,
    // Grouped logs for display
    groupedLogs: (state) => {
      const groups = {};
      
      for (const log of state.apiLogs) {
        if (!log.id) continue;
        
        if (!groups[log.id]) {
          groups[log.id] = {
            id: log.id,
            request: null,
            response: null,
            timestamp: log.timestamp
          };
        }
        
        if (log.type === 'request') {
          groups[log.id].request = log;
          groups[log.id].timestamp = log.timestamp;
        } else if (log.type === 'response' || log.type === 'error') {
          groups[log.id].response = log;
        }
      }
      
      return Object.values(groups)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    },
  },
  mutations: {
    setLoggingEnabled(state, enabled) {
      state.loggingEnabled = enabled;
    },
    setLoggerVisible(state, visible) {
      state.loggerVisible = visible;
    },
    setLoggerMinimized(state, minimized) {
      state.loggerMinimized = minimized;
    },
    setLogSensitiveHeaders(state, log) {
      state.logSensitiveHeaders = log;
    },
    addLogEntry(state, logEntry) {
      // Filter headers based on logSensitiveHeaders setting
      if (logEntry.headers) {
        logEntry.headers = filterSensitiveHeaders(logEntry.headers, state.logSensitiveHeaders);
      }
      // Filter sensitive body fields (e.g., passwords)
      if (logEntry.data) {
        logEntry.data = filterSensitiveBody(logEntry.data, state.logSensitiveHeaders);
      }
      
      state.apiLogs.push(logEntry);
      
      // Trim logs to max entries
      if (state.apiLogs.length > MAX_LOG_ENTRIES) {
        state.apiLogs = state.apiLogs.slice(-MAX_LOG_ENTRIES);
      }
      
      // Update counters
      if (logEntry.type === 'request') {
        state.requestCount++;
      } else {
        state.responseCount++;
      }
    },
    clearLogs(state) {
      state.apiLogs = [];
      state.requestCount = 0;
      state.responseCount = 0;
    },
    incrementRequestIdCounter(state) {
      state.requestIdCounter++;
    },
    resetState(state) {
      state.loggingEnabled = false;
      state.loggerVisible = false;
      state.loggerMinimized = false;
      state.logSensitiveHeaders = false;
      state.apiLogs = [];
      state.requestCount = 0;
      state.responseCount = 0;
      state.requestIdCounter = 0;
    },
  },
  actions: {
    enableLogging({ commit, state }) {
      commit('setLoggingEnabled', true);
      // When enabling logging, also show the logger
      if (!state.loggerVisible) {
        commit('setLoggerVisible', true);
      }
    },
    disableLogging({ commit }) {
      commit('setLoggingEnabled', false);
      // When disabling logging, also hide the logger completely (reviewer fix #1)
      commit('setLoggerVisible', false);
    },
    toggleLogging({ dispatch, state }) {
      if (state.loggingEnabled) {
        dispatch('disableLogging');
      } else {
        dispatch('enableLogging');
      }
    },
    showLogger({ commit }) {
      commit('setLoggerVisible', true);
      commit('setLoggerMinimized', false);
    },
    hideLogger({ commit }) {
      commit('setLoggerVisible', false);
    },
    minimizeLogger({ commit }) {
      commit('setLoggerMinimized', true);
    },
    expandLogger({ commit }) {
      commit('setLoggerMinimized', false);
    },
    toggleMinimized({ commit, state }) {
      commit('setLoggerMinimized', !state.loggerMinimized);
    },
    toggleLogSensitiveHeaders({ commit, state }) {
      commit('setLogSensitiveHeaders', !state.logSensitiveHeaders);
    },
    // Generate unique request ID
    generateRequestId({ commit, state }) {
      commit('incrementRequestIdCounter');
      return `req-${Date.now()}-${state.requestIdCounter}`;
    },
    // Add a log entry (called from api.js interceptors)
    addLog({ commit, getters }, logEntry) {
      if (getters.shouldLog) {
        commit('addLogEntry', logEntry);
      }
    },
    clearAllLogs({ commit }) {
      commit('clearLogs');
    },
    // Reset on logout
    resetOnLogout({ commit }) {
      commit('resetState');
    },
  },
};

export default RedfishLoggerStore;
