/**
 * EmptyState — friendly empty-data placeholder.
 *
 * Drop this anywhere a list or table has no rows. Pass an icon, title,
 * optional description, and an optional action (button/CTA).
 */
"use client";

import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="p-12 text-center text-[var(--muted-foreground)]">
      <div className="mb-3 opacity-30">
        {icon || <Inbox size={36} />}
      </div>
      <div className="text-sm font-bold mb-1 text-[var(--foreground)]">
        {title}
      </div>
      {description && <div className="text-xs">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
