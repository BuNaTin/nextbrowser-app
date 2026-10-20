# Configuration and repository development

[Back to README](../README.md) · [Product guide](product-guide.md) · [Troubleshooting](troubleshooting.md)

This repository contains the runnable Nextbrowser desktop application built with Electron, React, TypeScript, and Vite.

## Repository boundaries

| Path | Purpose |
| --- | --- |
| <code>src/</code> | React UI, application state, agent adapters, browser-session control, analytics, and tests. |
| <code>electron/</code> | Electron main process, preload bridge, process execution, persistence, updates, and SSH configuration discovery. |
| <code>scripts/</code> | Icon generation, release-version synchronization, and documentation validation. |
| <code>build/</code> | Desktop icons and macOS entitlements used by Electron Builder. |
| <code>docs/</code> | Product, browser-control, configuration, troubleshooting, and translated README documentation. |
| <code>.github/</code> | CI, release automation, Issue Forms, and pull-request guidance. |

Desktop source and release automation are maintained in this repository.

## Application setup

Use the current [product documentation](https://docs.nextbrowser.com/) and the setup flow included with the installed release to configure the browser environment, local agent, and API key. Restart Nextbrowser after changing a runtime or agent path.

Do not commit an API key, place it in a reusable prompt, or paste it into an issue. Redact credentials, account identifiers, cookies, tokens, private URLs, and personal data before sharing diagnostics.

## Local state

| State | Owner |
| --- | --- |
| Browser account and profiles | Browser environment configured for the installed release. |
| Browser sessions | Browser runtime selected by Nextbrowser. |
| Conversations and schedules | Nextbrowser application data. |
| Custom scripts | Nextbrowser application data and skill synchronization. |
| Agent skills | Agent-specific skill or plugin directories. |
| Application update state | Nextbrowser application data. |

The Electron main process stores app-owned state in the platform application-data directory returned by <code>app.getPath("userData")</code>. Do not remove that directory unless you intend to delete local app state.

## Analytics notes

The desktop build enables its configured GA4 stream by default. Events include an application instance identifier and operational metadata described in [<code>ANALYTICS.md</code>](../ANALYTICS.md). The analytics implementation does not send prompt text, target URLs, or page domains.

Override the measurement stream for a special build with <code>VITE_GA4_MEASUREMENT_ID</code>. A blank value disables collection for that build.

## Error reports

When something breaks, the desktop app sends an error report to the Nextbrowser backend (<code>POST /v1/client-errors</code> on the same API base as browser-runtime calls, <code>api.nextbrowser.com</code> by default). The request is signed with the connected account's key when there is one and is anonymous otherwise.

A report contains what failed (error name, message, stack, nbc error code, or HTTP status), the screen and action it happened in, the app and nbc versions, the operating system, a per-launch session id, a random install id, and the last 30 breadcrumbs: screens, IPC command names, backend calls (method, host, path, status), nbc command names with their exit status, and UI action names. Every backend request carries a W3C <code>traceparent</code> header, so a failed call is reported with the trace id of the matching server trace, and <code>X-Client-Name</code>/<code>X-Client-Version</code>, so the backend's request log names the app version that made the call.

Reports are scrubbed before they are stored: the home directory becomes <code>~</code>, URLs lose their query, fragment, and credentials, and emails, bearer tokens, account keys, and API keys are removed. Reports never include page contents, prompts, typed text, cookies, proxy credentials, nbc output, or nbc command arguments.

What is reported:

- renderer exceptions, unhandled promise rejections, and React render errors;
- main-process exceptions and unhandled rejections, crashed or unresponsive app processes;
- backend calls that fail on the network or return a 5xx status (4xx responses are breadcrumbs only);
- nbc calls that crash, cannot start, return no JSON when JSON was requested, or fail with an error code that means nbc or a backend broke. Outcomes the app already explains to the user — invalid input, missing profiles, sign-in, proxy checks, traffic limits, site-flow results, an offline computer, cancellations, and timeouts — are breadcrumbs only.

Repeats of the same error are folded into one report with a count. A launch sends at most 200 reports, and at most 20 for one error.

Turn reports off with **Settings → Send error reports**. <code>NEXTBROWSER_ERROR_REPORTING=0</code> disables them in any build; development and unpackaged builds send nothing unless <code>NEXTBROWSER_ERROR_REPORTING=1</code>. Unsent reports wait in <code>client-errors/</code> in the application-data directory (at most 200, for up to seven days), and the reporter's own failures are logged to <code>client-errors/reporter.log</code> there.

## Development

Install dependencies and start the Electron/Vite development process:

~~~bash
npm ci
npm run dev
~~~

For a dev build that must use a non-production API/backend, set the backend base URL before launching:

~~~bash
NEXTBROWSER_DEV_API_BASE_URL=http://127.0.0.1:18098 npm run dev
~~~

`NEXTBROWSER_DEV_API_BASE_URL` has priority over production API settings in the desktop process.
For a dedicated non-production entity service without changing browser runtime traffic, use
`NEXTBROWSER_ENTITY_API_BASE_URL`. `NEXTBROWSER_RUNTIME_API_BASE_URL` controls only browser
runtime traffic. Production defaults remain `core.nextbrowser.com` for workspace/Automation
entities and `api.nextbrowser.com` for browser sessions.

Before submitting application changes, run:

~~~bash
npm test
npm run build
npm run pack
~~~

CI runs install, tests, build, and unpacked packaging on macOS and Windows. Release automation publishes platform artifacts for tags matching <code>v*</code>.
