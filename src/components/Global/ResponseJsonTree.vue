<template>
  <span class="json-tree">
    <template v-if="data === null">null</template>
    <template v-else-if="typeof data === 'boolean'">{{ data }}</template>
    <template v-else-if="typeof data === 'number'">{{ data }}</template>
    <template v-else-if="typeof data === 'string'">
      <template v-if="isClickableUrl(data)">
        <a 
          href="#" 
          class="url-link" 
          @click.prevent="$emit('url-click', data)"
          :aria-label="$t('pageRedfishLogger.navigateToUrl')"
        >"{{ data }}"</a>
      </template>
      <template v-else>"{{ data }}"</template>
    </template>
    <template v-else-if="Array.isArray(data)">
      <template v-if="data.length === 0">[]</template>
      <template v-else>
        <span>[</span>
        <div class="json-indent">
          <template v-for="(item, index) in data" :key="index">
            <response-json-tree 
              :data="item" 
              @url-click="$emit('url-click', $event)"
            /><template v-if="index < data.length - 1">,</template>
            <br />
          </template>
        </div>
        <span>]</span>
      </template>
    </template>
    <template v-else-if="typeof data === 'object'">
      <!-- Render objects with special handling for @odata.id and @odata.context -->
      <template v-if="Object.keys(data).length === 0">{}</template>
      <template v-else>
        <span>{</span>
        <div class="json-indent">
          <template v-for="(value, key, index) in data" :key="key">
            <span>"{{ key }}": </span>
            <!-- Handle @odata.id and @odata.context as clickable links -->
            <template v-if="isOdataContextKey(key) && typeof value === 'string'">
              <a 
                href="#" 
                class="url-link" 
                @click.prevent="$emit('url-click', value)"
                :aria-label="$t('pageRedfishLogger.navigateToUrl')"
              >"{{ value }}"</a>
            </template>
            <template v-else>
              <response-json-tree 
                :data="value" 
                @url-click="$emit('url-click', $event)"
              />
            </template>
            <template v-if="index < Object.keys(data).length - 1">,</template>
            <br />
          </template>
        </div>
        <span>}</span>
      </template>
    </template>
    <template v-else>{{ String(data) }}</template>
  </span>
</template>

<script>
export default {
  name: 'ResponseJsonTree',
  props: {
    data: {
      type: [Object, Array, String, Number, Boolean],
      default: null
    }
  },
  emits: ['url-click'],
  methods: {
    isClickableUrl(str) {
      // Check if string is a Redfish URL path
      return (
        typeof str === 'string' && (
          str.startsWith('/redfish/') ||
          str.startsWith('$metadata') ||
          /^https?:\/\//.test(str)
        )
      );
    },
    hasOdataId(obj) {
      return typeof obj === 'object' && obj !== null && '@odata.id' in obj;
    },
    // Check if this is an @odata.context value that should be clickable
    isOdataContextKey(key) {
      return key === '@odata.id' || key === '@odata.context';
    }
  }
};
</script>

<style scoped lang="scss">
.json-tree {
  font-family: monospace;
  font-size: 12px;
}

.json-indent {
  padding-left: 16px;
}

.url-link {
  color: #2196f3;
  text-decoration: underline;
  cursor: pointer;
  
  &:hover {
    color: #1565c0;
  }
}
</style>
