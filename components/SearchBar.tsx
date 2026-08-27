"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

interface SearchBarProps {
  initialValue: string;
  onSearch: (value: string) => void;
}

export function SearchBar({ initialValue, onSearch }: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => setValue(initialValue), [initialValue]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2 || /[()"]|(\bAND\b|\bOR\b|\bNOT\b)/i.test(q)) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/candidates/suggest?q=${encodeURIComponent(q)}`);
        if (res.ok) setSuggestions((await res.json()).suggestions ?? []);
      } catch {
        /* best effort */
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function submit(v: string) {
    setOpen(false);
    onSearch(v.trim());
  }

  return (
    <div ref={boxRef} className="relative flex-1">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-10 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
          placeholder='Search — supports AND, OR, NOT, "phrases", ( )'
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </form>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface p-1 shadow-popover">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setValue(s);
                  submit(s);
                }}
              >
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
