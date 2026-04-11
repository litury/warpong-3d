interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="card">
      <div style={{ fontSize: 32, marginBottom: 16 }}>{icon}</div>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
        {description}
      </p>
    </div>
  );
}
