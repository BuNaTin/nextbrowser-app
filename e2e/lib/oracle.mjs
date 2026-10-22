// Checks that look at the result from outside the app, the way the checklist
// asks a tester to: which IP and country a profile's browser really uses.
// They run nbc with the app's environment (E2E_NBC_CMD) only to observe;
// every scenario action still goes through the UI.
import { execFile } from "node:child_process";
import { blocked } from "./blocked.mjs";

const RUNTIME = { Clawbrowser: "clawbrowser", DasBrowser: "dasbrowser", Camoufox: "camoufox", Multilogin: "multilogin" };

export function nbc(command, args, { timeoutMs = 120_000 } = {}) {
  if (!command) blocked("E2E_NBC_CMD is not set, so the browser's real exit country cannot be checked");
  const quoted = args.map((arg) => `'${String(arg).replace(/'/g, "'\\''")}'`).join(" ");
  return new Promise((resolve, reject) => {
    execFile("bash", ["-c", `${command} ${quoted}`], { maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
      const output = `${stdout}${stderr}`;
      const start = output.indexOf("{");
      let envelope;
      try { envelope = start >= 0 ? JSON.parse(output.slice(start)) : undefined; } catch { envelope = undefined; }
      if (envelope?.ok === false) reject(new Error(`nbc ${args[0]}: ${envelope.error?.code} ${envelope.error?.message}`));
      else if (envelope) resolve(envelope.data);
      else if (error) reject(new Error(`nbc ${args[0]}: ${output.trim().slice(0, 500) || error.message}`));
      else resolve(output);
    });
  });
}

/** The IP and country the profile's browser exits from (ipinfo.io). */
export async function exitCountry(command, profile, toolset = "Clawbrowser") {
  const runtime = RUNTIME[toolset] || "clawbrowser";
  const common = ["--profile", profile, "--runtime", runtime, "--format", "json"];
  await nbc(command, ["open", "https://ipinfo.io/json", "--new-tab", ...common]);
  const data = await nbc(command, ["eval", "document.body.innerText", ...common]);
  const text = typeof data === "string" ? data : data?.result ?? data?.value ?? JSON.stringify(data);
  const info = JSON.parse(String(text).slice(String(text).indexOf("{")));
  return { ip: info.ip, country: info.country };
}
