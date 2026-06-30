<template>
  <b-modal
    :id="modalId"
    :title="title"
  >
    <pre>{{ parsedJsonContent() }}</pre>
    <template #modal-footer="{ ok }">
      <b-button variant="primary" @click="ok()">
        {{ $t('global.action.ok') }}
      </b-button>
    </template>
  </b-modal>
</template>

<script>
export default {
  props: {
    modalId: {
      type: String,
      default: 'json-modal',
    },
    title: {
      required: true,
    },
    // Optional: pass raw object/string directly instead of relying on slot text extraction
    content: {
      type: [String, Object, Array, Number, Boolean],
      default: null,
    },
  },
  methods: {
    getSlotText() {
      // Vue 3: slots are functions returning VNodes
      const slot = this.$slots?.default;
      const nodes = typeof slot === 'function' ? slot() : slot;
      if (!Array.isArray(nodes) || nodes.length === 0) return '';

      const extract = (n) => {
        if (!n) return '';
        // Text children
        if (typeof n.children === 'string') return n.children;
        // Array children (fragments)
        if (Array.isArray(n.children)) return n.children.map(extract).join('');
        return '';
      };
      return nodes.map(extract).join('').trim();
    },
    parsedJsonContent() {
      const raw =
        this.content !== null && this.content !== undefined
          ? this.content
          : this.getSlotText();

      if (raw === null || raw === undefined || raw === '') {
        return '';
      }

      // If already an object/array, pretty print directly
      if (typeof raw === 'object') {
        try {
          return JSON.stringify(raw, null, 2);
        } catch (e) {
          return String(raw);
        }
      }

      const slotContent = String(raw);
      if (slotContent) {
        try {
          return JSON.stringify(JSON.parse(slotContent), null, 2);
        } catch (e) {
          return slotContent;
        }
      } else {
        return '';
      }
    },
  },
};
</script>