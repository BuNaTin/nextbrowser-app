# End-to-end checks

`e2e/` runs the release checklist against a running Nextbrowser window, through
the visible UI only, and checks one more thing the checklist does not: every
error the user sees during the run must reach the backend as an error report.

## Run

1. Start the app with a debugging port and a data folder of its own, signed in
   to a QA account with an agent connected. A packaged build:

   ```
   Nextbrowser.exe --user-data-dir=C:\Users\me\.nextbrowser-e2e --remote-debugging-port=9333
   ```

   A dev build: `NEXTBROWSER_DEV_DATA_ROOT=/abs/dir npm run dev -- --remote-debugging-port=9333`
   (see docs/isolated-desktop-qa.md).

2. Run all scenarios or some of them:

   ```
   node e2e/run.mjs
   node e2e/run.mjs --only=workspace,profiles
   node e2e/run.mjs --skip=account,restart
   ```

   The run writes `e2e-out/<run id>/report.md`, `results.json` and screenshots,
   and exits non-zero when a step failed or an error on screen has no report.

Scenarios create their own workspaces and profiles named `e2e <run id> …` and
delete them at the end. They never touch existing profiles except where the
checklist says so.

## Options

| Variable | Meaning |
| --- | --- |
| `E2E_CDP` / `--cdp` | The app's debugging endpoint, `http://127.0.0.1:9333` by default. |
| `E2E_REPORTS_CMD` | A command that prints the backend log since the time given as its argument. `e2e/reports-kubectl.sh` reads the production backend with kubectl. Without it, reports are not checked. |
| `E2E_NBC_CMD` | nbc with the app's environment. Used only to observe results the checklist checks by hand, such as a profile's exit country. Without it, those checks are blocked. |
| `E2E_MANUAL_PROXY` | `scheme://user:pass@host:port` for the "create a proxy" step. |
| `E2E_MANUAL_PROXY_NAME` | The name of a saved proxy for profiles that use one. |
| `E2E_AGENT` | The agent to test in chat and terminal (`claude`, `codex`); the connected one by default. |
| `E2E_SECOND_ACCOUNT` | Set when a second account can sign in during the account step. |
| `E2E_RESTART_CMD` | A command that quits and starts the app again with the same flags, for the restart step. |
| `E2E_FLUSH_WAIT_MS` | How long to wait for the app's last batch of reports (45 s). |

A step is **blocked**, not failed, when it needs something this machine does not
have: a connector, a second account, a proxy, a command above.
