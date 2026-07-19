"use client";

export function FullScreenLoader() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        background: "linear-gradient(135deg, #0f0a1e 0%, #1e1147 50%, #2d1b69 100%)",
      }}
    >
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "16px",
          background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "32px",
          fontWeight: 900,
          color: "#fff",
          boxShadow: "0 12px 36px rgba(124, 58, 237, 0.4)",
          animation: "garfix-pulse-glow 2s infinite",
        }}
      >
        G
      </div>
      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", fontFamily: "var(--font-cairo)" }}>
        جارٍ التحميل…
      </div>
    </div>
  );
}
