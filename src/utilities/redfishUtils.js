import api from '@/store/api';
import i18n from '@/i18n';

/**
 * Utility functions for working with Redfish API actions and their parameters
 * 
 * @example
 * // Basic usage to discover actions by path
 * const actions = await redfishUtils.discoverActions('/redfish/v1/Systems/1');
 * 
 * // Using with already loaded resource and custom defaults in a single call
 * const systemResponse = await api.get('/redfish/v1/Systems/1');
 * const customDefaults = {
 *   'ComputerSystem.Reset': {
 *     ResetType: {
 *       required: true,
 *       allowableValues: ['On', 'ForceOff', 'GracefulRestart']
 *     }
 *   }
 * };
 * const actions = await redfishUtils.discoverActions(systemResponse.data, customDefaults);
 * 
 * // Execute an action
 * await redfishUtils.executeAction(actions, 'ComputerSystem.Reset', { ResetType: 'ForceOff' });
 */
const redfishUtils = {
  /**
   * Discover and process actions from a Redfish resource
   * 
   * @param {string|Object} resourcePathOrObject - Path to the Redfish resource or the resource object itself
   *                                              (passing the object is more efficient if you already have the resource)
   * @param {Object} [defaultParameters={}] - Optional custom default parameters to apply to the discovered actions
   * @returns {Promise<Object>} - Object containing discovered actions with their parameters and allowable values
   */
  async discoverActions(resourcePathOrObject, defaultParameters = {}) {
    try {
      let resource;
      
      if (typeof resourcePathOrObject === 'string') {
        // If a string path is provided, fetch the resource
        const resourcePath = resourcePathOrObject;
        const response = await api.get(resourcePath);
        resource = response.data;
      } else {
        // Otherwise use the provided resource object directly
        resource = resourcePathOrObject;
      }
      
      if (!resource) {
        throw new Error('No resource provided or found');
      }
      
      if (!resource.Actions) {
        console.warn(`No Actions found in resource${typeof resourcePathOrObject === 'string' ? ': ' + resourcePathOrObject : ''}`);
        return {};
      }
      
      // Process all actions
      const actions = {};
      const actionProcessingPromises = [];
      
      // For each action in the Actions object
      for (const [actionKey, actionData] of Object.entries(resource.Actions)) {
        // Skip non-action properties
        if (!actionKey.startsWith('#')) continue;
        
        // Extract the action name without the # prefix
        const actionName = actionKey.substring(1);
        
        // Initialize action object with target
        const action = {
          name: actionName,
          target: actionData.target,
          parameters: {}
        };
        
        // Skip if no target
        if (!action.target) {
          console.warn(`Action ${actionName} has no target URL`);
          continue;
        }
        
        // Process ActionInfo if available
        if (actionData['@Redfish.ActionInfo']) {
          const actionInfoPromise = api.get(actionData['@Redfish.ActionInfo'])
            .then(response => {
              const actionInfoData = response.data;
              
              // Process each parameter
              if (actionInfoData.Parameters && Array.isArray(actionInfoData.Parameters)) {
                actionInfoData.Parameters.forEach(param => {
                  action.parameters[param.Name] = {
                    required: param.Required === true,
                    allowableValues: param.AllowableValues || []
                  };
                });
              }
              
              // Add this action to our actions object
              actions[actionName] = action;
            })
            .catch(error => {
              console.error(`Failed to fetch ActionInfo for ${actionName}:`, error);
              
              // Still add the action but without parameter details
              actions[actionName] = action;
            });
          
          actionProcessingPromises.push(actionInfoPromise);
        } 
        // Check for inline allowable values
        else {
          // Look for properties like "ResetType@Redfish.AllowableValues"
          for (const [propKey, propValue] of Object.entries(actionData)) {
            if (propKey.endsWith('@Redfish.AllowableValues')) {
              const paramName = propKey.split('@')[0];
              action.parameters[paramName] = {
                required: false, // We don't know if it's required without ActionInfo
                allowableValues: Array.isArray(propValue) ? propValue : []
              };
            }
          }
          
          // Add this action to our actions object
          actions[actionName] = action;
        }
      }
      
      // Wait for all action info processing to complete
      await Promise.all(actionProcessingPromises);
      
      // Apply default parameters if provided
      if (defaultParameters && Object.keys(defaultParameters).length > 0) {
        return this.applyDefaultParameters(actions, defaultParameters);
      }
      
      return actions;
    } catch (error) {
      console.error(`Failed to discover actions:`, error);
      throw error;
    }
  },

  /**
   * Get default parameter values for common Redfish actions
   * 
   * @param {string} actionName - Name of the action
   * @returns {Object} - Default parameter information for the action
   */
  getDefaultParameters(actionName) {
    // Built-in defaults for backward compatibility
    const builtInDefaults = {
      'ComputerSystem.Reset': {
        ResetType: {
          required: true,
          allowableValues: [
            'On', 
            'ForceOff', 
            'GracefulShutdown', 
            'GracefulRestart', 
            'ForceRestart', 
            'PowerCycle'
          ]
        }
      },
      'Manager.Reset': {
        ResetType: {
          required: true,
          allowableValues: ['GracefulRestart', 'ForceRestart']
        }
      }
    };

    return builtInDefaults[actionName] || {};
  },

  /**
   * Apply default parameters to actions where parameters are missing
   * 
   * @param {Object} actions - Discovered actions
   * @param {Object} [customDefaults={}] - Custom default parameters provided by the store
   * @returns {Object} - Actions with default parameters applied where needed
   * @deprecated - Consider using the defaultParameters option with discoverActions() instead
   *               This method is kept for backward compatibility
   */
  applyDefaultParameters(actions, customDefaults = {}) {
    const actionsWithDefaults = { ...actions };
    
    // Loop through actions and apply defaults where needed
    for (const [actionName, action] of Object.entries(actionsWithDefaults)) {
      // Check if there are custom defaults for this action
      const customActionDefaults = customDefaults[actionName];
      // Fall back to built-in defaults if no custom defaults are provided
      const defaultParams = customActionDefaults || this.getDefaultParameters(actionName);
      
      if (defaultParams && Object.keys(defaultParams).length > 0) {
        // For each default parameter
        for (const [paramName, paramInfo] of Object.entries(defaultParams)) {
          // If parameter doesn't exist or has no allowable values
          if (!action.parameters[paramName] || 
              !action.parameters[paramName].allowableValues || 
              action.parameters[paramName].allowableValues.length === 0) {
            
            // Apply the default
            action.parameters[paramName] = paramInfo;
            console.warn(`No allowable values found for ${paramName} in ${actionName}, using defaults`);
          }
        }
      }
    }
    
    return actionsWithDefaults;
  },

  /**
   * Verify if a parameter value is allowed for an action
   * 
   * @param {Object} actions - Discovered actions
   * @param {string} actionName - Name of the action
   * @param {string} paramName - Name of the parameter
   * @param {any} paramValue - Value to verify
   * @returns {boolean} - True if the value is allowed, throws an error otherwise
   */
  verifyParameterAllowed(actions, actionName, paramName, paramValue) {
    const actionInfo = actions[actionName];
    
    // If we have the action and it has allowable values for this parameter
    if (actionInfo && actionInfo.parameters && actionInfo.parameters[paramName]) {
      const allowableValues = actionInfo.parameters[paramName].allowableValues;
      
      // Check if the parameter value is in the allowable values
      if (allowableValues.length > 0 && !allowableValues.includes(paramValue)) {
        console.error(`Parameter ${paramName} value "${paramValue}" is not in the list of allowable values:`, 
          allowableValues);
        throw new Error(i18n.global.t('global.error.paramValueNotAllowed', 
          { param: paramName, value: paramValue }));
      }
    }
    
    return true;
  },

  /**
   * Execute a Redfish action
   * 
   * @param {Object} actions - Discovered actions
   * @param {string} actionName - Name of the action to execute
   * @param {Object} parameters - Parameters to pass to the action
   * @returns {Promise<Object>} - Response from the action
   */
  async executeAction(actions, actionName, parameters = {}) {
    const actionInfo = actions[actionName];
    
    if (!actionInfo || !actionInfo.target) {
      throw new Error(`Action ${actionName} not found or missing target`);
    }
    
    // Verify all parameters are allowed
    // if (parameters) {
    //   for (const [paramName, paramValue] of Object.entries(parameters)) {
    //     this.verifyParameterAllowed(actions, actionName, paramName, paramValue);
    //   }
    // }
    
    // Execute the action
    return await api.post(actionInfo.target, parameters);
  }
};

export default redfishUtils; 