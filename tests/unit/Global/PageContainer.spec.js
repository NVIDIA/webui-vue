import { mount } from '@vue/test-utils';
import PageContainer from '@/components/Global/PageContainer';

// Mock the ManagerStatusService to prevent store dispatch calls
jest.mock('@/services/ManagerStatusService', () => ({
  startManagerStatusCheck: jest.fn(() => 123),
  stopManagerStatusCheck: jest.fn(),
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
          on: jest.fn(),
          off: jest.fn(),
        },
      },
      stubs: {
        GlobalBanner: true,
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
