import { vi, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PageContainer from '@/components/Global/PageContainer';

// Mock the ManagerStatusService to prevent store dispatch calls
vi.mock('@/services/ManagerStatusService', () => ({
  startManagerStatusCheck: vi.fn(() => 123),
  stopManagerStatusCheck: vi.fn(),
}));

describe('PageContainer.vue', () => {
  const wrapper = mount(PageContainer, {
    global: {
      mocks: {
        $t: (key) => key,
        $store: {
          state: {
            bmc: {
              isManagerReady: true,
            },
          },
        },
        $eventBus: {
          on: vi.fn(),
          off: vi.fn(),
        },
      },
      stubs: {
        GlobalBanner: true,
        BootProgressBanner: true,
      },
    },
  });

  it('should exist', () => {
    expect(wrapper.exists()).toBe(true);
  });

  it('should render main element', () => {
    expect(wrapper.find('main').exists()).toBe(true);
  });

  it('should render correctly', () => {
    expect(wrapper.element).toMatchSnapshot();
  });
});
