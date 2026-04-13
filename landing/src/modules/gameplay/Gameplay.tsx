const statValue: React.CSSProperties = {
  fontFamily: '"Outfit", system-ui, sans-serif',
  fontSize: "2rem",
  fontWeight: 700,
  color: "var(--text)",
};

const statLabel: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "var(--text-muted)",
  marginTop: 4,
};

export function Gameplay() {
  return (
    <section>
      <div className="container">
        <p className="section-label">Как это работает</p>
        <h2 className="section-title">Простые правила, серьёзный код</h2>
        <p className="section-description">
          До 5 очков. Мяч ускоряется с каждым отбиванием.
          Угол отскока зависит от точки удара по ракетке.
          ELO-рейтинг растёт с каждой победой, ставка 10 монет за матч.
        </p>

        <div className="screenshot-frame">
          <div className="screenshot-glow" />
          <img
            src="/assets/landing/menu.jpg"
            alt="WARPONG 3D меню"
            loading="lazy"
          />
        </div>

        <div className="grid-stats">
          <div>
            <div style={statValue}>800×600</div>
            <div style={statLabel}>Арена</div>
          </div>
          <div>
            <div style={statValue}>60</div>
            <div style={statLabel}>Тиков/с</div>
          </div>
          <div>
            <div style={statValue}>600</div>
            <div style={statLabel}>Макс. скорость</div>
          </div>
          <div>
            <div style={statValue}>K=32</div>
            <div style={statLabel}>ELO рейтинг</div>
          </div>
        </div>
      </div>
    </section>
  );
}
