<template>
  <main class="login-layout">
    <div class="login-container">
      <div class="login-main">
        <div class="login-panel">
          <div class="login-brand">
            <login-company-logo width="90px" :aria-label="altLogo" />
          </div>
          <h1 v-if="customizableGuiName" class="h3 login-title">
            {{ customizableGuiName }}
          </h1>
          <router-view class="login-form form-background" />
        </div>
      </div>
      <div v-if="showLoginAside" class="login-aside">
        <div class="login-aside__logo-brand">
          <!-- Add Secondary brand logo if needed -->
        </div>
        <div class="login-aside__logo-bmc">
          <built-on-openbmc-logo
            style="width: auto; height: 60px"
            aria-label="Built on OpenBMC"
          />
        </div>
      </div>
    </div>
  </main>
</template>

<script>
import LoginCompanyLogo from '@/assets/images/nvidia-logo-login.svg?component';
import BuiltOnOpenbmcLogo from '@/assets/images/built-on-openbmc-logo.svg?component';

export default {
  name: 'LoginLayout',
  components: {
    LoginCompanyLogo,
    BuiltOnOpenbmcLogo,
  },
  data() {
    return {
      altLogo: import.meta.env.VITE_COMPANY_NAME || 'OpenBMC',
      customizableGuiName: import.meta.env.VITE_GUI_NAME || '',
      showLoginAside: import.meta.env.VITE_SHOW_LOGIN_ASIDE !== 'false',
    };
  },
  mounted() {
    document.documentElement.classList.add('login-page');
  },
  beforeUnmount() {
    document.documentElement.classList.remove('login-page');
  },
};
</script>
