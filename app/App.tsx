"use client";

import { CustomChat } from "@/components/CustomChat";

export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-end bg-slate-100 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-5xl">
        <CustomChat />
      </div>
    </main>
  );
}
