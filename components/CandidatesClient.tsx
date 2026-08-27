"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { SearchResult } from "@/lib/candidate-search";
import type { CandidateView } from "@/lib/candidate";
import { CANDIDATE_STATUSES } from "@/lib/validators";
import { SearchBar } from "./SearchBar";
import { Facets, type FacetSelection } from "./Facets";
import { ConfirmDialog } from "./ConfirmDialog";

const EMPTY_RESULT: SearchResult = {
  hits: [],
  total: 0,
  page: 1,
  pageSize: 20,
  facets: { skills: [], tags: [], status: [], source: [], city: [] },
  usedFallback: false,
};

const MULTI_KEYS = ["skills", "tags", "status", "source", "city"] as const;

export function CandidatesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState<SearchResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>(CANDIDATE_STATUSES[0]);
  const [confirm, setConfirm] = useState<null | { kind: "bulkDelete" | "rowDelete"; id?: string }>(
    null
  );
  const [working, setWorking] = useState(false);

  const qsString = searchParams.toString();

  // Derive typed values from the URL for the controls.
  const q = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "relevance";
  const page = parseInt(searchParams.get("page") ?? "1", 10) || 1;

  const selection: FacetSelection = useMemo(
    () => ({
      skills: searchParams.getAll("skills"),
      tags: searchParams.getAll("tags"),
      status: searchParams.getAll("status"),
      source: searchParams.getAll("source"),
      city: searchParams.getAll("city"),
      minExperience: numParam(searchParams.get("minExperience")),
      maxExperience: numParam(searchParams.get("maxExperience")),
      createdFrom: searchParams.get("createdFrom") ?? undefined,
      createdTo: searchParams.get("createdTo") ?? undefined,
    }),
    [searchParams]
  );

  // Fetch results whenever the query string changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/candidates?${qsString}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Search failed");
        return res.json();
      })
      .then((data: SearchResult) => {
        if (!cancelled) {
          setResult(data);
          setSelected(new Set()); // reset selection on new result set
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [qsString]);

  // Build a new query string from the current one plus overrides.
  const pushParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(qsString);
      mutate(p);
      router.push(`/admin/candidates?${p.toString()}`);
    },
    [qsString, router]
  );

  const applySearch = (value: string) =>
    pushParams((p) => {
      if (value) p.set("q", value);
      else p.delete("q");
      p.delete("page");
    });

  const applyFacets = (next: FacetSelection) =>
    pushParams((p) => {
      for (const key of MULTI_KEYS) {
        p.delete(key);
        for (const v of next[key]) p.append(key, v);
      }
      setOrDelete(p, "minExperience", next.minExperience?.toString());
      setOrDelete(p, "maxExperience", next.maxExperience?.toString());
      setOrDelete(p, "createdFrom", next.createdFrom);
      setOrDelete(p, "createdTo", next.createdTo);
      p.delete("page");
    });

  const applySort = (value: string) =>
    pushParams((p) => {
      p.set("sort", value);
      p.delete("page");
    });

  const applyPage = (value: number) =>
    pushParams((p) => p.set("page", String(value)));

  const clearAll = () => router.push("/admin/candidates");

  // Selection helpers.
  const allOnPageSelected =
    result.hits.length > 0 && result.hits.every((h) => selected.has(h.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) result.hits.forEach((h) => next.delete(h.id));
      else result.hits.forEach((h) => next.add(h.id));
      return next;
    });
  };
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Bulk actions.
  async function runBulk(body: object) {
    setWorking(true);
    try {
      const res = await fetch("/api/candidates/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Bulk action failed");
      setSelected(new Set());
      setConfirm(null);
      // Re-fetch by nudging the router (same params → effect re-runs via refresh).
      router.refresh();
      const data = await fetch(`/api/candidates?${qsString}`).then((r) => r.json());
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setWorking(false);
    }
  }

  async function deleteRow(id: string) {
    setWorking(true);
    try {
      const res = await fetch(`/api/candidates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setConfirm(null);
      const data = await fetch(`/api/candidates?${qsString}`).then((r) => r.json());
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setWorking(false);
    }
  }

  const selectedIds = Array.from(selected);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const exportAllHref = `/api/candidates/export?${qsString}`;
  const exportSelectedHref = `/api/candidates/export?ids=${selectedIds.join(",")}`;
  const hasActiveFilters =
    q ||
    MULTI_KEYS.some((k) => selection[k].length) ||
    selection.minExperience != null ||
    selection.maxExperience != null ||
    selection.createdFrom ||
    selection.createdTo;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500">
            {loading ? "Searching…" : `${result.total.toLocaleString()} result(s)`}
            {result.usedFallback && " · degraded mode"}
          </p>
        </div>
        <Link href="/admin/candidates/new" className="btn-primary">
          + Add candidate
        </Link>
      </div>

      {/* Search + sort + export toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBar initialValue={q} onSearch={applySearch} />
        <select className="input w-auto" value={sort} onChange={(e) => applySort(e.target.value)}>
          <option value="relevance">Relevance</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name_asc">Name A–Z</option>
          <option value="name_desc">Name Z–A</option>
        </select>
        <a href={exportAllHref} className="btn-secondary">
          Export filtered (CSV)
        </a>
        {hasActiveFilters && (
          <button onClick={clearAll} className="btn-secondary">
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        {/* Facets */}
        <aside className="card h-fit p-4">
          <Facets
            facets={result.facets}
            selection={selection}
            onChange={applyFacets}
            degraded={result.usedFallback}
          />
        </aside>

        {/* Results */}
        <div>
          {/* Bulk action bar */}
          {selectedIds.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-brand-50 px-4 py-3 text-sm">
              <span className="font-medium text-brand-800">
                {selectedIds.length} selected
              </span>
              <select
                className="input w-auto py-1"
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
              >
                {CANDIDATE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                className="btn-secondary py-1"
                disabled={working}
                onClick={() =>
                  runBulk({ action: "updateStatus", ids: selectedIds, status: bulkStatus })
                }
              >
                Set status
              </button>
              <a href={exportSelectedHref} className="btn-secondary py-1">
                Export selected
              </a>
              <button
                className="btn-danger py-1"
                disabled={working}
                onClick={() => setConfirm({ kind: "bulkDelete" })}
              >
                Delete
              </button>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <SortableHeader label="Name" sortKey="name_asc" altKey="name_desc" current={sort} onSort={applySort} />
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Phone</th>
                    <th className="px-3 py-3">Employer</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Tags</th>
                    <th className="px-3 py-3">Source</th>
                    <SortableHeader label="Added" sortKey="newest" altKey="oldest" current={sort} onSort={applySort} />
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-10 text-center text-gray-400">
                        Loading…
                      </td>
                    </tr>
                  ) : result.hits.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-10 text-center text-gray-400">
                        No candidates found.
                      </td>
                    </tr>
                  ) : (
                    result.hits.map((c) => (
                      <CandidateRow
                        key={c.id}
                        c={c}
                        selected={selected.has(c.id)}
                        onToggle={() => toggleOne(c.id)}
                        onDelete={() => setConfirm({ kind: "rowDelete", id: c.id })}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {result.total > result.pageSize && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Page {result.page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-secondary py-1"
                  disabled={page <= 1}
                  onClick={() => applyPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn-secondary py-1"
                  disabled={page >= totalPages}
                  onClick={() => applyPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm?.kind === "bulkDelete"}
        title="Delete candidates"
        message={`Delete ${selectedIds.length} selected candidate(s)? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={working}
        onConfirm={() => runBulk({ action: "delete", ids: selectedIds })}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "rowDelete"}
        title="Delete candidate"
        message="Delete this candidate? This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={working}
        onConfirm={() => confirm?.id && deleteRow(confirm.id)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-green-100 text-green-800",
  Placed: "bg-blue-100 text-blue-800",
  "Do Not Contact": "bg-orange-100 text-orange-800",
  Blacklisted: "bg-red-100 text-red-800",
};

function CandidateRow({
  c,
  selected,
  onToggle,
  onDelete,
}: {
  c: CandidateView;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const go = () => router.push(`/admin/candidates/${c.id}`);
  return (
    <tr className={selected ? "bg-brand-50/50" : "hover:bg-gray-50"}>
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="rounded border-gray-300"
        />
      </td>
      <td className="cursor-pointer px-3 py-3 font-medium text-gray-900" onClick={go}>
        {c.firstName} {c.lastName}
      </td>
      <td className="cursor-pointer px-3 py-3 text-gray-600" onClick={go}>
        {c.email}
      </td>
      <td className="px-3 py-3 text-gray-600">{c.phone ?? "—"}</td>
      <td className="px-3 py-3 text-gray-600">
        {c.currentEmployer ?? "—"}
        {c.currentTitle ? <span className="block text-xs text-gray-400">{c.currentTitle}</span> : null}
      </td>
      <td className="px-3 py-3">
        <span className={`badge ${STATUS_STYLES[c.status] ?? "bg-gray-100 text-gray-700"}`}>
          {c.status}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {c.tags.slice(0, 3).map((t) => (
            <span key={t} className="badge bg-gray-100 text-gray-700">
              {t}
            </span>
          ))}
          {c.tags.length > 3 && <span className="text-xs text-gray-400">+{c.tags.length - 3}</span>}
        </div>
      </td>
      <td className="px-3 py-3 text-gray-600">{c.source}</td>
      <td className="px-3 py-3 text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <button onClick={onDelete} className="text-xs text-red-600 hover:underline">
          Delete
        </button>
      </td>
    </tr>
  );
}

function SortableHeader({
  label,
  sortKey,
  altKey,
  current,
  onSort,
}: {
  label: string;
  sortKey: string;
  altKey: string;
  current: string;
  onSort: (v: string) => void;
}) {
  const active = current === sortKey || current === altKey;
  const arrow = current === sortKey ? "↑" : current === altKey ? "↓" : "";
  return (
    <th className="px-3 py-3">
      <button
        className={`inline-flex items-center gap-1 uppercase ${active ? "text-brand-700" : ""}`}
        onClick={() => onSort(current === sortKey ? altKey : sortKey)}
      >
        {label} <span>{arrow}</span>
      </button>
    </th>
  );
}

function numParam(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function setOrDelete(p: URLSearchParams, key: string, value?: string) {
  if (value === undefined || value === "") p.delete(key);
  else p.set(key, value);
}
