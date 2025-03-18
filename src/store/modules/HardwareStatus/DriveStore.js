import api from '@/store/api';

const DriveStore = {
  namespaced: true,
  state: {
    storageCollections: [],
    drives: [],
  },
  getters: {
    storageCollections: (state) => state.storageCollections,
    drives: (state) => state.drives,
  },
  mutations: {
    setStorageCollections: (state, data) => {
      state.storageCollections = data;
    },
    setDrives: (state, drives) => {
      // Handle axios response objects
      const processedDrives = drives.map(drive => {
        // If this is an axios response object with the data in .data
        if (drive.data && typeof drive.data === 'object' && drive.status && drive.status === 200) {
          return drive.data;
        }
        return drive;
      });
      
      state.drives = processedDrives;
    },
    clearDrives: (state) => {
      state.drives = [];
    },
  },
  actions: {
    fetchStorageCollections({ commit }) {
      return this.dispatch('system/getSystemsResourceMembers', {
        name: 'Storage',
      }).then((storageCollections) => {
        commit('setStorageCollections', storageCollections);
        return storageCollections;
      });
    },
    fetchDrives({ commit, dispatch, state }) {
      // Clear existing drives to prevent duplicates
      commit('clearDrives');
      
      // Return a Promise that resolves when all drives are fetched
      return new Promise((resolve, reject) => {
        // First, get the storage collections if needed
        const collectionsPromise = state.storageCollections.length 
          ? Promise.resolve(state.storageCollections) 
          : dispatch('fetchStorageCollections');
          
        collectionsPromise
          .then((collections) => {
            // If no collections found, resolve immediately
            if (!collections || !collections.length) {
              return resolve();
            }
            
            // Create an array to store all drive fetch promises
            const allDrivePromises = [];
            
            // Process each collection and fetch drives
            collections.forEach(collection => {
              // Skip collections without Drives property
              if (!collection.Drives || !collection.Drives.length) {
                return;
              }
              
              // Create promises for each drive
              const drivePromises = collection.Drives.map(drive => {
                return api.get(drive['@odata.id']);
              });
              
              allDrivePromises.push(...drivePromises);
            });
            
            // If no drives to fetch, resolve immediately
            if (allDrivePromises.length === 0) {
              return resolve();
            }
            
            // Fetch all drives and update state
            Promise.all(allDrivePromises)
              .then(drivesData => {
                commit('setDrives', drivesData);
                resolve();
              })
              .catch(error => {
                console.error('Error fetching drive data:', error);
                reject(error);
              });
          })
          .catch(error => {
            console.error('Error fetching storage collections:', error);
            reject(error);
          });
      });
    },
  },
};

export default DriveStore;
