import { vi, describe, it, expect, beforeEach } from 'vitest';
import RedfishLoggerStore from '@/store/modules/RedfishLoggerStore';

describe('RedfishLoggerStore', () => {
  let state;

  // Create fresh state for each test
  beforeEach(() => {
    state = {
      featureEnabled: true,
      loggingEnabled: false,
      loggerVisible: false,
      loggerMinimized: false,
      logSensitiveHeaders: false,
      apiLogs: [],
      requestCount: 0,
      responseCount: 0,
      requestIdCounter: 0,
    };
  });

  describe('Getters', () => {
    it('isFeatureEnabled should return featureEnabled state', () => {
      expect(RedfishLoggerStore.getters.isFeatureEnabled(state)).toBe(true);
      state.featureEnabled = false;
      expect(RedfishLoggerStore.getters.isFeatureEnabled(state)).toBe(false);
    });

    it('isLoggingEnabled should return loggingEnabled state', () => {
      expect(RedfishLoggerStore.getters.isLoggingEnabled(state)).toBe(false);
      state.loggingEnabled = true;
      expect(RedfishLoggerStore.getters.isLoggingEnabled(state)).toBe(true);
    });

    it('isLoggerVisible should return loggerVisible state', () => {
      expect(RedfishLoggerStore.getters.isLoggerVisible(state)).toBe(false);
      state.loggerVisible = true;
      expect(RedfishLoggerStore.getters.isLoggerVisible(state)).toBe(true);
    });

    it('shouldLog should return true only when feature and logging are enabled', () => {
      // Both disabled
      state.featureEnabled = false;
      state.loggingEnabled = false;
      expect(RedfishLoggerStore.getters.shouldLog(state)).toBe(false);

      // Feature enabled, logging disabled
      state.featureEnabled = true;
      state.loggingEnabled = false;
      expect(RedfishLoggerStore.getters.shouldLog(state)).toBe(false);

      // Feature disabled, logging enabled
      state.featureEnabled = false;
      state.loggingEnabled = true;
      expect(RedfishLoggerStore.getters.shouldLog(state)).toBe(false);

      // Both enabled
      state.featureEnabled = true;
      state.loggingEnabled = true;
      expect(RedfishLoggerStore.getters.shouldLog(state)).toBe(true);
    });

    it('groupedLogs should group request and response by id', () => {
      state.apiLogs = [
        { id: 'req-1', type: 'request', url: '/api/test', timestamp: '2024-01-01T12:00:00Z' },
        { id: 'req-1', type: 'response', status: 200, timestamp: '2024-01-01T12:00:01Z' },
        { id: 'req-2', type: 'request', url: '/api/test2', timestamp: '2024-01-01T12:00:02Z' },
      ];

      const grouped = RedfishLoggerStore.getters.groupedLogs(state);
      
      expect(grouped).toHaveLength(2);
      // Should be sorted by timestamp descending (newest first)
      expect(grouped[0].id).toBe('req-2');
      expect(grouped[1].id).toBe('req-1');
      expect(grouped[1].request).toBeDefined();
      expect(grouped[1].response).toBeDefined();
      expect(grouped[0].response).toBeNull();
    });

    it('groupedLogs should handle error responses', () => {
      state.apiLogs = [
        { id: 'req-1', type: 'request', url: '/api/test', timestamp: '2024-01-01T12:00:00Z' },
        { id: 'req-1', type: 'error', status: 500, timestamp: '2024-01-01T12:00:01Z' },
      ];

      const grouped = RedfishLoggerStore.getters.groupedLogs(state);
      
      expect(grouped).toHaveLength(1);
      expect(grouped[0].response.type).toBe('error');
    });
  });

  describe('Mutations', () => {
    it('setLoggingEnabled should update loggingEnabled state', () => {
      RedfishLoggerStore.mutations.setLoggingEnabled(state, true);
      expect(state.loggingEnabled).toBe(true);
      RedfishLoggerStore.mutations.setLoggingEnabled(state, false);
      expect(state.loggingEnabled).toBe(false);
    });

    it('setLoggerVisible should update loggerVisible state', () => {
      RedfishLoggerStore.mutations.setLoggerVisible(state, true);
      expect(state.loggerVisible).toBe(true);
    });

    it('setLoggerMinimized should update loggerMinimized state', () => {
      RedfishLoggerStore.mutations.setLoggerMinimized(state, true);
      expect(state.loggerMinimized).toBe(true);
    });

    it('addLogEntry should add log entry and update counters', () => {
      const requestEntry = { type: 'request', id: 'req-1', url: '/api/test' };
      RedfishLoggerStore.mutations.addLogEntry(state, requestEntry);
      
      expect(state.apiLogs).toHaveLength(1);
      expect(state.requestCount).toBe(1);
      expect(state.responseCount).toBe(0);

      const responseEntry = { type: 'response', id: 'req-1', status: 200 };
      RedfishLoggerStore.mutations.addLogEntry(state, responseEntry);
      
      expect(state.apiLogs).toHaveLength(2);
      expect(state.requestCount).toBe(1);
      expect(state.responseCount).toBe(1);
    });

    it('addLogEntry should trim logs when exceeding max entries', () => {
      // Add 501 entries (more than MAX_LOG_ENTRIES = 500)
      for (let i = 0; i < 501; i++) {
        RedfishLoggerStore.mutations.addLogEntry(state, {
          type: 'request',
          id: `req-${i}`,
          url: `/api/test${i}`,
        });
      }
      
      expect(state.apiLogs.length).toBe(500);
      // First entry should be trimmed (oldest removed)
      expect(state.apiLogs[0].id).toBe('req-1');
      expect(state.apiLogs[499].id).toBe('req-500');
    });

    it('addLogEntry should filter sensitive headers', () => {
      const entry = {
        type: 'request',
        id: 'req-1',
        headers: {
          'authorization': 'Bearer secret-token',
          'content-type': 'application/json',
          'x-auth-token': 'another-secret',
        },
      };
      
      RedfishLoggerStore.mutations.addLogEntry(state, entry);
      
      expect(state.apiLogs[0].headers.authorization).toBe('[FILTERED]');
      expect(state.apiLogs[0].headers['x-auth-token']).toBe('[FILTERED]');
      expect(state.apiLogs[0].headers['content-type']).toBe('application/json');
    });

    it('addLogEntry should filter sensitive body fields', () => {
      const entry = {
        type: 'request',
        id: 'req-1',
        data: {
          UserName: 'admin',
          Password: 'secret123',
          SomeOtherField: 'visible',
        },
      };
      
      RedfishLoggerStore.mutations.addLogEntry(state, entry);
      
      expect(state.apiLogs[0].data.UserName).toBe('[FILTERED]');
      expect(state.apiLogs[0].data.Password).toBe('[FILTERED]');
      expect(state.apiLogs[0].data.SomeOtherField).toBe('visible');
    });

    it('addLogEntry should NOT filter when logSensitiveHeaders is true', () => {
      state.logSensitiveHeaders = true;
      
      const entry = {
        type: 'request',
        id: 'req-1',
        headers: {
          'authorization': 'Bearer secret-token',
        },
        data: {
          Password: 'secret123',
        },
      };
      
      RedfishLoggerStore.mutations.addLogEntry(state, entry);
      
      expect(state.apiLogs[0].headers.authorization).toBe('Bearer secret-token');
      expect(state.apiLogs[0].data.Password).toBe('secret123');
    });

    it('clearLogs should reset logs and counters', () => {
      state.apiLogs = [{ id: 'req-1' }, { id: 'req-2' }];
      state.requestCount = 5;
      state.responseCount = 5;
      
      RedfishLoggerStore.mutations.clearLogs(state);
      
      expect(state.apiLogs).toHaveLength(0);
      expect(state.requestCount).toBe(0);
      expect(state.responseCount).toBe(0);
    });

    it('incrementRequestIdCounter should increment counter', () => {
      expect(state.requestIdCounter).toBe(0);
      RedfishLoggerStore.mutations.incrementRequestIdCounter(state);
      expect(state.requestIdCounter).toBe(1);
      RedfishLoggerStore.mutations.incrementRequestIdCounter(state);
      expect(state.requestIdCounter).toBe(2);
    });

    it('resetState should reset all state to defaults', () => {
      // Set non-default values
      state.loggingEnabled = true;
      state.loggerVisible = true;
      state.loggerMinimized = true;
      state.logSensitiveHeaders = true;
      state.apiLogs = [{ id: 'req-1' }];
      state.requestCount = 10;
      state.responseCount = 10;
      state.requestIdCounter = 50;
      
      RedfishLoggerStore.mutations.resetState(state);
      
      expect(state.loggingEnabled).toBe(false);
      expect(state.loggerVisible).toBe(false);
      expect(state.loggerMinimized).toBe(false);
      expect(state.logSensitiveHeaders).toBe(false);
      expect(state.apiLogs).toHaveLength(0);
      expect(state.requestCount).toBe(0);
      expect(state.responseCount).toBe(0);
      expect(state.requestIdCounter).toBe(0);
    });
  });

  describe('Actions', () => {
    let commit;
    let dispatch;

    beforeEach(() => {
      commit = vi.fn();
      dispatch = vi.fn();
    });

    it('enableLogging should commit setLoggingEnabled and show logger', () => {
      const context = { commit, state: { loggerVisible: false } };
      RedfishLoggerStore.actions.enableLogging(context);
      
      expect(commit).toHaveBeenCalledWith('setLoggingEnabled', true);
      expect(commit).toHaveBeenCalledWith('setLoggerVisible', true);
    });

    it('enableLogging should not show logger if already visible', () => {
      const context = { commit, state: { loggerVisible: true } };
      RedfishLoggerStore.actions.enableLogging(context);
      
      expect(commit).toHaveBeenCalledWith('setLoggingEnabled', true);
      expect(commit).not.toHaveBeenCalledWith('setLoggerVisible', true);
    });

    it('disableLogging should commit setLoggingEnabled and hide logger', () => {
      RedfishLoggerStore.actions.disableLogging({ commit });
      
      expect(commit).toHaveBeenCalledWith('setLoggingEnabled', false);
      expect(commit).toHaveBeenCalledWith('setLoggerVisible', false);
    });

    it('toggleLogging should enable when disabled', () => {
      const context = { dispatch, state: { loggingEnabled: false } };
      RedfishLoggerStore.actions.toggleLogging(context);
      
      expect(dispatch).toHaveBeenCalledWith('enableLogging');
    });

    it('toggleLogging should disable when enabled', () => {
      const context = { dispatch, state: { loggingEnabled: true } };
      RedfishLoggerStore.actions.toggleLogging(context);
      
      expect(dispatch).toHaveBeenCalledWith('disableLogging');
    });

    it('showLogger should commit setLoggerVisible and expandLogger', () => {
      RedfishLoggerStore.actions.showLogger({ commit });
      
      expect(commit).toHaveBeenCalledWith('setLoggerVisible', true);
      expect(commit).toHaveBeenCalledWith('setLoggerMinimized', false);
    });

    it('hideLogger should commit setLoggerVisible false', () => {
      RedfishLoggerStore.actions.hideLogger({ commit });
      
      expect(commit).toHaveBeenCalledWith('setLoggerVisible', false);
    });

    it('minimizeLogger should commit setLoggerMinimized true', () => {
      RedfishLoggerStore.actions.minimizeLogger({ commit });
      
      expect(commit).toHaveBeenCalledWith('setLoggerMinimized', true);
    });

    it('expandLogger should commit setLoggerMinimized false', () => {
      RedfishLoggerStore.actions.expandLogger({ commit });
      
      expect(commit).toHaveBeenCalledWith('setLoggerMinimized', false);
    });

    it('toggleMinimized should toggle minimized state', () => {
      RedfishLoggerStore.actions.toggleMinimized({ commit, state: { loggerMinimized: false } });
      expect(commit).toHaveBeenCalledWith('setLoggerMinimized', true);

      RedfishLoggerStore.actions.toggleMinimized({ commit, state: { loggerMinimized: true } });
      expect(commit).toHaveBeenCalledWith('setLoggerMinimized', false);
    });

    it('clearAllLogs should commit clearLogs', () => {
      RedfishLoggerStore.actions.clearAllLogs({ commit });
      expect(commit).toHaveBeenCalledWith('clearLogs');
    });

    it('resetOnLogout should commit resetState', () => {
      RedfishLoggerStore.actions.resetOnLogout({ commit });
      expect(commit).toHaveBeenCalledWith('resetState');
    });

    it('addLog should commit addLogEntry when shouldLog is true', () => {
      const getters = { shouldLog: true };
      const logEntry = { type: 'request', id: 'req-1' };
      
      RedfishLoggerStore.actions.addLog({ commit, getters }, logEntry);
      
      expect(commit).toHaveBeenCalledWith('addLogEntry', logEntry);
    });

    it('addLog should not commit addLogEntry when shouldLog is false', () => {
      const getters = { shouldLog: false };
      const logEntry = { type: 'request', id: 'req-1' };
      
      RedfishLoggerStore.actions.addLog({ commit, getters }, logEntry);
      
      expect(commit).not.toHaveBeenCalled();
    });
  });
});
