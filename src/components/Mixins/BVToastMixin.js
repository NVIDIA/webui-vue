import StatusIcon from '../Global/StatusIcon';
import Vue from 'vue';
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
      const statusIcon = this.$createElement('StatusIcon', {
        props: { status },
      });
      const titleWithIcon = this.$createElement(
        'strong',
        { class: 'toast-icon' },
        [statusIcon, title],
      );
      return titleWithIcon;
    },
    $_BVToastMixin_createBody(messageBody) {
      if (Array.isArray(messageBody)) {
        return messageBody.map((message) =>
          this.$createElement('p', { class: 'mb-0' }, message),
        );
      } else {
        return [this.$createElement('p', { class: 'mb-0' }, messageBody)];
      }
    },
    $_BVToastMixin_createTimestamp() {
      const timestamp = this.$options.filters.formatTime(new Date());
      return this.$createElement('p', { class: 'mt-3 mb-0' }, timestamp);
    },
    $_BVToastMixin_createRefreshAction() {
      return this.$createElement(
        'BLink',
        {
          class: 'd-inline-block mt-3',
          on: {
            click: () => {
              this.$root.$emit('refresh-application');
            },
          },
        },
        this.$t('global.action.refresh'),
      );
    },
    $_BVToastMixin_initToast(body, title, variant) {
      this.$root.$bvToast.toast(body, {
        title,
        variant,
        autoHideDelay: 10000, //auto hide in milliseconds
        noAutoHide: variant !== 'success',
        isStatus: true,
        solid: true,
      });
    },
    successToast(
      message,
      {
        title: t = this.$t('global.status.success'),
        timestamp,
        refreshAction,
      } = {},
    ) {
      const body = this.$_BVToastMixin_createBody(message);
      const title = this.$_BVToastMixin_createTitle(t, 'success');
      if (refreshAction) body.push(this.$_BVToastMixin_createRefreshAction());
      if (timestamp) body.push(this.$_BVToastMixin_createTimestamp());
      this.$_BVToastMixin_initToast(body, title, 'success');
    },
    errorToast(
      message,
      {
        title: t = this.$t('global.status.error'),
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
        Vue.set(this._redfishErrorDetails, errorId, redfishError);
        
        // Create a simple error message with the view details option
        body = [
          this.$createElement('p', { class: 'mb-0' }, message),
          this.$createElement('b-link', {
            class: 'error-details-link mt-2 d-inline-block',
            attrs: { 'data-error-id': errorId },
            on: {
              click: (event) => {
                event.preventDefault();
                this.showErrorDetails(errorId);
              }
            }
          }, this.$t('global.action.viewDetails'))
        ];
      } else {
        body = this.$_BVToastMixin_createBody(message);
      }
      
      const title = this.$_BVToastMixin_createTitle(t, 'danger');
      if (refreshAction) body.push(this.$_BVToastMixin_createRefreshAction());
      if (timestamp) body.push(this.$_BVToastMixin_createTimestamp());
      this.$_BVToastMixin_initToast(body, title, 'danger');
    },
    warningToast(
      message,
      {
        title: t = this.$t('global.status.warning'),
        timestamp,
        refreshAction,
      } = {},
    ) {
      const body = this.$_BVToastMixin_createBody(message);
      const title = this.$_BVToastMixin_createTitle(t, 'warning');
      if (refreshAction) body.push(this.$_BVToastMixin_createRefreshAction());
      if (timestamp) body.push(this.$_BVToastMixin_createTimestamp());
      this.$_BVToastMixin_initToast(body, title, 'warning');
    },
    infoToast(
      message,
      {
        title: t = this.$t('global.status.informational'),
        timestamp,
        refreshAction,
      } = {},
    ) {
      const body = this.$_BVToastMixin_createBody(message);
      const title = this.$_BVToastMixin_createTitle(t, 'info');
      if (refreshAction) body.push(this.$_BVToastMixin_createRefreshAction());
      if (timestamp) body.push(this.$_BVToastMixin_createTimestamp());
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
          // Create VNode for the pre element using createElement
          const preNode = this.$createElement('pre', {
            style: {
              margin: '0',
              whiteSpace: 'pre-wrap', 
              wordBreak: 'break-word'
            }
          }, formattedJson);
          
          // Use msgBoxOk with the VNode as content
          this.$root.$bvModal.msgBoxOk([preNode], {
            title: i18n.t('global.message.errorDetails'),
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
          alert(i18n.t('global.message.errorDetails') + ':\n\n' + formattedJson);
        }
      } catch (error) {
        console.error('Error showing error details:', error);
        // Fall back to alert
        alert(i18n.t('global.message.errorDetails') + ':\n\n' + formattedJson);
      }
    },
  },
};

export default BVToastMixin;
