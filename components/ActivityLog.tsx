import { Plus, Pencil, Trash2, Download, Clock } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";

interface ActivityLogEntry {
  id: string;
  action: string;
  changes: unknown;
  createdAt: string;
  admin: { name: string | null; email: string | null } | null;
}

const ACTION_META: Record<string, { variant: NonNullable<BadgeProps["variant"]>; icon: React.ReactNode }> = {
  created: { variant: "success", icon: <Plus /> },
  updated: { variant: "info", icon: <Pencil /> },
  deleted: { variant: "danger", icon: <Trash2 /> },
  imported: { variant: "primary", icon: <Download /> },
};

function renderChanges(changes: unknown): string[] {
  if (!changes || typeof changes !== "object") return [];
  const inner = (changes as Record<string, unknown>).changes as Record<string, unknown> | null;
  if (inner && typeof inner === "object") {
    return Object.entries(inner).map(([field, val]) => {
      const v = val as { from?: unknown; to?: unknown };
      const fmt = (x: unknown) => (x == null ? "—" : Array.isArray(x) ? x.join(", ") : String(x));
      return `${field}: ${fmt(v.from)} → ${fmt(v.to)}`;
    });
  }
  return [];
}

export function ActivityLog({ logs }: { logs: ActivityLogEntry[] }) {
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <Clock className="mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
      </div>
    );
  }
  return (
    <ol className="relative space-y-5 pl-6 before:absolute before:left-[9px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
      {logs.map((log) => {
        const meta = ACTION_META[log.action] ?? { variant: "neutral" as const, icon: <Clock /> };
        const changeLines = renderChanges(log.changes);
        return (
          <li key={log.id} className="relative">
            <span className="absolute -left-6 top-0.5 flex h-[19px] w-[19px] items-center justify-center rounded-full bg-surface ring-1 ring-border [&_svg]:h-3 [&_svg]:w-3 [&_svg]:text-muted-foreground">
              {meta.icon}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={meta.variant}>{log.action}</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
            {log.admin && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                by {log.admin.name || log.admin.email}
              </p>
            )}
            {changeLines.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                {changeLines.slice(0, 12).map((line, i) => (
                  <li key={i} className="font-mono">{line}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
