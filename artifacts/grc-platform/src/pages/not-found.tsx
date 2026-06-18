import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: 40 }}>
      <div style={{ fontSize: 48, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "#1E3A5F", opacity: 0.2, marginBottom: 12 }}>404</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1E3A5F", margin: "0 0 8px" }}>Page not found</h2>
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 20px" }}>The page you're looking for doesn't exist.</p>
      <button onClick={() => navigate("/")} style={{ background: "linear-gradient(135deg, #1E3A5F, #065F46)", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit" }}>Back to Dashboard</button>
    </div>
  );
}
