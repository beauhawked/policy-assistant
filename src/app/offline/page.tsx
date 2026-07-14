import type { CSSProperties } from "react";

export const dynamic = "force-static";

const wrap: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "2rem",
  fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
  color: "#0f2433",
  background: "#f4f7f9",
};

const card: CSSProperties = {
  maxWidth: 440,
  textAlign: "center",
  border: "1px solid #e3eaf0",
  borderRadius: 16,
  background: "#ffffff",
  padding: "2rem 1.5rem",
  boxShadow: "0 1px 3px rgba(15,36,51,0.08)",
};

export default function OfflinePage() {
  return (
    <main style={wrap}>
      <div style={card}>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 54,
            height: 54,
            borderRadius: "50%",
            background: "#e3f2f6",
            color: "#155e75",
            marginBottom: "0.75rem",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="26"
            height="26"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 3l18 18" />
            <path d="M8.5 16.5a5 5 0 0 1 7 0" />
            <path d="M5 12.5a10 10 0 0 1 4-2.6" />
            <path d="M19 12.5a10 10 0 0 0-3-2.3" />
            <path d="M2 8.8A16 16 0 0 1 7 6" />
            <path d="M22 8.8a16 16 0 0 0-6.5-3" />
            <path d="M12 20h.01" />
          </svg>
        </span>
        <h1 style={{ fontSize: 22, margin: "0 0 0.4rem" }}>You&rsquo;re offline</h1>
        <p style={{ color: "#51647a", lineHeight: 1.5, margin: 0 }}>
          Policy to Action needs a connection to sign in and generate new policy guidance. Reconnect
          and try again — anything you&rsquo;ve already loaded will still be here.
        </p>
      </div>
    </main>
  );
}
