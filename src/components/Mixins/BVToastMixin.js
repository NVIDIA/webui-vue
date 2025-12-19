import { h } from 'vue';
import StatusIcon from '../Global/StatusIcon';
import i18n from '@/i18n';
const BVToastMixin = {
  components: {
    StatusIcon,
  },
  data() {
    return {
      _redfishErrorDetails: {}
    };
  },
  created() {
    // Ensure _redfishErrorDetails is initialized when the component is created
    this._redfishErrorDetails = this._redfishErrorDetails || {};
  },
  methods: {
    $_BVToastMixin_createTitle(title, status) {
      const statusIcon = h(StatusIcon, { status });
      return h('strong', { class: 'toast-icon' }, [statusIcon, title]);
    },
    $_BVToastMixin_createBody(messageBody) {
      if (Array.isArray(messageBody)) {
        return messageBody.map((message) => h('p', { class: 'mb-0' }, message));
      } else {
        return [h('p', { class: 'mb-0' }, messageBody)];
      }
    },
    $_BVToastMixin_createTimestamp() {
      const timestamp = this.$filters.formatTime(new Date());
      return h('p', { class: 'mt-3 mb-0' }, timestamp);
    },
    $_BVToastMixin_createRefreshAction() {
      return h(
        'BLink',
        {
          class: 'd-inline-block mt-3',
          onClick: () => {
            this.$eventBus.emit('refresh-application');
          },
        },
        i18n.global.t('global.action.refresh'),
      );
    },
    $_BVToastMixin_initToast(body, title, variant) {
      // Use global toast plugin (works with Options API)
      // Extract text content from VNodes for display

      // Extract title text from VNode
      const titleText =
        typeof title === 'string'
          ? title
          : title?.children?.[1] || title?.children || '';

      // Extract body text from VNode array
      // Each VNode (paragraph) should be on its own line
      const bodyLines = Array.isArray(body)
        ? body.map((node) => {
            if (typeof node === 'string') return node;
            // Extract text from VNode children
            const text = node?.children || node?.props?.children || '';
            // Ensure timestamps and other paragraphs are on separate lines
            return text;
          })
        : [typeof body === 'string' ? body : body?.children || ''];

      // Join with newlines to ensure timestamps appear on their own line
      const bodyText = bodyLines.filter(Boolean).join('\n');

      // Show toast via global plugin
      if (this.$toast) {
        this.$toast.show({
          body: bodyText,
          props: {
            title: titleText,
            variant,
            isStatus: true,
            solid: false, // Use light backgrounds with dark text (not solid colors)
            // Success toasts auto-dismiss after 10s, others stay until closed
            interval: variant === 'success' ? 10000 : 0,
            // Note: Progress bar hidden via CSS in _toasts.scss (JS props to hide progress bar don't work as documented in Bootstrap Vue Next 0.40.8)
          },
        });
      } else {
        // Fallback: log to console
        /* eslint-disable no-console */
        console[variant === 'danger' ? 'error' : 'log'](
          `[toast:${variant}]`,
          bodyText,
        );
        /* eslint-enable no-console */
      }
    },
    successToast(
      message,
      {
        title: t = i18n.global.t('global.status.success'),
        timestamp,
        refreshAction,
      } = {},
    ) {
      const body = this.$_BVToastMixin_createBody(message);
      const title = this.$_BVToastMixin_createTitle(t, 'success');
      if (refreshAction) body.push(this.$_BVToastMixin_createRefreshAction());
      if (timestamp) {
        body.push(' '); // Extra newline for spacing above timestamp
        body.push(this.$_BVToastMixin_createTimestamp());
      }
      this.$_BVToastMixin_initToast(body, title, 'success');
    },
    errorToast(
      message,
      {
        title: t = i18n.global.t('global.status.error'),
        timestamp,
        refreshAction,
        redfishError,
      } = {},
    ) {
      let body;
      
      if (redfishError) {
        // Create unique ID for this error
        const errorId = 'error-' + Date.now();
        
        // Store error details for later use
        if (!this._redfishErrorDetails) {
          this._redfishErrorDetails = {};
        }
        this._redfishErrorDetails[errorId] = redfishError;
        
        // Create a simple error message with the view details option
        body = [
          h('p', { class: 'mb-0' }, message),
          h(
            'BLink',
            {
              class: 'error-details-link mt-2 d-inline-block',
              'data-error-id': errorId,
              onClick: (event) => {
                event.preventDefault();
                this.showErrorDetails(errorId);
              },
            },
            i18n.global.t('global.action.viewDetails'),
          ),
        ];
      } else {
        body = this.$_BVToastMixin_createBody(message);
      }
      
      const title = this.$_BVToastMixin_createTitle(t, 'danger');
      if (refreshAction) body.push(this.$_BVToastMixin_createRefreshAction());
      if (timestamp) {
        body.push(' '); // Extra newline for spacing above timestamp
        body.push(this.$_BVToastMixin_createTimestamp());
      }
      this.$_BVToastMixin_initToast(body, title, 'danger');
    },
    warningToast(
      message,
      {
        title: t = i18n.global.t('global.status.warning'),
        timestamp,
        refreshAction,
      } = {},
    ) {
      const body = this.$_BVToastMixin_createBody(message);
      const title = this.$_BVToastMixin_createTitle(t, 'warning');
      if (refreshAction) body.push(this.$_BVToastMixin_createRefreshAction());
      if (timestamp) {
        body.push(' '); // Extra newline for spacing above timestamp
        body.push(this.$_BVToastMixin_createTimestamp());
      }
      this.$_BVToastMixin_initToast(body, title, 'warning');
    },
    infoToast(
      message,
      {
        title: t = i18n.global.t('global.status.informational'),
        timestamp,
        refreshAction,
      } = {},
    ) {
      const body = this.$_BVToastMixin_createBody(message);
      const title = this.$_BVToastMixin_createTitle(t, 'info');
      if (refreshAction) body.push(this.$_BVToastMixin_createRefreshAction());
      if (timestamp) {
        body.push(' '); // Extra newline for spacing above timestamp
        body.push(this.$_BVToastMixin_createTimestamp());
      }
      this.$_BVToastMixin_initToast(body, title, 'info');
    },
    // Method to show error details in a modal
    showErrorDetails(errorId) {
      if (!this._redfishErrorDetails || !this._redfishErrorDetails[errorId]) {
        return;
      }
      
      const errorDetails = this._redfishErrorDetails[errorId];
      const formattedJson = JSON.stringify(errorDetails, null, 2);
      
      try {
        // If we have access to root's $bvModal, use it to show a message box
        if (this.$root && this.$root.$bvModal && this.$root.$bvModal.msgBoxOk) {
          // Create VNode for the pre element using h()
          const preNode = h('pre', {
            style: {
              margin: '0',
              whiteSpace: 'pre-wrap', 
              wordBreak: 'break-word'
            }
          }, formattedJson);
          
          // Use msgBoxOk with the VNode as content
          this.$root.$bvModal.msgBoxOk([preNode], {
            title: i18n.global.t('global.message.errorDetails'),
            size: 'lg',
            centered: true,
            headerBgVariant: 'danger',
            headerTextVariant: 'light',
            contentClass: 'p-0',
            okVariant: 'secondary',
            dialogClass: 'json-error-modal'
          });
        } else {
          // If $bvModal isn't available, fall back to alert
          alert(i18n.global.t('global.message.errorDetails') + ':\n\n' + formattedJson);
        }
      } catch (error) {
        console.error('Error showing error details:', error);
        // Fall back to alert
        alert(i18n.global.t('global.message.errorDetails') + ':\n\n' + formattedJson);
      }
    },
  },
};

export default BVToastMixin;
