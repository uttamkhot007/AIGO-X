// @ts-nocheck
interface UpgradeModalProps {
  feature: string;
  plan: string;
  onClose: () => void;
}

export function UpgradeModal({ feature, plan, onClose }: UpgradeModalProps) {
  const mailto = `mailto:sales@aigo-x.com?subject=Upgrade%20Enquiry%20%E2%80%94%20${encodeURIComponent(feature)}&body=Hi%20AIGO%20Sales%2C%0A%0AI%20would%20like%20to%20enquire%20about%20upgrading%20my%20plan%20to%20access%20the%20${encodeURIComponent(feature)}%20module.%0A%0AThank%20you`;
  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:16, padding:"36px 40px", maxWidth:440, width:"90%", textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ fontSize:44, marginBottom:14 }}>🔒</div>
        <div style={{ fontSize:20, fontWeight:800, color:"var(--foreground)", marginBottom:10 }}>Add-on Not Licensed</div>
        <div style={{ fontSize:13, color:"var(--muted-foreground)", lineHeight:1.7, marginBottom:6 }}>
          <strong style={{ color:"var(--foreground)" }}>{feature}</strong> is not included in your current plan.
        </div>
        <div style={{ fontSize:12, color:"var(--muted-foreground)", marginBottom:28 }}>
          Current plan:{" "}
          <span style={{ fontWeight:700, textTransform:"uppercase", color:"var(--foreground)", background:"var(--input)", borderRadius:4, padding:"1px 8px" }}>
            {plan}
          </span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <a href={mailto} style={{ display:"block", background:"linear-gradient(135deg,#1E3A5F,#065F46)", color:"#fff", textDecoration:"none", borderRadius:8, padding:"12px 0", fontSize:13, fontWeight:700 }}>
            📧 Contact AIGO Sales
          </a>
          <button onClick={onClose} style={{ background:"transparent", border:"1px solid var(--border)", borderRadius:8, padding:"11px 0", fontSize:13, color:"var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
