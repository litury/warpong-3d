import { ThemeToggle } from "./ThemeToggle";

const headerStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  background: "color-mix(in srgb, var(--bg) 80%, transparent)",
  borderBottom: "1px solid var(--border)",
};

const navStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: 64,
};

const logoStyle: React.CSSProperties = {
  fontFamily: '"Outfit", system-ui, sans-serif',
  fontSize: "1.25rem",
  fontWeight: 800,
  letterSpacing: "-0.02em",
  color: "var(--text)",
  textDecoration: "none",
};

const linksStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 24,
};

const linkStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "var(--text-secondary)",
  textDecoration: "none",
};

export function Header() {
  return (
    <header style={headerStyle}>
      <nav className="container" style={navStyle}>
        <a href="/" style={logoStyle}>WARPONG</a>
        <div style={linksStyle}>
          <a href="https://play.warpong.ru" style={linkStyle}>Играть</a>
          <a
            href="https://github.com/litury/warpong-3d"
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
          >
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
