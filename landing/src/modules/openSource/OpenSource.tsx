export function OpenSource() {
  return (
    <section>
      <div className="container grid-split">
        <div>
          <p className="section-label">Open Source</p>
          <h2 className="section-title">Открытый код</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
            Весь исходный код доступен на GitHub под лицензией MIT.
            Изучайте, форкайте, контрибьютьте. Идеально для изучения
            мультиплеерной архитектуры и Babylon.js.
          </p>
          <a
            href="https://github.com/litury/warpong-3d"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline"
          >
            ⭐ Star on GitHub
          </a>
        </div>

        <div className="terminal">
          <div className="terminal-header">
            <div className="terminal-dot" />
            <div className="terminal-dot" />
            <div className="terminal-dot" />
          </div>
          <div className="terminal-body">
            <div><span className="prompt">$</span> <span className="cmd">git clone https://github.com/litury/warpong-3d.git</span></div>
            <div><span className="prompt">$</span> <span className="cmd">cd warpong-3d</span></div>
            <div>&nbsp;</div>
            <div><span className="prompt"># Сервер</span></div>
            <div><span className="prompt">$</span> <span className="cmd">cd server && bun install && bun run dev</span></div>
            <div>&nbsp;</div>
            <div><span className="prompt"># Клиент</span></div>
            <div><span className="prompt">$</span> <span className="cmd">cd client-babylon && npm i && npm run dev</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
