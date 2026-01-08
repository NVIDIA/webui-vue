import eventBus from '@/eventBus';

export const loading = true;

const LoadingBarMixin = {
  data() {
    return {
      loading: false,
    };
  },
  created() {
    // Ensure loading is initialized when the component is created
    this.loading = this.loading !== undefined ? this.loading : false;
  },
  methods: {
    progressLoader(percents) {
      eventBus.$emit('loader-start', percents);
      this.loading = true;
    },
    startLoader() {
      eventBus.$emit('loader-start', [0, 100]);
      this.loading = true;
    },
    endLoader() {
      eventBus.$emit('loader-end');
      this.loading = false;
    },
    hideLoader() {
      eventBus.$emit('loader-hide');
    },
  },
};

export default LoadingBarMixin;
