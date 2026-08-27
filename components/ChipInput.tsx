"use client";

import { useState } from "react";

interface ChipInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}

export function ChipInput({ value, onChange, placeholder, suggestions }: ChipInputProps) {
  const [draft, setDraft] = useState("");

  function addChip(raw: string) {
    const chip = raw.trim();
    if (!chip) return;
    if (value.some((v) => v.toLowerCase() === chip.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, chip]);
    setDraft("");
  }

  function removeChip(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChip(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      removeChip(value.length - 1);
    }
  }

  const remainingSuggestions = (suggestions ?? []).filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 rounded-md border border-gray-300 p-2 shadow-sm focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        {value.map((chip, i) => (
          <span
            key={`${chip}-${i}`}
            className="badge bg-brand-50 text-brand-700"
          >
            {chip}
            <button
              type="button"
              onClick={() => removeChip(i)}
              className="ml-1 text-brand-500 hover:text-brand-700"
              aria-label={`Remove ${chip}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 border-0 p-0.5 text-sm focus:outline-none focus:ring-0"
          value={draft}
          placeholder={value.length === 0 ? placeholder : ""}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addChip(draft)}
        />
      </div>
      {remainingSuggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {remainingSuggestions.slice(0, 12).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addChip(s)}
              className="badge border border-dashed border-gray-300 text-gray-600 hover:border-brand-400 hover:text-brand-700"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
