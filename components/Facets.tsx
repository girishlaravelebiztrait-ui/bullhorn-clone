"use client";

import { AlertTriangle } from "lucide-react";
import type { SearchResult } from "@/lib/candidate-search";
import { CANDIDATE_STATUSES, CANDIDATE_SOURCES } from "@/lib/validators";
import { Input } from "@/components/ui/input";

export interface FacetSelection {
  skills: string[];
  tags: string[];
  status: string[];
  source: string[];
  city: string[];
  minExperience?: number;
  maxExperience?: number;
  createdFrom?: string;
  createdTo?: string;
}

interface FacetsProps {
  facets: SearchResult["facets"];
  selection: FacetSelection;
  onChange: (next: FacetSelection) => void;
  degraded: boolean;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function Facets({ facets, selection, onChange, degraded }: FacetsProps) {
  const update = (patch: Partial<FacetSelection>) => onChange({ ...selection, ...patch });

  const statusOptions = mergeBuckets(CANDIDATE_STATUSES as readonly string[], facets.status);
  const sourceOptions = mergeBuckets(CANDIDATE_SOURCES as readonly string[], facets.source);

  return (
    <div className="space-y-6 text-sm">
      {degraded && (
        <div className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning-text">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Search index offline — facet counts unavailable (showing DB results).</span>
        </div>
      )}

      <CheckboxFacet
        title="Status"
        options={statusOptions}
        selected={selection.status}
        onToggle={(v) => update({ status: toggle(selection.status, v) })}
      />
      <CheckboxFacet
        title="Source"
        options={sourceOptions}
        selected={selection.source}
        onToggle={(v) => update({ source: toggle(selection.source, v) })}
      />
      <CheckboxFacet
        title="Skills"
        options={facets.skills}
        selected={selection.skills}
        onToggle={(v) => update({ skills: toggle(selection.skills, v) })}
        limit={12}
      />
      <CheckboxFacet
        title="Tags"
        options={facets.tags}
        selected={selection.tags}
        onToggle={(v) => update({ tags: toggle(selection.tags, v) })}
        limit={12}
      />
      <CheckboxFacet
        title="City"
        options={facets.city}
        selected={selection.city}
        onToggle={(v) => update({ city: toggle(selection.city, v) })}
        limit={10}
      />

      <div>
        <h3 className="mb-2 font-medium text-foreground">Experience (years)</h3>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Min"
            value={selection.minExperience ?? ""}
            onChange={(e) =>
              update({ minExperience: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            min={0}
            placeholder="Max"
            value={selection.maxExperience ?? ""}
            onChange={(e) =>
              update({ maxExperience: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-foreground">Date added</h3>
        <div className="space-y-2">
          <Input
            type="date"
            value={selection.createdFrom ?? ""}
            onChange={(e) => update({ createdFrom: e.target.value || undefined })}
          />
          <Input
            type="date"
            value={selection.createdTo ?? ""}
            onChange={(e) => update({ createdTo: e.target.value || undefined })}
          />
        </div>
      </div>
    </div>
  );
}

function mergeBuckets(
  known: readonly string[],
  buckets: { key: string; count: number }[]
): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const k of known) map.set(k, 0);
  for (const b of buckets) map.set(b.key, b.count);
  return Array.from(map.entries()).map(([key, count]) => ({ key, count }));
}

function CheckboxFacet({
  title,
  options,
  selected,
  onToggle,
  limit,
}: {
  title: string;
  options: { key: string; count: number }[];
  selected: string[];
  onToggle: (value: string) => void;
  limit?: number;
}) {
  const shown = limit ? options.slice(0, limit) : options;
  const extraSelected = selected.filter((s) => !shown.some((o) => o.key === s));

  return (
    <div>
      <h3 className="mb-2 font-medium text-foreground">{title}</h3>
      {options.length === 0 && extraSelected.length === 0 ? (
        <p className="text-xs text-muted-foreground">No values</p>
      ) : (
        <ul className="space-y-0.5">
          {[...shown, ...extraSelected.map((s) => ({ key: s, count: -1 }))].map((o) => (
            <li key={o.key}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
                <input
                  type="checkbox"
                  checked={selected.includes(o.key)}
                  onChange={() => onToggle(o.key)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="flex-1 truncate text-foreground">{o.key}</span>
                {o.count >= 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">{o.count}</span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
