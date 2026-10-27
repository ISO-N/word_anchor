"use client";

import { DataBackup } from "@/components/data-backup";
import { DataPlaceholder } from "@/components/data-placeholder";
import { WordManager } from "@/components/word-manager";
import { useAppData } from "@/lib/use-app-data";

export default function WordsPage() {
  const data = useAppData();

  if (!data) {
    return <DataPlaceholder />;
  }

  return (
    <div className="shell page-shell">
      <WordManager words={data.words} />
      <DataBackup />
    </div>
  );
}
