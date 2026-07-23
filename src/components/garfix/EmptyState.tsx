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
    <div
      style={{
        padding: "48px",
        textAlign: "center",
        color: "var(--muted-foreground)",
      }}
    >
      <div style={{ marginBottom: "12px", opacity: 0.3 }}>
        {icon || <Inbox size={36} />}
      </div>
      <div
        style={{
          fontSize: "14px",
          fontWeight: 700,
          marginBottom: "4px",
          color: "var(--foreground)",
        }}
      >
        {title}
      </div>
      {description && <div style={{ fontSize: "12px" }}>{description}</div>}
      {action && <div style={{ marginTop: "16px" }}>{action}</div>}
    </div>
  );
}

export default EmptyState;
