"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  SlidersHorizontal,
  Download,
  Plus,
  X,
  Trash2,
  Users,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { SearchResult } from "@/lib/candidate-search";
import type { CandidateView } from "@/lib/candidate";
import { CANDIDATE_STATUSES } from "@/lib/validators";
import { cn } from "@/lib/utils";
import { SearchBar } from "./SearchBar";
import { Facets, type FacetSelection } from "./Facets";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>(CANDIDATE_STATUSES[0]);
  const [confirm, setConfirm] = useState<null | { kind: "bulkDelete" | "rowDelete"; id?: string }>(null);
  const [working, setWorking] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const qsString = searchParams.toString();
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

  const activeFilterCount =
    MULTI_KEYS.reduce((n, k) => n + selection[k].length, 0) +
    (selection.minExperience != null ? 1 : 0) +
    (selection.maxExperience != null ? 1 : 0) +
    (selection.createdFrom ? 1 : 0) +
    (selection.createdTo ? 1 : 0);

  const refetch = useCallback(async () => {
    const data = await fetch(`/api/candidates?${qsString}`).then((r) => r.json());
    setResult(data);
  }, [qsString]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/candidates?${qsString}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Search failed");
        return res.json();
      })
      .then((data: SearchResult) => {
        if (!cancelled) {
          setResult(data);
          setSelected(new Set());
        }
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [qsString]);

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
      value ? p.set("q", value) : p.delete("q");
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

  const applySort = (value: string) => pushParams((p) => (p.set("sort", value), p.delete("page")));
  const applyPage = (value: number) => pushParams((p) => p.set("page", String(value)));
  const clearAll = () => router.push("/admin/candidates");

  const allOnPageSelected = result.hits.length > 0 && result.hits.every((h) => selected.has(h.id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) result.hits.forEach((h) => next.delete(h.id));
      else result.hits.forEach((h) => next.add(h.id));
      return next;
    });
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectedIds = Array.from(selected);

  async function runBulk(body: { action: "updateStatus" | "delete"; ids: string[]; status?: string }) {
    setWorking(true);
    try {
      const res = await fetch("/api/candidates/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk action failed");
      setSelected(new Set());
      setConfirm(null);
      await refetch();
      toast.success(
        body.action === "delete"
          ? `Deleted ${data.count} candidate(s)`
          : `Updated ${data.count} candidate(s) to ${body.status}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk action failed");
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
      await refetch();
      toast.success("Candidate deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setWorking(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const exportAllHref = `/api/candidates/export?${qsString}`;
  const exportSelectedHref = `/api/candidates/export?ids=${selectedIds.join(",")}`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Candidates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Searching…" : `${result.total.toLocaleString()} candidate(s)`}
            {result.usedFallback && " · degraded mode"}
          </p>
        </div>
        <Link href="/admin/candidates/new">
          <Button>
            <Plus /> Add candidate
          </Button>
        </Link>
      </div>

      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
        <SearchBar initialValue={q} onSearch={applySearch} />
        <Button
          variant="secondary"
          onClick={() => setFiltersOpen((v) => !v)}
          className={cn(activeFilterCount > 0 && "border-primary/40 text-primary")}
        >
          <SlidersHorizontal /> Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
        <Select
          className="w-auto min-w-[9rem]"
          value={sort}
          onChange={(e) => applySort(e.target.value)}
        >
          <option value="relevance">Relevance</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name_asc">Name A–Z</option>
          <option value="name_desc">Name Z–A</option>
        </Select>
        <a href={exportAllHref}>
          <Button variant="secondary">
            <Download /> <span className="hidden sm:inline">Export</span>
          </Button>
        </a>
        {(activeFilterCount > 0 || q) && (
          <Button variant="ghost" onClick={clearAll}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex gap-6">
        {/* Filter panel: static left column on desktop, right drawer on mobile */}
        {filtersOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-foreground/40 animate-overlay-in lg:hidden"
              onClick={() => setFiltersOpen(false)}
            />
            <aside className="fixed right-0 top-0 z-50 h-full w-80 overflow-y-auto bg-surface p-5 shadow-lg animate-slide-in-right lg:static lg:z-auto lg:h-fit lg:w-72 lg:shrink-0 lg:animate-none lg:rounded-xl lg:border lg:border-border lg:p-5 lg:shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-foreground">Filters</h2>
                <button
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Facets
                facets={result.facets}
                selection={selection}
                onChange={applyFacets}
                degraded={result.usedFallback}
              />
            </aside>
          </>
        )}

        {/* Results */}
        <div className="min-w-0 flex-1">
          {loading ? (
            <LoadingState />
          ) : result.hits.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users />}
                title="No candidates found"
                description={
                  q || activeFilterCount > 0
                    ? "Try adjusting your search or filters."
                    : "Get started by adding a candidate or importing a file."
                }
                action={
                  q || activeFilterCount > 0 ? (
                    <Button variant="secondary" onClick={clearAll}>
                      Clear filters
                    </Button>
                  ) : (
                    <Link href="/admin/candidates/new">
                      <Button>
                        <Plus /> Add candidate
                      </Button>
                    </Link>
                  )
                }
              />
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th className="w-10">
                          <input
                            type="checkbox"
                            checked={allOnPageSelected}
                            onChange={toggleAll}
                            className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                          />
                        </Th>
                        <SortHeader label="Name" asc="name_asc" desc="name_desc" current={sort} onSort={applySort} />
                        <Th>Email</Th>
                        <Th>Employer</Th>
                        <Th>Status</Th>
                        <Th>Tags</Th>
                        <Th>Source</Th>
                        <SortHeader label="Added" asc="oldest" desc="newest" current={sort} onSort={applySort} />
                        <Th className="w-10" />
                      </Tr>
                    </THead>
                    <TBody>
                      {result.hits.map((c) => (
                        <CandidateRow
                          key={c.id}
                          c={c}
                          selected={selected.has(c.id)}
                          onToggle={() => toggleOne(c.id)}
                          onDelete={() => setConfirm({ kind: "rowDelete", id: c.id })}
                        />
                      ))}
                    </TBody>
                  </Table>
                </div>
              </Card>

              {/* Mobile stacked cards */}
              <div className="space-y-3 md:hidden">
                {result.hits.map((c) => (
                  <CandidateCard
                    key={c.id}
                    c={c}
                    selected={selected.has(c.id)}
                    onToggle={() => toggleOne(c.id)}
                    onDelete={() => setConfirm({ kind: "rowDelete", id: c.id })}
                  />
                ))}
              </div>

              <div className="mt-5">
                <Pagination
                  page={result.page}
                  totalPages={totalPages}
                  total={result.total}
                  pageSize={result.pageSize}
                  onPageChange={applyPage}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Slide-in bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 animate-slide-up">
          <div className="flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5 shadow-lg sm:gap-3">
            <span className="pl-2 text-sm font-medium text-foreground">
              {selectedIds.length} selected
            </span>
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <Select
              className="h-9 w-auto"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
            >
              {CANDIDATE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              disabled={working}
              onClick={() => runBulk({ action: "updateStatus", ids: selectedIds, status: bulkStatus })}
            >
              Set status
            </Button>
            <a href={exportSelectedHref}>
              <Button variant="secondary" size="sm">
                <Download /> Export
              </Button>
            </a>
            <Button
              variant="destructive"
              size="sm"
              disabled={working}
              onClick={() => setConfirm({ kind: "bulkDelete" })}
            >
              <Trash2 /> Delete
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="icon-sm" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm?.kind === "bulkDelete"}
        title="Delete candidates"
        message={`Delete ${selectedIds.length} selected candidate(s)? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={working}
        onConfirm={() => runBulk({ action: "delete", ids: selectedIds })}
        onOpenChange={(o) => !o && setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "rowDelete"}
        title="Delete candidate"
        message="Delete this candidate? This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={working}
        onConfirm={() => confirm?.id && deleteRow(confirm.id)}
        onOpenChange={(o) => !o && setConfirm(null)}
      />
    </div>
  );
}

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
    <Tr className={cn("transition-colors", selected ? "bg-primary-subtle/50" : "hover:bg-muted/50")}>
      <Td onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
        />
      </Td>
      <Td className="cursor-pointer font-medium text-foreground" onClick={go}>
        {c.firstName} {c.lastName}
        {c.currentTitle && (
          <span className="block text-xs font-normal text-muted-foreground">{c.currentTitle}</span>
        )}
      </Td>
      <Td className="cursor-pointer text-muted-foreground" onClick={go}>
        {c.email}
      </Td>
      <Td className="text-muted-foreground">{c.currentEmployer ?? "—"}</Td>
      <Td>
        <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
      </Td>
      <Td>
        <TagChips tags={c.tags} />
      </Td>
      <Td className="text-muted-foreground">{c.source}</Td>
      <Td className="whitespace-nowrap text-muted-foreground">
        {new Date(c.createdAt).toLocaleDateString()}
      </Td>
      <Td onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-danger-text"
          aria-label="Delete candidate"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </Td>
    </Tr>
  );
}

function CandidateCard({
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
  return (
    <Card className={cn("p-4", selected && "ring-2 ring-primary/40")}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
        />
        <Link href={`/admin/candidates/${c.id}`} className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium text-foreground">
              {c.firstName} {c.lastName}
            </p>
            <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{c.email}</p>
          {(c.currentTitle || c.currentEmployer) && (
            <p className="mt-1 truncate text-sm text-foreground">
              {[c.currentTitle, c.currentEmployer].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="mt-2">
            <TagChips tags={c.tags} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {c.source} · added {new Date(c.createdAt).toLocaleDateString()}
          </p>
        </Link>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-danger-subtle hover:text-danger-text"
          aria-label="Delete candidate"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}

function TagChips({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 2).map((t) => (
        <Badge key={t} variant="neutral">
          {t}
        </Badge>
      ))}
      {tags.length > 2 && <Badge variant="neutral">+{tags.length - 2}</Badge>}
    </div>
  );
}

function SortHeader({
  label,
  asc,
  desc,
  current,
  onSort,
}: {
  label: string;
  asc: string;
  desc: string;
  current: string;
  onSort: (v: string) => void;
}) {
  const isAsc = current === asc;
  const isDesc = current === desc;
  return (
    <Th>
      <button
        className={cn(
          "inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground",
          (isAsc || isDesc) && "text-primary"
        )}
        onClick={() => onSort(isDesc ? asc : desc)}
      >
        {label}
        {isAsc && <ArrowUp className="h-3 w-3" />}
        {isDesc && <ArrowDown className="h-3 w-3" />}
      </button>
    </Th>
  );
}

function LoadingState() {
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="hidden h-4 w-48 sm:block" />
            <div className="flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="hidden h-4 w-20 md:block" />
          </div>
        ))}
      </div>
    </Card>
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
