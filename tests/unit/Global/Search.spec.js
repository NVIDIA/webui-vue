import { describe, it, expect } from 'vitest';
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
  it('should emit change-search on triggering onChangeInput', async () => {
    // Find the stubbed input element (b-form-input becomes input.form-control)
    const input = wrapper.find('input.form-control');
    await input.trigger('input');
    expect(wrapper.emitted('change-search')).toBeTruthy();
  });
  it('should emit clear-search on triggering onClearSearch', async () => {
    await wrapper.setData({ filter: 'true' });
    // Find the stubbed button element (b-button becomes button)
    const button = wrapper.find('button');
    await button.trigger('click');
    expect(wrapper.emitted('clear-search')).toBeTruthy();
  });
  it('should render correctly', async () => {
    await wrapper.setData({ uid: 'test-uid' });
    expect(wrapper.element).toMatchSnapshot();
  });
});
