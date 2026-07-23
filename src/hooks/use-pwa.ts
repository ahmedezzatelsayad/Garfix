"use client";

import { useEffect, useState, useCallback } from "react";

/* ── Types ───────────────────────────────────────────────────────────── */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PWAInstallResult {
  canInstall: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

interface PWAOfflineResult {
  isOffline: boolean;
  isOnline: boolean;
}

interface PWAUpdateResult {
  hasUpdate: boolean;
  isUpdating: boolean;
  applyUpdate: () => Promise<void>;
}

/* ── usePWAInstall ──────────────────────────────────────────────────── */

/**
 * Hook for PWA install prompt.
 * Captures the `beforeinstallprompt` event and provides a way to
 * trigger the native install dialog.
 */
export function usePWAInstall(): PWAInstallResult {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone: boolean }).standalone ||
      document.referrer.includes("android-app://");

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Listen for successful installation
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!installPrompt) return "unavailable";

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      return choice.outcome;
    } catch {
      return "unavailable";
    }
  }, [installPrompt]);

  return {
    canInstall: !!installPrompt && !isInstalled,
    isInstalled,
    promptInstall,
  };
}

/* ── useOfflineStatus ────────────────────────────────────────────────── */

/**
 * Hook for monitoring online/offline status.
 * Returns reactive boolean states that update when connectivity changes.
 */
export function useOfflineStatus(): PWAOfflineResult {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Initial state
    setIsOffline(!navigator.onLine);

    const onOffline = () => setIsOffline(true);
    const onOnline = () => setIsOffline(false);

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return {
    isOffline,
    isOnline: !isOffline,
  };
}

/* ── usePWAUpdate ────────────────────────────────────────────────────── */

/**
 * Hook for detecting and applying PWA service worker updates.
 * Monitors the service worker registration for new versions and
 * provides a method to apply the update (which refreshes the page).
 */
export function usePWAUpdate(): PWAUpdateResult {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const checkForUpdates = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return;

        // Listen for new service worker
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // New version available!
              setHasUpdate(true);
            }
          });
        });

        // Also check if there's a waiting worker already
        if (registration.waiting) {
          setHasUpdate(true);
        }

        // Force update check on mount
        registration.update();
      } catch {
        // Service worker not available
      }
    };

    checkForUpdates();

    // Check for updates periodically (every 30 minutes)
    const interval = setInterval(() => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) reg.update();
        }).catch(() => {});
      }
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const applyUpdate = useCallback(async (): Promise<void> => {
    if (!("serviceWorker" in navigator)) return;

    setIsUpdating(true);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        // Tell the waiting worker to activate
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      // Listen for controller change and refresh
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });
    } catch {
      // Fallback: just reload
      window.location.reload();
    }
  }, []);

  return {
    hasUpdate,
    isUpdating,
    applyUpdate,
  };
}

/* ── Composite Hook ──────────────────────────────────────────────────── */

/**
 * All-in-one PWA hook combining install, offline, and update functionality.
 */
export function usePWA() {
  const install = usePWAInstall();
  const offline = useOfflineStatus();
  const update = usePWAUpdate();

  return {
    ...install,
    ...offline,
    ...update,
  };
}

export default usePWA;
