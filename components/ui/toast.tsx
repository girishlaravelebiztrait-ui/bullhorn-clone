"use client";

import { Toaster as SonnerToaster, toast } from "sonner";

/** App-wide toast host. Mounted once in the root layout. */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "!rounded-lg !border !border-border !bg-surface !text-foreground !shadow-lg",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
          success: "!text-success-text",
          error: "!text-danger-text",
        },
      }}
    />
  );
}

export { toast };
