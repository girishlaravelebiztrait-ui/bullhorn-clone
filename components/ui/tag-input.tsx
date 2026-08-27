"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  className?: string;
}

/** Chip input: type + Enter (or comma) to add, click × to remove. */
export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions,
  className,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const chip = raw.trim();
    if (!chip) return;
    if (value.some((v) => v.toLowerCase() === chip.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, chip]);
    setDraft("");
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length) {
      remove(value.length - 1);
    }
  }

  const remaining = (suggestions ?? []).filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())
  );

  return (
    <div className={className}>
      <div className="flex min-h-[2.5rem] flex-wrap items-center gap-1.5 rounded-md border border-input bg-surface px-2 py-1.5 shadow-xs transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-surface">
        {value.map((chip, i) => (
          <span
            key={`${chip}-${i}`}
            className="inline-flex items-center gap-1 rounded-md bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary"
          >
            {chip}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-primary/70 hover:text-primary"
              aria-label={`Remove ${chip}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
          value={draft}
          placeholder={value.length === 0 ? placeholder : ""}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
        />
      </div>
      {remaining.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remaining.slice(0, 12).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className={cn(
                "rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              )}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
