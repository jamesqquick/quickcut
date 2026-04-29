import type { ReactNode } from "react";

interface VideoPageLayoutProps {
  topContent?: ReactNode;
  leftColumn: ReactNode;
  rightColumn?: ReactNode;
  bottomContent?: ReactNode;
}

export function VideoPageLayout({ topContent, leftColumn, rightColumn, bottomContent }: VideoPageLayoutProps) {
  if (!rightColumn) {
    return (
      <div className="space-y-6">
        {topContent && <div>{topContent}</div>}
        <div className="space-y-6">{leftColumn}</div>
        {bottomContent && <div>{bottomContent}</div>}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[1fr_380px]">
      {topContent && <div className="lg:col-span-2">{topContent}</div>}
      <div className="space-y-6">{leftColumn}</div>
      <div className="flex flex-col rounded-xl border border-border-default bg-bg-secondary">
        {rightColumn}
      </div>
      {bottomContent && (
        <div className="lg:col-start-1">{bottomContent}</div>
      )}
    </div>
  );
}
