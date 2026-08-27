import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={<div className="text-sm text-gray-400">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
