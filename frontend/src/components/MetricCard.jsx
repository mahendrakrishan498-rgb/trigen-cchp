export default function MetricCard({ label, value, unit }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value ?? 'N/A'}</strong>
      {unit && <small>{unit}</small>}
    </div>
  );
}
