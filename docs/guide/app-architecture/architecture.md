# OpenBMC Web UI Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            OpenBMC WebUI-vue (Vue 3)                    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
         ┌───────────────────────────────────────────────────────────┐
         │                         main.js                           │
         │  ┌─────────┐ ┌────────┐ ┌───────┐ ┌─────────┐ ┌────────┐  │
         │  │ Vue App │ │ Router │ │ Store │ │ i18n    │ │ Plugins│  │
         │  └─────────┘ └────────┘ └───────┘ └─────────┘ └────────┘  │
         └───────────────────────────────────────────────────────────┘
                     │           │           │            │
     ┌───────────────┘           │           │            │
     │                           │           │            │
┌────▼───────┐            ┌──────▼──────┐  ┌─▼───────┐  ┌─▼──────────────┐
│  App.vue   │            │  router/    │  │ store/  │  │ Bootstrap-Vue  │
└────────────┘            │  index.js   │  │ index.js│  │ Components     │
                          └─────────────┘  └─────────┘  └────────────────┘
                                │               │
                    ┌───────────┘               │
                    │                           │
            ┌───────▼─────────┐         ┌──────▼───────────┐
            │ Views/          │         │ store/modules/   │
            │ - Overview      │         │ - Authentication │
            │ - Login         │◄────────┤ - GlobalStore    │
            │ - HardwareStatus│         │ - HardwareStatus │
            │ - Operations    │         │ - Logs           │
            │ - Logs          │         │ - Operations     │
            │ - Security      │         │ - ResourceMgmt   │
            │ - ResourceMgmt  │         │ - Security       │
            │ - Settings      │         │ - Settings       │
            └─────────────────┘         └──────────────────┘
                    │                            │
                    │                            │
            ┌───────▼───────────┐       ┌───────▼────────┐
            │ components/       │       │ api/           │
            │ - AppHeader       │       │ - schema/      │◄─────────┐
            │ - AppNavigation   │       │ - constants/   │          │
            │ - Global          │       │ - services/    │          │
            │ - Mixins          │       └────────────────┘          │
            │ - Validators      │                │                  │
            │ - Common          │                │                  │
            │ - Widgets         │                │                  │
            └───────────────────┘                ▼                  │
                    │                   ┌────────────────┐         │
                    │                   │ HTTP Client    │         │
                    │                   │ (Axios)        │─────────┘
                    ▼                   └────────────────┘
            ┌───────────────────┐               │
            │ utils/            │               ▼
            │ - helpers/        │      ┌────────────────┐
            │ - directives/     │      │ OpenBMC API    │
            │ - filters/        │      │ (Redfish)      │
            │ - formatters/     │      └────────────────┘
            └───────────────────┘
```

## Architecture Description

This architecture diagram shows:

1. **Main Application Structure**:
   - `main.js` - The entry point that initializes Vue and loads core plugins
   - `App.vue` - The root component that renders the application shell

2. **Core Modules**:
   - **Router**: Manages navigation between different views
   - **Store**: Vuex store for state management
   - **i18n**: Internationalization support
   - **Bootstrap-Vue**: UI component framework

3. **Views Layer**:
   - Overview, Login, Hardware Status, Operations, etc.
   - Each view represents a major section of the application

4. **Components Layer**:
   - Reusable UI components like AppHeader, AppNavigation
   - Global components shared across views
   - Mixins and Validators for shared functionality
   - Common components used across multiple features
   - Widgets for specialized UI elements

5. **Store Modules**:
   - Modular Vuex stores matching the application's feature domains
   - Each module manages specific state (Authentication, Hardware Status, etc.)

6. **API Layer**:
   - API schema definitions
   - Constants for API endpoints and configuration
   - Services for encapsulating API operations
   - HTTP client (Axios) for communicating with the backend
   - Connection to OpenBMC RESTful API (Redfish)

7. **Utils Layer**:
   - Helper functions for common operations
   - Custom Vue directives
   - Filters for data transformation
   - Formatters for consistent data display

The architecture follows a modular design pattern, where features are organized into self-contained modules with their own views, components, and store modules, making it maintainable and extendable. The separation of concerns between the API layer, store modules, and UI components helps maintain a clean codebase and facilitates testing and future enhancements. 