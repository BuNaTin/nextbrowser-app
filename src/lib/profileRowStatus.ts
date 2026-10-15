// The status line under a sidebar profile name. A profile another project is
// using already carries the "In use" badge, so the line names that project
// instead of repeating "In use": next to the badge a narrow sidebar cut the
// repeated text down to "In…".
export function profileRowStatusText({ status, ip, occupiedBy, metaOverride }: {
  status: string;
  ip?: string | null;
  occupiedBy?: string;
  metaOverride?: string;
}): string {
  if (metaOverride !== undefined) return metaOverride;
  if (occupiedBy) return occupiedBy;
  if (status === "starting") return "Starting and verifying";
  return ip ? `${status} · ${ip}` : status;
}
