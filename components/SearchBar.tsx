"use client";

import { useEffect, useRef, useState } from "react";

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

  // Keep in sync if the URL value changes externally (e.g. back button).
  useEffect(() => setValue(initialValue), [initialValue]);

  // Fetch typeahead suggestions (debounced).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    // Don't suggest for boolean expressions / very short input.
    if (q.length < 2 || /[()"]|(\bAND\b|\bOR\b|\bNOT\b)/i.test(q)) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/candidates/suggest?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions ?? []);
        }
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
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
        <input
          className="input"
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
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                onClick={() => {
                  setValue(s);
                  submit(s);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
