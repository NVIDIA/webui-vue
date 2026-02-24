# Redfish Logger (API Log)

Author: Shane Lin

Created: February 24, 2026

## Problem Description

When testing or debugging the BMC Web UI, engineers and QA need to see what
Redfish API calls the UI is making. Without this tool, they must open the
browser DevTools Network tab, filter requests manually, and correlate requests
with responses. This is slow and error-prone.

The Redfish Logger is a built-in debug panel that captures all Redfish API
requests and responses in real time. It shows them in a grouped list inside
the Web UI itself, so testers do not need external tools.

## Background and References

- [Redfish API Specification](https://www.dmtf.org/standards/redfish)
- The logger uses Axios interceptors to capture traffic. See `src/store/api.js`.

## Plan of Record

### Feature Summary

The Redfish Logger is a **developer/QA tool** that:

1. Captures every Redfish API request, response, and error made by the Web UI
2. Displays them in a panel fixed to the bottom of the page
3. Lets users edit and resend requests (like a simple REST client)
4. Lets users create new Redfish requests from scratch
5. Filters sensitive data (passwords, auth tokens) by default
6. Handles FormData uploads by converting them to a readable JSON format

### Feature Toggle

The feature is **off by default**. It is controlled by an environment variable
at build time:

```
VITE_ENABLE_REDFISH_LOGGER=true
```

This variable is set in `.env.development.local` or the appropriate `.env.*`
file. When the variable is not `'true'`, the feature is completely hidden — no
UI elements are rendered and no interceptors log data.

### How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    Axios Instance                       │
│                                                         │
│  Request Interceptor ──► assigns unique request ID      │
│                          logs: method, url, headers,    │
│                                body, timestamp          │
│                          converts FormData to JSON      │
│                                                         │
│  Response Interceptor ──► logs: status, headers,        │
│                                 body, timestamp         │
│                           correlates with request ID    │
│  Error Interceptor ────► logs errors with same format   │
│                           (type: 'error')               │
└─────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│              RedfishLoggerStore (Vuex)                  │
│                                                         │
│  - apiLogs[] (max 500 entries)                          │
│  - Groups requests + responses by request ID            │
│  - Filters sensitive headers and body fields            │
│  - Tracks request/response counts                       │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              RedfishLogger.vue (UI Panel)               │
│                                                         │
│  - Fixed to page bottom, max height 40vh                │
│  - Shows grouped request/response pairs                 │
│  - Body and Headers shown in separate tabs              │
│  - Supports minimize, expand, close                     │
│  - Edit + resend any logged request                     │
│  - Per-request loading indicator when sending           │
│  - Create new requests (GET/POST/PATCH/PUT/DELETE)      │
│  - Click @odata.id links to navigate and fetch          │
│  - Adjusts page padding to avoid covering content       │
└─────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/store/modules/RedfishLoggerStore.js` | Vuex store module — state, log storage, filtering |
| `src/components/Global/RedfishLogger.vue` | UI panel component |
| `src/components/Global/ResponseJsonTree.vue` | Recursive JSON tree viewer for responses |
| `src/store/api.js` (lines 35–142) | Axios interceptors that capture requests/responses |
| `src/components/AppHeader/AppHeader.vue` | Header button to start/stop recording |
| `tests/unit/RedfishLoggerStore.spec.js` | Unit tests for the store |
| `tests/unit/Global/ResponseJsonTree.spec.js` | Unit tests for the JSON tree viewer |
| `tests/unit/AppHeader.spec.js` | Unit tests for the header button |

### Security: Sensitive Data Filtering

By default, the logger replaces sensitive values with `[FILTERED]`.

**Filtered headers** (case-insensitive):
`authorization`, `x-auth-token`, `x-xsrf-token`, `xsrf-token`, `cookie`,
`set-cookie`, `x-csrf-token`, `csrf-token`

**Filtered body fields**:
`Password`, `password`, `NewPassword`, `newPassword`, `OldPassword`,
`oldPassword`, `UserName`, `userName`, `username`, `Username`

There is a checkbox **"Log Sensitive Headers"** in the panel header. When
checked, filtering is disabled and all values are shown as-is. This is useful
when debugging authentication issues.

When editing a logged request, auto-generated headers (`accept`,
`x-requested-with`, `content-type`, `authorization`, `x-auth-token`) and
`[FILTERED]` values are hidden from the editable headers field.

### Log Entry Limits

The store keeps a maximum of **500 log entries**. When the limit is reached,
the oldest entries are removed first. Logs are stored in memory only — they
are cleared on page refresh or logout.

## QA Testing Guide

### Prerequisites

1. Build the Web UI with `VITE_ENABLE_REDFISH_LOGGER=true`
2. Log in to the Web UI

### Test Case 1: Feature Toggle

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Build **without** `VITE_ENABLE_REDFISH_LOGGER=true` | No logger button in the header. No logger panel anywhere. |
| 2 | Build **with** `VITE_ENABLE_REDFISH_LOGGER=true` | A recording icon button appears in the AppHeader (top right area). On small screens, only the icon is shown; the "Redfish Logger" text is hidden. |

### Test Case 2: Start and Stop Recording

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click the recording icon in the header | Icon turns **red** with a pulse animation (recording). The logger panel opens at the bottom of the page. |
| 2 | Navigate to any page (e.g., Overview, Inventory) | Requests appear in the logger panel as grouped request/response pairs. |
| 3 | Click the recording icon again | Icon turns **gray** (not recording). The panel closes. |
| 4 | Navigate to another page | No new entries appear (logging is stopped). |

### Test Case 3: View Request and Response Details

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start recording and navigate to a page | Log entries appear in the panel. |
| 2 | Click on a log entry row | The entry expands to show details. |
| 3 | Check the request section | Shows: HTTP method, URL, timestamp. Body and Headers are in separate tabs. |
| 4 | Check the response section | Shows: HTTP status code, timestamp. Body (JSON tree) and Headers are in separate tabs. |

### Test Case 4: Sensitive Data Filtering

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start recording | Logger panel opens. |
| 2 | Perform a login or any action that sends passwords | The log entry shows `[FILTERED]` for password fields and auth headers. |
| 3 | Check the **"Log Sensitive Headers"** checkbox | (Applies to future entries only.) |
| 4 | Perform the same action again | The new log entry shows actual password and auth header values. |
| 5 | Uncheck **"Log Sensitive Headers"** | Future entries are filtered again. |

### Test Case 5: Edit and Resend a Request

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start recording and wait for some entries | Log entries appear. |
| 2 | Click the edit/resend button on a log entry | The request URL, method, headers, and body become editable. Auto-generated headers are hidden from the editable field. |
| 3 | Change a field (e.g., the URL) and click send | A loading indicator appears on that request. A new log entry pair appears with the modified request and its response. |

### Test Case 6: Create a New Request

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click the **"+"** button in the logger panel header | A new request form appears. |
| 2 | Select a method (e.g., GET) | Method dropdown updates. |
| 3 | Enter a URL (e.g., `/redfish/v1/Systems`) | URL field is filled. |
| 4 | Click send | The request is made. A new log entry pair appears with the request and response. |
| 5 | Try POST/PATCH with a JSON body | The request sends the body correctly. Response appears in the log. |

### Test Case 7: Panel Controls

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click the **minimize** button (▁) | Panel collapses to a thin bar at the bottom showing entry count. |
| 2 | Click the **expand** button on the minimized bar | Panel returns to full size with all entries visible. |
| 3 | Click the **close** button (×) | Panel disappears completely. Page padding returns to normal. |
| 4 | Click the recording icon in the header again | Panel reappears (recording resumes). |

### Test Case 8: Clear Logs

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start recording and navigate to generate entries | Several log entries appear. |
| 2 | Click the **"Clear Logs"** button | All entries are removed. Request and response counts reset to 0. |

### Test Case 9: JSON Navigation (Clickable URLs)

The JSON tree viewer makes several types of URLs clickable:
`@odata.id` values, `@odata.context` values, paths containing `/redfish/`,
`$metadata` strings, and full `http`/`https` URLs.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start recording and fetch a Redfish resource | A response with `@odata.id` links appears in the JSON tree. |
| 2 | Click an `@odata.id` URL in the response | The URL fills the new-request form. The user can send it as a GET request. The result appears as a new log entry. |

### Test Case 10: Log Entry Limit (500 max)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate a large number of API calls (navigate many pages repeatedly) | Entries accumulate in the panel. |
| 2 | Continue until more than 500 entries would exist | The oldest entries are automatically removed. The panel never shows more than 500 entries. |

### Test Case 11: Logout Cleanup

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start recording and generate some entries | Entries appear in the panel. |
| 2 | Log out | All logs are cleared. Logger state is reset. |
| 3 | Log back in | Logger panel is hidden. No old entries remain. Recording is stopped. |

## Impacts

### Security Impact

- Sensitive data is filtered by default
- The "Log Sensitive Headers" option should only be used in trusted
  environments (development/lab)
- Logs are stored in browser memory only — never sent to a server

### Performance Impact

- When the feature is disabled (`VITE_ENABLE_REDFISH_LOGGER` is not `true`),
  interceptors do not log any data
- When enabled but not recording, overhead is minimal (a request ID is
  generated for each request, but no data is stored)
- When recording, each request/response is stored in the Vuex store. The 500
  entry cap prevents unbounded memory growth
