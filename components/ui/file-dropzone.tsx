"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  files?: File[];
  onRemove?: (index: number) => void;
  hint?: string;
  disabled?: boolean;
}

export function FileDropzone({
  accept,
  multiple,
  onFiles,
  files,
  onRemove,
  hint,
  disabled,
}: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) onFiles(multiple ? dropped : dropped.slice(0, 1));
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging
            ? "border-primary bg-primary-subtle"
            : "border-border bg-muted/40 hover:border-primary/50 hover:bg-muted",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <UploadCloud className={cn("h-8 w-8", dragging ? "text-primary" : "text-muted-foreground")} />
        <span className="text-sm font-medium text-foreground">
          <span className="text-primary">Click to upload</span> or drag and drop
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) onFiles(picked);
          e.target.value = "";
        }}
      />

      {files && files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">
                {(f.size / 1024).toFixed(0)} KB
              </span>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="text-muted-foreground hover:text-danger-text"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
