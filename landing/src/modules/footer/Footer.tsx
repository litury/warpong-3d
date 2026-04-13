const footerStyle: React.CSSProperties = {
  padding: "48px 0",
  borderTop: "1px solid var(--border)",
};

const innerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 16,
};

const linksStyle: React.CSSProperties = {
  display: "flex",
  gap: 24,
  fontSize: "0.875rem",
};

export function Footer() {
  return (
    <footer style={footerStyle}>
      <div className="container" style={innerStyle}>
        <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          © {new Date().getFullYear()} Litvinov Y. · MIT License
        </span>
        <div style={linksStyle}>
          <a
            href="https://github.com/litury/warpong-3d"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text-secondary)" }}
          >
            GitHub
          </a>
          <a
            href="https://play.warpong.ru"
            style={{ color: "var(--text-secondary)" }}
          >
            Играть
          </a>
        </div>
      </div>
    </footer>
  );
}
