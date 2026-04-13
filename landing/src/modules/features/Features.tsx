import { FeatureCard } from "./parts/FeatureCard";

const features = [
  {
    icon: "⚡",
    title: "Матч за 30 секунд",
    description:
      "Открыл — нашёл соперника — играешь. Без меню, лобби и аккаунтов.",
  },
  {
    icon: "🛡",
    title: "Server-authoritative",
    description:
      "Физика на сервере, интерполяция и предсказание на клиенте. Читерить нельзя.",
  },
  {
    icon: "☠",
    title: "Зомби-волны в соло",
    description:
      "Нет онлайна — отбивайся от орд, копи монеты, прокачивай свой мех.",
  },
  {
    icon: "↑",
    title: "Прокачка и косметика",
    description:
      "Скорость и размер ракетки, цвета, трейлы. Всё за внутриигровые монеты.",
  },
];

export function Features() {
  return (
    <section>
      <div className="container">
        <p className="section-label">Что внутри</p>
        <h2 className="section-title">Больше чем просто понг</h2>
        <p className="section-description">
          Классические правила, современная архитектура.
        </p>
        <div className="grid-features">
          {features.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}
