<template>
  <main>
    <div class="login-container">
      <div class="login-main">
        <div>
          <div class="login-brand mb-5">
            <img
              svg-inline
              width="90px"
              src="@/assets/images/nvidia-logo-login.svg"
              :alt="altLogo"
            />
          </div>
          <h1 v-if="customizableGuiName" class="h3 mb-5">
            {{ customizableGuiName }}
          </h1>
          <router-view class="login=form form-background" />
        </div>
      </div>
      <div v-if="showLoginAside" class="login-aside">
        <div class="login-aside__logo-brand">
          <!-- Add Secondary brand logo if needed -->
        </div>
        <div class="login-aside__logo-bmc">
          <img
            svg-inline
            height="60px"
            src="@/assets/images/built-on-openbmc-logo.svg"
            alt="Built on OpenBMC"
          />
        </div>
      </div>
    </div>
  </main>
</template>

<script>
export default {
  name: 'LoginLayout',
  data() {
    return {
      altLogo: process.env.VUE_APP_COMPANY_NAME || 'OpenBMC',
      customizableGuiName: process.env.VUE_APP_GUI_NAME || '',
      showLoginAside: process.env.VUE_APP_SHOW_LOGIN_ASIDE !== 'false',
    };
  },
};
</script>
