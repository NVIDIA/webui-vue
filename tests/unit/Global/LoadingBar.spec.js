import { vi, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import LoadingBar from '@/components/Global/LoadingBar';
import eventBus from '@/eventBus';

// Stub useIsFetching / useIsMutating so LoadingBar doesn't need a real
// query client with active queries.  The loading bar is driven by these
// counts plus the manual event-bus loader.
const mockFetchingCount = ref(0);
const mockMutatingCount = ref(0);

vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useIsFetching: () => mockFetchingCount,
    useIsMutating: () => mockMutatingCount,
  };
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('LoadingBar.vue', () => {
  let wrapper;

  beforeEach(() => {
    mockFetchingCount.value = 0;
    mockMutatingCount.value = 0;

    wrapper = mount(LoadingBar, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
        mocks: {
          $t: (key) => key,
        },
      },
    });
  });

  it('should exist', () => {
    expect(wrapper.exists()).toBe(true);
  });

  it('should show loading bar when fetching', async () => {
    // Simulate an active fetch — loading bar should appear
    mockFetchingCount.value = 1;
    await wrapper.vm.$nextTick();
    // The isBusy computed should now be true, triggering the bar
    expect(wrapper.find('.progress').exists()).toBe(true);
  });

  it('should show loading bar on manual loader-start', async () => {
    eventBus.emit('loader-start');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.progress').exists()).toBe(true);
  });

  it('should render correctly', () => {
    expect(wrapper.element).toMatchSnapshot();
  });
});
