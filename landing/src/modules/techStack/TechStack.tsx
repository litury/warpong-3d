const stack = [
  { name: "Babylon.js", desc: "3D движок" },
  { name: "TypeScript", desc: "Язык" },
  { name: "Bun", desc: "Сервер" },
  { name: "SQLite", desc: "База данных" },
  { name: "Vite", desc: "Сборка" },
  { name: "Biome", desc: "Линтер" },
  { name: "WebSocket", desc: "Мультиплеер" },
  { name: "Docker", desc: "Деплой" },
];

const gridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
};

export function TechStack() {
  return (
    <section>
      <div className="container">
        <p className="section-label">Технологии</p>
        <h2 className="section-title">Стек</h2>
        <p className="section-description">
          Современный стек без компромиссов. Серверная авторитарная архитектура,
          мгновенный билд, строгая типизация.
        </p>
        <div style={gridStyle}>
          {stack.map((s) => (
            <span className="badge" key={s.name}>
              <strong>{s.name}</strong>
              <span style={{ color: "var(--text-muted)" }}>{s.desc}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
