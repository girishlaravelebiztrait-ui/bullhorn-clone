"use client";

import type { SearchResult } from "@/lib/candidate-search";
import { CANDIDATE_STATUSES, CANDIDATE_SOURCES } from "@/lib/validators";

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

  // Merge known enum values with observed buckets so options never disappear
  // when a filter narrows results to zero of a value.
  const statusOptions = mergeBuckets(CANDIDATE_STATUSES as readonly string[], facets.status);
  const sourceOptions = mergeBuckets(CANDIDATE_SOURCES as readonly string[], facets.source);

  return (
    <div className="space-y-6 text-sm">
      {degraded && (
        <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          Search index offline — facet counts unavailable (showing DB results).
        </p>
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
        limit={15}
      />
      <CheckboxFacet
        title="Tags"
        options={facets.tags}
        selected={selection.tags}
        onToggle={(v) => update({ tags: toggle(selection.tags, v) })}
        limit={15}
      />
      <CheckboxFacet
        title="City"
        options={facets.city}
        selected={selection.city}
        onToggle={(v) => update({ city: toggle(selection.city, v) })}
        limit={12}
      />

      <div>
        <h3 className="mb-2 font-medium text-gray-900">Experience (years)</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder="Min"
            className="input"
            value={selection.minExperience ?? ""}
            onChange={(e) =>
              update({ minExperience: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
          <span className="text-gray-400">–</span>
          <input
            type="number"
            min={0}
            placeholder="Max"
            className="input"
            value={selection.maxExperience ?? ""}
            onChange={(e) =>
              update({ maxExperience: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900">Date added</h3>
        <div className="space-y-2">
          <input
            type="date"
            className="input"
            value={selection.createdFrom ?? ""}
            onChange={(e) => update({ createdFrom: e.target.value || undefined })}
          />
          <input
            type="date"
            className="input"
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
  // Always show selected values even if beyond the limit.
  const extraSelected = selected.filter((s) => !shown.some((o) => o.key === s));

  return (
    <div>
      <h3 className="mb-2 font-medium text-gray-900">{title}</h3>
      {options.length === 0 && extraSelected.length === 0 ? (
        <p className="text-xs text-gray-400">No values</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((o) => (
            <li key={o.key}>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(o.key)}
                  onChange={() => onToggle(o.key)}
                  className="rounded border-gray-300"
                />
                <span className="flex-1 truncate">{o.key}</span>
                <span className="text-xs text-gray-400">{o.count}</span>
              </label>
            </li>
          ))}
          {extraSelected.map((s) => (
            <li key={s}>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked
                  onChange={() => onToggle(s)}
                  className="rounded border-gray-300"
                />
                <span className="flex-1 truncate">{s}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
