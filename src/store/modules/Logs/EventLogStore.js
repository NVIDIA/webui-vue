import CommonLogStore from './CommonLogStore';

const EventLogStore = {
  ...CommonLogStore,
  state: {
    ...CommonLogStore.state,
    logType: 'EventLog',
  },
};

export default EventLogStore;
