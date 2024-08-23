import CommonLogStore from './CommonLogStore';

const SelLogStore = {
  ...CommonLogStore,
  state: {
    ...CommonLogStore.state,
    logType: 'SEL',
  },
};

export default SelLogStore;
