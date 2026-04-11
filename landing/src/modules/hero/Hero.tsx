export function Hero() {
  return (
    <section className="hero-section" style={{ minHeight: "calc(100vh - 64px)", display: "flex", alignItems: "center", padding: "80px 0" }}>
      <div className="container grid-hero">
        <div className="hero-text" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <p className="section-label">Браузерная 3D игра</p>
          <h1>WARPONG 3D</h1>
          <p style={{ fontSize: "1.25rem", color: "var(--text-secondary)", maxWidth: 480 }}>
            Мультиплеер понг с мехами, плазменными орбами и зомби-волнами.
            Сражайся онлайн, прокачивай ракетку, поднимайся в рейтинге.
          </p>
          <div className="hero-actions" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
            <a href="https://play.warpong.ru" className="btn-primary">
              ▶ Играть
            </a>
            <a
              href="https://github.com/litury/warpong-3d"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline"
            >
              GitHub
            </a>
          </div>
        </div>
        <div>
          <div className="screenshot-frame">
            <div className="screenshot-glow" />
            <img
              src="/assets/landing/gameplay.jpg"
              alt="WARPONG 3D геймплей"
              loading="eager"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
