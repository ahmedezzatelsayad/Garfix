"use client";

import { useEffect, useState, useCallback } from "react";
import { CommandPalette } from "./CommandPalette";

/**
 * CommandPaletteProvider
 *
 * Mounts once near the root (inside AppShell) and:
 *   - Listens for Ctrl+K (Windows/Linux) and Cmd+K (Mac) globally to toggle the palette
 *   - Listens for a custom DOM event `garfix:open-command-palette` so other
 *     components (e.g. the Topbar search button) can open the palette programmatically
 *   - Renders <CommandPalette> when open
 */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const closePalette = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+K (Win/Linux) or Cmd+K (Mac)
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((s) => !s);
      }
    };
    // Custom event for programmatic open (e.g. from Topbar button)
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("garfix:open-command-palette", onOpenEvent as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("garfix:open-command-palette", onOpenEvent as EventListener);
    };
  }, []);

  return (
    <>
      {children}
      <CommandPalette open={open} onClose={closePalette} />
    </>
  );
}

export default CommandPaletteProvider;
