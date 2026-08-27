interface ActivityLogEntry {
  id: string;
  action: string;
  changes: unknown;
  createdAt: string;
  admin: { name: string | null; email: string | null } | null;
}

const ACTION_STYLES: Record<string, string> = {
  created: "bg-green-100 text-green-800",
  updated: "bg-blue-100 text-blue-800",
  deleted: "bg-red-100 text-red-800",
  imported: "bg-purple-100 text-purple-800",
};

function renderChanges(changes: unknown): string[] {
  if (!changes || typeof changes !== "object") return [];
  const obj = changes as Record<string, unknown>;
  const inner = (obj.changes ?? null) as Record<string, unknown> | null;
  if (inner && typeof inner === "object") {
    return Object.entries(inner).map(([field, val]) => {
      const v = val as { from?: unknown; to?: unknown };
      const fmt = (x: unknown) =>
        x == null ? "—" : Array.isArray(x) ? x.join(", ") : String(x);
      return `${field}: ${fmt(v.from)} → ${fmt(v.to)}`;
    });
  }
  return [];
}

export function ActivityLog({ logs }: { logs: ActivityLogEntry[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-gray-500">No activity recorded yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {logs.map((log) => {
        const changeLines = renderChanges(log.changes);
        return (
          <li key={log.id} className="border-l-2 border-gray-200 pl-3">
            <div className="flex items-center gap-2">
              <span className={`badge ${ACTION_STYLES[log.action] ?? "bg-gray-100 text-gray-700"}`}>
                {log.action}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(log.createdAt).toLocaleString()}
                {log.admin ? ` · ${log.admin.name || log.admin.email}` : ""}
              </span>
            </div>
            {changeLines.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                {changeLines.slice(0, 12).map((line, i) => (
                  <li key={i} className="font-mono">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
