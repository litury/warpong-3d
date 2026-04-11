import { FeatureCard } from "./parts/FeatureCard";

const features = [
  {
    icon: "⚔",
    title: "Онлайн 1v1",
    description:
      "Рейтинговые матчи с ELO. Ставки монетами, комиссия победителю. Матчмейкинг по уровню.",
  },
  {
    icon: "⚙",
    title: "3D мехи",
    description:
      "Анимированные боевые мехи вместо скучных ракеток. Strafe, idle, победная поза.",
  },
  {
    icon: "☠",
    title: "Зомби-волны",
    description:
      "Оборона от орд зомби в соло-режиме. Плазменные ожоги, кровавые декали, пулинг.",
  },
  {
    icon: "↑",
    title: "Апгрейды",
    description:
      "Скорость ракетки, размер, скорость мяча, свечение. Косметика: цвета, трейлы.",
  },
];

export function Features() {
  return (
    <section>
      <div className="container">
        <p className="section-label">Возможности</p>
        <h2 className="section-title">Больше чем понг</h2>
        <p className="section-description">
          Классический понг, переосмысленный с мехами, плазмой и экономикой.
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
