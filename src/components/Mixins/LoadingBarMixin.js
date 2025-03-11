export const loading = true;

const LoadingBarMixin = {
  data() {
    return {
      loading: false
    };
  },
  created() {
    // Ensure loading is initialized when the component is created
    this.loading = this.loading !== undefined ? this.loading : false;
  },
  methods: {
    progressLoader(percents) {
      this.$root.$emit('loader-start', percents);
      this.loading = true;
    },
    startLoader() {
      this.$root.$emit('loader-start', [0, 100]);
      this.loading = true;
    },
    endLoader() {
      this.$root.$emit('loader-end');
      this.loading = false;
    },
    hideLoader() {
      this.$root.$emit('loader-hide');
    },
  },
};

export default LoadingBarMixin;
