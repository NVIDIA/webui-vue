<template>
  <li class="nav-item">
    <BDropdown
      id="app-header-user"
      variant="link"
      end
      data-test-id="appHeader-container-user"
    >
      <template #button-content>
        <IconAvatar :title="t('appHeader.titleProfile')" :aria-hidden="true" />
        <span class="responsive-text">{{ UserName }}</span>
      </template>
      <BDropdownHeader>
        {{ UserName }}
        <span v-if="UserRole" class="text-muted small d-block">
          {{ UserRole }}
        </span>
      </BDropdownHeader>
      <BDropdownItem
        to="/profile-settings"
        data-test-id="appHeader-link-profile"
      >
        {{ t('appHeader.profileSettings') }}
      </BDropdownItem>
      <BDropdownItem
        data-test-id="appHeader-link-logout"
        @click="onLogout"
      >
        {{ t('appHeader.logOut') }}
      </BDropdownItem>
    </BDropdown>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { BDropdown, BDropdownHeader, BDropdownItem } from 'bootstrap-vue-next';

import IconAvatar from '@carbon/icons-vue/es/user--avatar/20';

import { useAuthStore } from '@/stores/auth';
import { useGetAccountServiceAccountById } from '@/api/endpoints/redfish.gen';

const { t } = useI18n();
const authStore = useAuthStore();

// Get UserName from Session
const UserName = computed(() => authStore.UserName || '');

// Fetch account details to get RoleId
const { data: Account } = useGetAccountServiceAccountById(UserName, {
  query: {
    enabled: computed(() => !!UserName.value),
    retry: false,
  },
});

// Get RoleId from Account (more reliable than Session.Roles)
const UserRole = computed(() => Account.value?.RoleId || '');

/**
 * Handle logout
 */
async function onLogout() {
  await authStore.logout();
}
</script>

<style scoped>
.responsive-text {
  @media (max-width: 575.98px) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
</style>
