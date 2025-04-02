import { mount } from '@vue/test-utils';
import ResponseJsonTree from '@/components/Global/ResponseJsonTree.vue';

describe('ResponseJsonTree.vue', () => {
  const mountComponent = (data) => {
    return mount(ResponseJsonTree, {
      props: { data },
      global: {
        mocks: {
          $t: (key) => key,
        },
      },
    });
  };

  describe('Rendering', () => {
    it('should render null value', () => {
      const wrapper = mountComponent(null);
      expect(wrapper.text()).toBe('null');
    });

    it('should render boolean values', () => {
      const wrapperTrue = mountComponent(true);
      expect(wrapperTrue.text()).toBe('true');

      const wrapperFalse = mountComponent(false);
      expect(wrapperFalse.text()).toBe('false');
    });

    it('should render number values', () => {
      const wrapper = mountComponent(42);
      expect(wrapper.text()).toBe('42');
    });

    it('should render string values with quotes', () => {
      const wrapper = mountComponent('hello world');
      expect(wrapper.text()).toContain('"hello world"');
    });

    it('should render empty array', () => {
      const wrapper = mountComponent([]);
      expect(wrapper.text()).toBe('[]');
    });

    it('should render array with values', () => {
      const wrapper = mountComponent([1, 2, 3]);
      expect(wrapper.text()).toContain('[');
      expect(wrapper.text()).toContain('1');
      expect(wrapper.text()).toContain('2');
      expect(wrapper.text()).toContain('3');
      expect(wrapper.text()).toContain(']');
    });

    it('should render empty object', () => {
      const wrapper = mountComponent({});
      expect(wrapper.text()).toBe('{}');
    });

    it('should render object with key-value pairs', () => {
      const wrapper = mountComponent({ name: 'test', value: 123 });
      expect(wrapper.text()).toContain('"name"');
      expect(wrapper.text()).toContain('"test"');
      expect(wrapper.text()).toContain('"value"');
      expect(wrapper.text()).toContain('123');
    });

    it('should render nested objects', () => {
      const wrapper = mountComponent({
        outer: {
          inner: 'value',
        },
      });
      expect(wrapper.text()).toContain('"outer"');
      expect(wrapper.text()).toContain('"inner"');
      expect(wrapper.text()).toContain('"value"');
    });
  });

  describe('URL Detection', () => {
    it('should detect /redfish/ URLs as clickable', () => {
      const wrapper = mountComponent('/redfish/v1/Systems');
      const link = wrapper.find('.url-link');
      expect(link.exists()).toBe(true);
    });

    it('should detect http:// URLs as clickable', () => {
      const wrapper = mountComponent('http://example.com/api');
      const link = wrapper.find('.url-link');
      expect(link.exists()).toBe(true);
    });

    it('should detect https:// URLs as clickable', () => {
      const wrapper = mountComponent('https://example.com/api');
      const link = wrapper.find('.url-link');
      expect(link.exists()).toBe(true);
    });

    it('should NOT make regular strings clickable', () => {
      const wrapper = mountComponent('just a regular string');
      const link = wrapper.find('.url-link');
      expect(link.exists()).toBe(false);
    });

    it('should detect $metadata URLs as clickable', () => {
      const wrapper = mountComponent('$metadata');
      const link = wrapper.find('.url-link');
      expect(link.exists()).toBe(true);
    });
  });

  describe('@odata.id handling', () => {
    it('should render @odata.id values as clickable links', () => {
      const wrapper = mountComponent({
        '@odata.id': '/redfish/v1/Managers/bmc',
      });
      const link = wrapper.find('.url-link');
      expect(link.exists()).toBe(true);
      expect(link.text()).toContain('/redfish/v1/Managers/bmc');
    });

    it('should render @odata.context values as clickable links', () => {
      const wrapper = mountComponent({
        '@odata.context': '/redfish/v1/$metadata#Manager',
      });
      const link = wrapper.find('.url-link');
      expect(link.exists()).toBe(true);
    });
  });

  describe('Events', () => {
    it('should emit url-click event when link is clicked', async () => {
      const wrapper = mountComponent('/redfish/v1/Systems');
      const link = wrapper.find('.url-link');
      
      await link.trigger('click');
      
      expect(wrapper.emitted('url-click')).toBeTruthy();
      expect(wrapper.emitted('url-click')[0]).toEqual(['/redfish/v1/Systems']);
    });

    it('should emit url-click for @odata.id links', async () => {
      const wrapper = mountComponent({
        '@odata.id': '/redfish/v1/Managers/bmc',
      });
      const link = wrapper.find('.url-link');
      
      await link.trigger('click');
      
      expect(wrapper.emitted('url-click')).toBeTruthy();
      expect(wrapper.emitted('url-click')[0]).toEqual(['/redfish/v1/Managers/bmc']);
    });

    it('should propagate url-click from nested components', async () => {
      const wrapper = mountComponent({
        nested: {
          link: '/redfish/v1/Systems',
        },
      });
      const link = wrapper.find('.url-link');
      
      await link.trigger('click');
      
      expect(wrapper.emitted('url-click')).toBeTruthy();
    });
  });

  describe('Snapshot', () => {
    it('should render complex Redfish response correctly', () => {
      const redfishResponse = {
        '@odata.context': '/redfish/v1/$metadata#Manager.Manager',
        '@odata.id': '/redfish/v1/Managers/bmc',
        '@odata.type': '#Manager.v1_14_0.Manager',
        Id: 'bmc',
        Name: 'Manager',
        Status: {
          Health: 'OK',
          State: 'Enabled',
        },
        Links: {
          ManagerForServers: [
            { '@odata.id': '/redfish/v1/Systems/system' },
          ],
        },
      };
      
      const wrapper = mountComponent(redfishResponse);
      expect(wrapper.element).toMatchSnapshot();
    });
  });
});
