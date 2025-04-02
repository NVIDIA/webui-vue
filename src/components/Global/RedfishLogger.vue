<template>
  <div v-if="isFeatureEnabled">
    <!-- Minimized bar -->
    <div v-if="isLoggerVisible && isLoggerMinimized" class="redfish-logger-minimized">
      <div class="minimized-content">
        <span class="minimized-title">{{ $t('pageRedfishLogger.title') }}</span>
        <span class="minimized-count">({{ apiLogs.length }} {{ $t('pageRedfishLogger.entries') }})</span>
      </div>
      <div class="minimized-actions">
        <button 
          type="button"
          class="action-button" 
          @click="expandLogger"
          :aria-label="$t('pageRedfishLogger.expand')"
          data-test-id="redfishLogger-button-expand"
        >
          <icon-maximize />
        </button>
        <button 
          type="button"
          class="action-button" 
          @click="hideLogger"
          :aria-label="$t('pageRedfishLogger.close')"
          data-test-id="redfishLogger-button-closeMinimized"
        >×</button>
      </div>
    </div>
    
    <!-- Full logger panel -->
    <div class="redfish-logger" v-if="isLoggerVisible && !isLoggerMinimized">
      <div class="redfish-logger-header">
        <div class="redfish-logger-title">
          <span>{{ $t('pageRedfishLogger.title') }}</span>
        </div>
        <div class="redfish-logger-actions">
          <button 
            type="button"
            class="action-button" 
            @click="startNewRequest"
            :aria-label="$t('pageRedfishLogger.newRequest')"
            data-test-id="redfishLogger-button-newRequest"
          >+</button>
          <label class="sensitive-toggle" data-test-id="redfishLogger-checkbox-logSensitive">
            <input 
              type="checkbox"
              :checked="logSensitiveHeaders"
              @change="toggleLogSensitiveHeaders"
              :aria-label="$t('pageRedfishLogger.logSensitiveHeadersLabel')"
            />
            <span>{{ $t('pageRedfishLogger.logSensitiveHeaders') }}</span>
          </label>
          <button 
            type="button"
            class="action-button" 
            @click="clearAllLogs"
            :aria-label="$t('pageRedfishLogger.clearLogs')"
            data-test-id="redfishLogger-button-clear"
          >{{ $t('pageRedfishLogger.clearLogs') }}</button>
          <button 
            type="button"
            class="action-button" 
            @click="minimizeLogger"
            :aria-label="$t('pageRedfishLogger.minimize')"
            data-test-id="redfishLogger-button-minimize"
          >
            <icon-minimize />
          </button>
          <button 
            type="button"
            class="action-button" 
            @click="hideLogger"
            :aria-label="$t('pageRedfishLogger.close')"
            data-test-id="redfishLogger-button-close"
          >×</button>
        </div>
      </div>
      <div v-if="isNewRequest" class="redfish-logger-new-request">
        <div class="new-request-form">
          <select 
            v-model="newRequest.method" 
            class="method-select" 
            :disabled="newRequestLoading"
            :aria-label="$t('pageRedfishLogger.httpMethod')"
            data-test-id="redfishLogger-select-method"
          >
            <option value="get">GET</option>
            <option value="post">POST</option>
            <option value="patch">PATCH</option>
            <option value="put">PUT</option>
            <option value="delete">DELETE</option>
          </select>
          <input 
            v-model="newRequest.url"
            class="url-input"
            :placeholder="$t('pageRedfishLogger.enterUrl')"
            @keyup.enter="sendRequest('new')"
            @keyup.esc="cancelNewRequest"
            :disabled="newRequestLoading"
            :aria-label="$t('pageRedfishLogger.requestUrl')"
            data-test-id="redfishLogger-input-url"
          >
          <div class="edit-actions">
            <button 
              type="button"
              class="action-button" 
              @click="sendRequest('new')" 
              :disabled="newRequestLoading"
              :aria-label="$t('pageRedfishLogger.send')"
              data-test-id="redfishLogger-button-send"
            >
              {{ newRequestLoading ? $t('pageRedfishLogger.sending') : $t('pageRedfishLogger.send') }}
            </button>
            <button 
              type="button"
              class="action-button" 
              @click="cancelNewRequest" 
              :disabled="newRequestLoading"
              :aria-label="$t('pageRedfishLogger.cancel')"
              data-test-id="redfishLogger-button-cancel"
            >{{ $t('pageRedfishLogger.cancel') }}</button>
          </div>
        </div>
        <!-- Body input for POST/PATCH/PUT -->
        <div class="new-request-body" v-if="newRequest.method !== 'get' && newRequest.method !== 'delete'">
          <textarea 
            v-model="newRequest.data"
            class="body-input"
            :placeholder="$t('pageRedfishLogger.requestBodyJson')"
            rows="3"
            :disabled="newRequestLoading"
            :aria-label="$t('pageRedfishLogger.requestBody')"
            data-test-id="redfishLogger-textarea-body"
          ></textarea>
        </div>
        <!-- Headers input -->
        <div class="new-request-headers">
          <label class="headers-label">{{ $t('pageRedfishLogger.customHeaders') }}</label>
          <textarea 
            v-model="newRequest.headers"
            class="headers-input"
            :placeholder="$t('pageRedfishLogger.headersPlaceholder')"
            rows="2"
            :disabled="newRequestLoading"
            :aria-label="$t('pageRedfishLogger.headers')"
            data-test-id="redfishLogger-textarea-headers"
          ></textarea>
        </div>
        <!-- Loading bar for new request -->
        <div v-if="newRequestLoading" class="redfish-logger-loading">
          <div class="loading-bar"></div>
        </div>
      </div>
      
      <div class="redfish-logger-content">
        <div v-if="groupedLogs.length === 0" class="redfish-logger-empty">
          {{ $t('pageRedfishLogger.noLogs') }}
        </div>
        <div v-else class="redfish-logger-logs">
          <div 
            v-for="group in groupedLogs" 
            :key="group.id"
            class="redfish-logger-group"
            :class="{'highlighted': highlightedId && group.id === highlightedId}"
            @click="highlightRequestFamily(group.id)"
          >
            <!-- Request -->
            <div 
              v-if="group.request"
              class="redfish-logger-log redfish-logger-request"
            >
              <div class="redfish-logger-log-header">
                <span class="log-type">{{ $t('pageRedfishLogger.request') }}</span>
                <span class="log-method">{{ group.request.method }}</span>
                <div class="log-url-container" @click.stop>
                  <template v-if="editingId !== group.id">
                    <span class="log-url">{{ group.request.url }}</span>
                    <button 
                      type="button"
                      class="action-button" 
                      @click="startEdit(group)"
                      :aria-label="$t('pageRedfishLogger.editRequest')"
                      data-test-id="redfishLogger-button-edit"
                    >{{ $t('pageRedfishLogger.edit') }}</button>
                  </template>
                  <template v-else>
                    <input 
                      class="url-input"
                      v-model="editingUrl"
                      @keyup.enter="sendRequest('edit', group.id)"
                      @keyup.esc="cancelEdit"
                      :disabled="isEditLoading(group.id)"
                      :aria-label="$t('pageRedfishLogger.editUrl')"
                      data-test-id="redfishLogger-input-editUrl"
                    >
                    <select 
                      v-model="editingMethod" 
                      class="method-select" 
                      :disabled="isEditLoading(group.id)"
                      :aria-label="$t('pageRedfishLogger.httpMethod')"
                      data-test-id="redfishLogger-select-editMethod"
                    >
                      <option value="get">GET</option>
                      <option value="post">POST</option>
                      <option value="patch">PATCH</option>
                      <option value="put">PUT</option>
                      <option value="delete">DELETE</option>
                    </select>
                    <div class="edit-actions">
                      <button 
                        type="button"
                        class="action-button" 
                        @click="sendRequest('edit', group.id)"
                        :disabled="isEditLoading(group.id)"
                        :aria-label="$t('pageRedfishLogger.send')"
                        data-test-id="redfishLogger-button-sendEdit"
                      >
                        {{ isEditLoading(group.id) ? $t('pageRedfishLogger.sending') : $t('pageRedfishLogger.send') }}
                      </button>
                      <button 
                        type="button"
                        class="action-button" 
                        @click="cancelEdit"
                        :disabled="isEditLoading(group.id)"
                        :aria-label="$t('pageRedfishLogger.cancel')"
                        data-test-id="redfishLogger-button-cancelEdit"
                      >
                        {{ $t('pageRedfishLogger.cancel') }}
                      </button>
                    </div>
                  </template>
                </div>
                <span class="log-time">{{ formatTime(group.request.timestamp) }}</span>
              </div>
              <div class="redfish-logger-tabs">
                <div 
                  class="redfish-logger-tab" 
                  :class="{ 'active': getActiveTab(group.id, 'request') === 'body' }"
                  @click.stop="setActiveTab(group.id, 'request', 'body')"
                >
                  {{ $t('pageRedfishLogger.body') }}
                </div>
                <div 
                  class="redfish-logger-tab" 
                  :class="{ 'active': getActiveTab(group.id, 'request') === 'headers' }"
                  @click.stop="setActiveTab(group.id, 'request', 'headers')"
                >
                  {{ $t('pageRedfishLogger.headers') }}
                </div>
              </div>
              <!-- Request Body - Editable when in edit mode -->
              <div class="redfish-logger-log-body" v-if="getActiveTab(group.id, 'request') === 'body'">
                <template v-if="editingId === group.id && editingMethod !== 'get' && editingMethod !== 'delete'">
                  <textarea 
                    v-model="editingBody"
                    class="edit-body-input"
                    rows="5"
                    :disabled="isEditLoading(group.id)"
                    :aria-label="$t('pageRedfishLogger.requestBody')"
                    data-test-id="redfishLogger-textarea-editBody"
                  ></textarea>
                </template>
                <template v-else>
                  <pre>{{ formatJson(group.request.data) }}</pre>
                </template>
              </div>
              <!-- Request Headers - Editable when in edit mode -->
              <div class="redfish-logger-log-body" v-if="getActiveTab(group.id, 'request') === 'headers'">
                <template v-if="editingId === group.id">
                  <textarea 
                    v-model="editingHeaders"
                    class="edit-body-input"
                    rows="5"
                    :disabled="isEditLoading(group.id)"
                    :placeholder="$t('pageRedfishLogger.headersPlaceholder')"
                    :aria-label="$t('pageRedfishLogger.headers')"
                    data-test-id="redfishLogger-textarea-editHeaders"
                  ></textarea>
                </template>
                <template v-else>
                  <pre>{{ formatHeaders(group.request.headers) }}</pre>
                </template>
              </div>
              <!-- Per-request loading bar -->
              <div v-if="isEditLoading(group.id)" class="redfish-logger-loading">
                <div class="loading-bar"></div>
              </div>
            </div>
            
            <!-- Response or Error -->
            <div 
              v-if="group.response && editingId !== group.id"
              class="redfish-logger-log"
              :class="{'redfish-logger-response': group.response.type === 'response', 'redfish-logger-error': group.response.type === 'error'}"
            >
              <div class="redfish-logger-log-header">
                <span class="log-type">{{ group.response.type.toUpperCase() }}</span>
                <span class="log-status">{{ group.response.status }}</span>
                <span class="log-time">{{ formatTime(group.response.timestamp) }}</span>
              </div>
              <div class="redfish-logger-tabs">
                <div 
                  class="redfish-logger-tab" 
                  :class="{ 'active': getActiveTab(group.id, 'response') === 'body' }"
                  @click.stop="setActiveTab(group.id, 'response', 'body')"
                >
                  {{ $t('pageRedfishLogger.body') }}
                </div>
                <div 
                  class="redfish-logger-tab" 
                  :class="{ 'active': getActiveTab(group.id, 'response') === 'headers' }"
                  @click.stop="setActiveTab(group.id, 'response', 'headers')"
                >
                  {{ $t('pageRedfishLogger.headers') }}
                </div>
              </div>
              <div class="redfish-logger-log-body" v-if="getActiveTab(group.id, 'response') === 'body'">
                <pre><response-json-tree 
                  :data="group.response.data" 
                  @url-click="handleUrlNavigation"
                /></pre>
              </div>
              <div class="redfish-logger-log-body" v-if="getActiveTab(group.id, 'response') === 'headers'">
                <pre>{{ formatHeaders(group.response.headers) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from '@/store/api';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import ResponseJsonTree from './ResponseJsonTree.vue';
import IconMinimize from '@carbon/icons-vue/es/minimize/16';
import IconMaximize from '@carbon/icons-vue/es/maximize/16';
import { mapGetters, mapActions } from 'vuex';

export default {
  name: 'RedfishLogger',
  components: {
    ResponseJsonTree,
    IconMinimize,
    IconMaximize,
  },
  mixins: [BVToastMixin],
  data() {
    return {
      highlightedId: null,
      editingId: null,
      editingUrl: '',
      editingMethod: 'get',
      editingBody: '{}',
      editingHeaders: '',
      isNewRequest: false,
      newRequest: {
        method: 'get',
        url: '',
        data: '{}',
        headers: ''
      },
      activeTabs: {},
      // Per-request loading states
      newRequestLoading: false,
      editLoadingIds: {}, // Track loading state per request ID
    };
  },
  computed: {
    ...mapGetters('redfishLogger', [
      'isFeatureEnabled',
      'isLoggingEnabled',
      'isLoggerVisible',
      'isLoggerMinimized',
      'logSensitiveHeaders',
      'apiLogs',
      'groupedLogs',
    ]),
  },
  watch: {
    isLoggerVisible(newVal) {
      // Use CSS class to control padding
      this.updateAppPadding(newVal && !this.isLoggerMinimized);
    },
    isLoggerMinimized(newVal) {
      // Update padding when minimized state changes
      this.updateAppPadding(this.isLoggerVisible && !newVal);
    },
    // Clean up activeTabs when logs are cleared
    apiLogs(newLogs) {
      if (newLogs.length === 0) {
        this.activeTabs = {};
        this.editLoadingIds = {};
      } else {
        // Clean up activeTabs for removed log IDs
        const logIds = new Set(newLogs.map(log => log.id));
        const tabKeys = Object.keys(this.activeTabs);
        tabKeys.forEach(key => {
          const logId = key.split('-')[0];
          if (!logIds.has(logId)) {
            delete this.activeTabs[key];
          }
        });
      }
    },
  },
  mounted() {
    // Initial padding setup if logger is visible
    if (this.isLoggerVisible && !this.isLoggerMinimized) {
      this.updateAppPadding(true);
    }
  },
  unmounted() {
    // Clean up CSS class in unmounted (not beforeUnmount) as per reviewer
    this.updateAppPadding(false);
  },
  methods: {
    ...mapActions('redfishLogger', [
      'showLogger',
      'hideLogger',
      'minimizeLogger',
      'expandLogger',
      'clearAllLogs',
      'toggleLogSensitiveHeaders',
    ]),
    updateAppPadding(shouldAddPadding) {
      const appElement = document.getElementById('app');
      if (appElement) {
        if (shouldAddPadding) {
          appElement.classList.add('redfish-logger-open');
        } else {
          appElement.classList.remove('redfish-logger-open');
        }
      }
    },
    highlightRequestFamily(id) {
      if (this.highlightedId === id) {
        this.highlightedId = null;
      } else {
        this.highlightedId = id;
      }
    },
    formatJson(data) {
      try {
        if (!data) return 'null';
        return JSON.stringify(data, null, 2);
      } catch (error) {
        return 'Error formatting JSON';
      }
    },
    formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    },
    startEdit(group) {
      this.editingId = group.id;
      this.editingUrl = group.request.url;
      this.editingMethod = group.request.method.toLowerCase();
      this.editingBody = this.formatJson(group.request.data);
      // Format headers for editing, excluding sensitive ones that are filtered
      this.editingHeaders = this.formatEditableHeaders(group.request.headers);
    },
    cancelEdit() {
      this.editingId = null;
      this.editingUrl = '';
      this.editingMethod = 'get';
      this.editingBody = '{}';
      this.editingHeaders = '';
    },
    formatEditableHeaders(headers) {
      if (!headers) return '';
      // Filter out common/auto-generated headers for editing
      const skipHeaders = ['accept', 'x-requested-with', 'content-type', 'authorization', 'x-auth-token'];
      const filtered = {};
      for (const [key, value] of Object.entries(headers)) {
        if (!skipHeaders.includes(key.toLowerCase()) && value !== '[FILTERED]') {
          filtered[key] = value;
        }
      }
      if (Object.keys(filtered).length === 0) return '';
      return JSON.stringify(filtered, null, 2);
    },
    parseCustomHeaders(headerString) {
      if (!headerString || !headerString.trim()) return {};
      try {
        return JSON.parse(headerString);
      } catch (e) {
        // Show warning toast with view details link to see the invalid JSON
        this.warningToast(this.$t('pageRedfishLogger.toast.invalidHeaders'), {
          detailsData: headerString,
        });
        return {};
      }
    },
    isEditLoading(id) {
      return this.editLoadingIds[id] === true;
    },
    // Combined send request function (reviewer suggestion)
    async sendRequest(type, groupId = null) {
      const isEdit = type === 'edit';
      const url = isEdit ? this.editingUrl : this.newRequest.url;
      const method = isEdit ? this.editingMethod : this.newRequest.method;
      const bodyStr = isEdit ? this.editingBody : this.newRequest.data;
      const headersStr = isEdit ? this.editingHeaders : this.newRequest.headers;
      
      if (!url.trim()) {
        return;
      }

      // Set per-request loading state
      if (isEdit) {
        this.editLoadingIds = { ...this.editLoadingIds, [groupId]: true };
      } else {
        this.newRequestLoading = true;
      }

      try {
        let data = null;
        if (method !== 'get' && method !== 'delete') {
          try {
            data = JSON.parse(bodyStr);
          } catch (e) {
            this.errorToast(this.$t('pageRedfishLogger.toast.invalidJson'));
            if (isEdit) {
              this.editLoadingIds = { ...this.editLoadingIds, [groupId]: false };
            } else {
              this.newRequestLoading = false;
            }
            return;
          }
        }
        
        const customHeaders = this.parseCustomHeaders(headersStr);
        const config = Object.keys(customHeaders).length > 0 ? { headers: customHeaders } : undefined;
        
        if (method === 'get' || method === 'delete') {
          await api[method](url, config);
        } else {
          await api[method](url, data, config);
        }
        
        // Reset state after successful request
        if (isEdit) {
          this.cancelEdit();
        } else {
          this.cancelNewRequest();
        }
        
        // Scroll to top to see the new request
        this.$nextTick(() => {
          const logContent = this.$el?.querySelector('.redfish-logger-content');
          if (logContent) {
            logContent.scrollTop = 0;
          }
        });
      } catch (error) {
        console.error('Failed to send request:', error);
        this.errorToast(this.$t('pageRedfishLogger.toast.requestFailed'));
      } finally {
        // Clear loading state
        if (isEdit) {
          this.editLoadingIds = { ...this.editLoadingIds, [groupId]: false };
        } else {
          this.newRequestLoading = false;
        }
      }
    },
    startNewRequest() {
      this.isNewRequest = true;
      this.newRequest = {
        method: 'get',
        url: '',
        data: '{}',
        headers: ''
      };
    },
    cancelNewRequest() {
      this.isNewRequest = false;
      this.newRequest = {
        method: 'get',
        url: '',
        data: '{}',
        headers: ''
      };
    },
    handleUrlNavigation(url) {
      this.newRequest.url = url;
      this.isNewRequest = true;
      this.$nextTick(() => {
        const form = this.$el?.querySelector('.redfish-logger-new-request');
        if (form) {
          form.scrollIntoView({ behavior: 'smooth' });
        }
      });
    },
    getActiveTab(id, type) {
      const key = `${id}-${type}`;
      return this.activeTabs[key] || 'body';
    },
    setActiveTab(id, type, tab) {
      const key = `${id}-${type}`;
      this.activeTabs = { ...this.activeTabs, [key]: tab };
    },
    formatHeaders(headers) {
      if (!headers) return 'No headers available';
      
      try {
        return JSON.stringify(headers, null, 2);
      } catch (error) {
        return 'Error formatting headers';
      }
    }
  }
};
</script>

<style scoped lang="scss">
@import '@/assets/styles/bmc/helpers/_variables.scss';

.redfish-logger {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #f5f5f5;
  // Docked widget style: thicker black border on top and left (reviewer enhancement)
  border-top: 3px solid #333;
  border-left: 3px solid #333;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  z-index: $zindex-fixed + 1;
  font-family: monospace;
  // Use dvh with vh fallback for mobile support
  max-height: 40vh;
  max-height: 40dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  
  @media (min-width: 992px) {
    left: $navigation-width;
  }
}

.redfish-logger-minimized {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #f0f0f0;
  // Docked widget style: thicker black border on top and left (reviewer enhancement)
  border-top: 3px solid #333;
  border-left: 3px solid #333;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  z-index: $zindex-fixed + 1;
  font-family: monospace;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  height: 32px;
  
  @media (min-width: 992px) {
    left: $navigation-width;
  }
  
  .minimized-content {
    display: flex;
    align-items: center;
    gap: 8px;
    
    .minimized-title {
      font-weight: bold;
      font-size: 12px;
    }
    
    .minimized-count {
      color: #666;
      font-size: 11px;
    }
  }
  
  .minimized-actions {
    display: flex;
    gap: 4px;
    
    .action-button {
      padding: 2px 6px;
      font-size: 12px;
    }
  }
}

.redfish-logger-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background-color: #f0f0f0;
  border-bottom: 1px solid #ccc;
}

.redfish-logger-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
}

.redfish-logger-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  
  .action-button {
    padding: 4px 8px;
    background: none;
    border: 1px solid #ccc;
    cursor: pointer;
    font-size: 12px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    gap: 4px;
    
    &:hover {
      background-color: #e0e0e0;
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    &.active {
      background-color: #ffc107;
      border-color: #e0a800;
    }
  }
  
  // Sensitive headers toggle checkbox (reviewer fix #2)
  .sensitive-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    cursor: pointer;
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 3px;
    background-color: #fff;
    
    &:hover {
      background-color: #f5f5f5;
    }
    
    input[type="checkbox"] {
      margin: 0;
      cursor: pointer;
    }
    
    span {
      white-space: nowrap;
    }
  }
}

.redfish-logger-content {
  flex: 1;
  overflow-y: auto;
  // Use dvh with vh fallback
  max-height: calc(40vh - 50px);
  max-height: calc(40dvh - 50px);
}

.redfish-logger-empty {
  padding: 16px;
  color: #666;
  text-align: center;
}

.redfish-logger-logs {
  padding: 8px;
}

.redfish-logger-group {
  margin-bottom: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  
  &.highlighted {
    border-color: #2196f3;
    box-shadow: 0 0 4px rgba(33, 150, 243, 0.3);
  }
}

.redfish-logger-log {
  padding: 8px;
  
  &.redfish-logger-request {
    background-color: #e3f2fd;
  }
  
  &.redfish-logger-response {
    background-color: #e8f5e9;
    border-top: 1px solid #e0e0e0;
  }
  
  &.redfish-logger-error {
    background-color: #ffebee;
    border-top: 1px solid #e0e0e0;
  }
}

.redfish-logger-log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  
  .log-type {
    font-weight: bold;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    background-color: #666;
    color: white;
  }
  
  .log-method {
    font-weight: bold;
    text-transform: uppercase;
    color: #1565c0;
  }
  
  .log-status {
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 3px;
    background-color: #4caf50;
    color: white;
  }
  
  .log-url-container {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 200px;
  }
  
  .log-url {
    word-break: break-all;
    color: #333;
  }
  
  .log-time {
    color: #666;
    font-size: 11px;
    margin-left: auto;
  }
}

.redfish-logger-tabs {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 4px;
}

.redfish-logger-tab {
  padding: 4px 8px;
  cursor: pointer;
  font-size: 11px;
  border-radius: 3px 3px 0 0;
  
  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  &.active {
    background-color: #fff;
    border: 1px solid #e0e0e0;
    border-bottom: none;
    margin-bottom: -1px;
  }
}

.redfish-logger-log-body {
  margin-top: 8px;
  
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 11px;
    background-color: rgba(255, 255, 255, 0.5);
    padding: 8px;
    border-radius: 3px;
    max-height: 200px;
    overflow-y: auto;
  }
}

.redfish-logger-new-request {
  padding: 8px;
  background-color: #fff3e0;
  border-bottom: 1px solid #ccc;
}

.new-request-form {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.new-request-body,
.new-request-headers {
  margin-top: 8px;
}

.headers-label {
  display: block;
  font-size: 11px;
  color: #666;
  margin-bottom: 4px;
}

.method-select {
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 12px;
  font-family: monospace;
}

.url-input {
  flex: 1;
  min-width: 200px;
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 12px;
  font-family: monospace;
}

.body-input,
.headers-input,
.edit-body-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 12px;
  font-family: monospace;
  resize: vertical;
}

.edit-actions {
  display: flex;
  gap: 4px;
}

.action-button {
  padding: 4px 8px;
  background: none;
  border: 1px solid #ccc;
  cursor: pointer;
  font-size: 12px;
  border-radius: 3px;
  
  &:hover {
    background-color: #e0e0e0;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.redfish-logger-loading {
  padding: 4px 8px;
  
  .loading-bar {
    height: 2px;
    background: linear-gradient(90deg, #2196f3 0%, #21cbf3 50%, #2196f3 100%);
    background-size: 200% 100%;
    animation: loading 1.5s ease-in-out infinite;
    border-radius: 1px;
  }
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

// Deep selector for ResponseJsonTree
:deep(.url-link) {
  color: #2196f3;
  text-decoration: underline;
  cursor: pointer;
  
  &:hover {
    color: #1565c0;
  }
}
</style>
