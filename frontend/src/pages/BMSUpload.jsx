import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import ResultTable from '../components/ResultTable';
import { apiRequest } from '../api';
import { useProject } from '../state/ProjectContext';

export default function BMSUpload() {
  const { projectId } = useProject();
  const [file, setFile] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [summary, setSummary] = useState(null);
  const [msg, setMsg] = useState('');

  async function load() {
    if (!projectId) return;
    const data = await apiRequest(`/bms/${projectId}/uploads`);
    setUploads(data);
    setSummary(data[0]?.summary || null);
  }
  useEffect(() => { load().catch(() => {}); }, [projectId]);

  async function submit(e) {
    e.preventDefault();
    if (!projectId) return setMsg('Select or save a project first.');
    if (!file) return setMsg('Choose CSV/XLSX file.');
    const fd = new FormData();
    fd.append('file', file);
    const data = await apiRequest(`/bms/${projectId}/upload`, { method: 'POST', body: fd });
    setSummary(data.summary);
    setMsg(data.message);
    await load();
  }

  return (
    <>
      <PageHeader title="Actual Hotel BMS Data Upload" subtitle="Upload 15-minute or hourly CSV/XLSX data from hotel BMS reports." />
      <section className="panel">
        <p className="muted">Accepted columns: timestamp/date_time, electricity_kw, chiller_kw, hot_water_l, occupancy_percent, steam_kg_h.</p>
        <form className="inline-form" onSubmit={submit}>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
          <button>Upload BMS data</button>
        </form>
        {msg && <p className="success">{msg}</p>}
      </section>
      <section className="panel">
        <h3>Latest BMS summary</h3>
        <ResultTable data={summary} />
      </section>
      <section className="panel">
        <h3>Upload history</h3>
        <table className="data-table"><thead><tr><th>File</th><th>Records</th><th>Uploaded</th></tr></thead><tbody>{uploads.map((u) => <tr key={u.id}><td>{u.filename}</td><td>{u.record_count}</td><td>{new Date(u.uploaded_at).toLocaleString()}</td></tr>)}</tbody></table>
      </section>
    </>
  );
}
