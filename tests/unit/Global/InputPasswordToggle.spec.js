import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import InputPasswordToggle from '@/components/Global/InputPasswordToggle';

describe('InputPasswordToggle.vue', () => {
  const wrapper = mount(InputPasswordToggle, {
    data() {
      return {
        isVisible: false,
      };
    },
    global: {
      mocks: {
        $t: (key) => key,
      },
    },
  });
  it('should exist', () => {
    expect(wrapper.exists()).toBe(true);
  });
  it('should not render isVisible class', () => {
    expect(wrapper.find('.isVisible').exists()).toBe(false);
  });
  it('should render isVisible class when button is clicked', async () => {
    // Find the stubbed button element (b-button becomes button)
    await wrapper.find('button').trigger('click');
    expect(wrapper.find('.isVisible').exists()).toBe(true);
  });
  it('should render correctly', () => {
    expect(wrapper.element).toMatchSnapshot();
  });
});
