import { mount } from '@vue/test-utils';
import Search from '@/components/Global/Search';

describe('Search.vue', () => {
  const wrapper = mount(Search, {
    global: {
      mocks: {
        $t: (key) => key,
      },
    },
  });
  it('should exist', () => {
    expect(wrapper.exists()).toBe(true);
  });
  it('should emit change-search on triggering onChangeInput', () => {
    wrapper.find('b-form-input').trigger('input');
    expect(wrapper.emitted('change-search')).toHaveLength(1);
  });
  it('should emit clear-search on triggering onClearSearch', async () => {
    await wrapper.setData({ filter: 'true' });
    wrapper.find('b-button').trigger('click');
    expect(wrapper.emitted('clear-search')).toHaveLength(1);
  });
  it('should render correctly', async () => {
    await wrapper.setData({ uid: 'test-uid' });
    expect(wrapper.element).toMatchSnapshot();
  });
});
