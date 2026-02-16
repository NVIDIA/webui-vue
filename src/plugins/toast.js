import { useModal, useToast } from 'bootstrap-vue-next';

// Global toast plugin for Options API components
// Bootstrap Vue Next's useToast is a composable that needs setup() context
// This plugin makes it accessible globally via app.config.globalProperties

let toastController = null;
let modalController = null;
let toastIdCounter = 0;
const toastInstances = new Map();

export const ToastPlugin = {
  install(app) {
    // Initialize toast controller in the app context
    // This will be called once during app setup
    app.mixin({
      beforeCreate() {
        // Only initialize once at the root
        if ((!toastController || !modalController) && this === this.$root) {
          try {
            toastController = toastController || useToast();
            modalController = modalController || useModal();
          } catch (e) {
            console.warn('Failed to initialize toast controller:', e);
          }
        }
      },
    });

    // Provide global toast methods
    app.config.globalProperties.$toast = {
      show(options) {
        if (toastController?.create) {
          const id = options?.id || `toast-${Date.now()}-${toastIdCounter++}`;
          const cleanProps = { ...(options?.props || {}) };
          // Ensure id is controlled by top-level to align with useToast() controller key
          if ('id' in cleanProps) delete cleanProps.id;

          const promise = toastController.create({ ...options, id, props: cleanProps });
          toastInstances.set(id, promise);
          promise.finally(() => {
            toastInstances.delete(id);
          });
          return id;
        } else {
          console.warn('Toast controller not available:', options);
          return undefined;
        }
      },
      info(body, options = {}) {
        this.show({
          ...options,
          body,
          props: {
            variant: 'info',
            isStatus: true,
            ...options.props,
          },
        });
      },
      success(body, options = {}) {
        this.show({
          ...options,
          body,
          props: {
            variant: 'success',
            isStatus: true,
            interval: 10000,
            // Note: Progress bar hidden via CSS in _toasts.scss (JS props don't work as documented in Bootstrap Vue Next 0.40.8)
            ...options.props,
          },
        });
      },
      warning(body, options = {}) {
        this.show({
          ...options,
          body,
          props: {
            variant: 'warning',
            isStatus: true,
            ...options.props,
          },
        });
      },
      danger(body, options = {}) {
        this.show({
          ...options,
          body,
          props: {
            variant: 'danger',
            isStatus: true,
            ...options.props,
          },
        });
      },
      hideAll(trigger = 'programmatic') {
        for (const [id, promise] of toastInstances) {
          try {
            promise?.hide?.(trigger);
          } catch (e) {
            console.warn('Failed to hide toast:', id, e);
          }
        }
        toastInstances.clear();
      },
    };

    // Backward-compatible alias for legacy code paths that still call $bvToast.hide(id)
    app.config.globalProperties.$bvToast = {
      hide(id, trigger = 'programmatic') {
        if (!id) return;
        const promise = toastInstances.get(id);
        if (promise?.hide) {
          promise.hide(trigger);
          return;
        }
        // Fallback: attempt to locate the toast in the orchestrator store
        try {
          const entry = toastController?.store?.value?.find(
            (el) => el?._self === id || el?.id === id,
          );
          entry?.promise?.value?.hide?.(trigger);
        } catch (e) {
          console.warn('Failed to hide toast:', id, e);
        }
      },
    };

    // Backward-compatible alias for legacy bootstrap-vue modal API
    app.config.globalProperties.$bvModal = {
      show(id) {
        try {
          modalController?.show?.(id);
        } catch (e) {
          console.warn('Failed to show modal:', id, e);
        }
      },
      hide(id, trigger = 'programmatic') {
        try {
          modalController?.hide?.(trigger, id);
        } catch (e) {
          console.warn('Failed to hide modal:', id, e);
        }
      },
      hideAll(trigger = 'programmatic') {
        try {
          modalController?.hideAll?.(trigger);
        } catch (e) {
          console.warn('Failed to hide all modals:', e);
        }
      },
      msgBoxConfirm(message, options = {}) {
        // Map legacy msgBoxConfirm to the global $confirm shim
        if (typeof app.config.globalProperties.$confirm === 'function') {
          return app.config.globalProperties.$confirm({ message, ...options });
        }
        return Promise.resolve(window.confirm(message));
      },
      msgBoxOk(message) {
        window.alert(typeof message === 'string' ? message : String(message));
        return Promise.resolve(true);
      },
    };
  },
};
