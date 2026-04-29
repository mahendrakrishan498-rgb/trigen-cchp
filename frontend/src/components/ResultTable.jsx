function pretty(k) {
  return k.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function ResultTable({ data }) {
  if (!data) return <p className="muted">No data available.</p>;
  return (
    <table className="data-table">
      <tbody>
        {Object.entries(data).map(([k, v]) => (
          <tr key={k}>
            <th>{pretty(k)}</th>
            <td>{v === null || v === undefined ? 'N/A' : typeof v === 'number' ? v.toLocaleString() : String(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
