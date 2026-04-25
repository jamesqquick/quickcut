import type { ReactNode } from "react";

interface VideoPageLayoutProps {
  leftColumn: ReactNode;
  rightColumn: ReactNode;
}

export function VideoPageLayout({ leftColumn, rightColumn }: VideoPageLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">{leftColumn}</div>
      <div className="flex flex-col rounded-xl border border-border-default bg-bg-secondary">
        {rightColumn}
      </div>
    </div>
  );
}
