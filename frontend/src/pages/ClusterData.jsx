import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { API_BASE, apiRequest, getToken } from '../api';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const defaultMonthlyFactors = [1.42, 1.28, 1.03, 1.20, 0.94, 0.45, 0.64, 0.89, 0.78, 0.98, 1.06, 1.31];

const blank = {
  cluster_name: '',
  electricity_intensity_kwh_room_day: 50,
  cooling_share: 0.59147046,
  dhw_l_orn: 308,
  occupancy_percent: 92,
  grid_import_tariff_lkr_kwh: 16.291667,
  selected_biomass_fuel: 'Gliricidia',
  selected_biomass_delivered_cost_lkr_kg: 12,
  selected_biomass_lhv_kwh_kg: 4.0,
  monthly_factors: defaultMonthlyFactors,
  notes: ''
};

export default function ClusterData() {
  const [clusters, setClusters] = useState([]);
  const [newRow, setNewRow] = useState(blank);
  const [newDispatchFile, setNewDispatchFile] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    setClusters(await apiRequest('/clusters'));
  }

  useEffect(() => { load().catch((e)=>setMessage(e.message)); }, []);

  function updateRow(i, key, value) {
    const copy = [...clusters];
    copy[i] = { ...copy[i], [key]: key === 'cluster_name' || key === 'selected_biomass_fuel' || key === 'notes' ? value : Number(value) };
    setClusters(copy);
  }

  function updateMonthlyFactor(i, monthIndex, value) {
    const copy = [...clusters];
    const factors = [...(copy[i].monthly_factors || defaultMonthlyFactors)];
    factors[monthIndex] = Number(value);
    copy[i] = { ...copy[i], monthly_factors: factors };
    setClusters(copy);
  }

  function setNew(key, value) {
    setNewRow({ ...newRow, [key]: key === 'cluster_name' || key === 'selected_biomass_fuel' || key === 'notes' ? value : Number(value) });
  }

  function setNewMonthlyFactor(monthIndex, value) {
    const factors = [...(newRow.monthly_factors || defaultMonthlyFactors)];
    factors[monthIndex] = Number(value);
    setNewRow({ ...newRow, monthly_factors: factors });
  }

  async function saveRow(row) {
    await apiRequest(`/admin/clusters/${row.id}`, { method: 'PUT', body: row });
    setMessage(`Updated ${row.cluster_name}`);
    await load();
  }

  async function deleteRow(row) {
    if (!window.confirm(`Delete cluster "${row.cluster_name}"?`)) return;
    await apiRequest(`/admin/clusters/${row.id}`, { method: 'DELETE' });
    setMessage(`Deleted ${row.cluster_name}`);
    await load();
  }

  async function uploadDispatchByClusterId(clusterId, clusterName, file) {
    if (!file) return null;
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/admin/clusters/${clusterId}/dispatch15min/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || '15-minute dispatch upload failed');

    const warning = data.warning ? ` Warning: ${data.warning}` : '';
    return ` Uploaded 15-minute dispatch data for ${clusterName}. Saved rows: ${data.saved_rows}.${warning}`;
  }

  async function addRow() {
    if (!newRow.cluster_name) {
      setMessage('Please enter cluster name.');
      return;
    }
    const data = await apiRequest('/admin/clusters', { method: 'POST', body: newRow });
    if (newDispatchFile && !data.id) throw new Error('Cluster saved, but the saved cluster id was not returned for dispatch upload.');
    const dispatchMessage = await uploadDispatchByClusterId(data.id, newRow.cluster_name, newDispatchFile);
    setMessage(`Cluster saved.${dispatchMessage || ''}`);
    setNewRow(blank);
    setNewDispatchFile(null);
    await load();
  }

  async function downloadTemplate(path, filename) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Template download failed');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function uploadDispatchFile(row, file) {
    const dispatchMessage = await uploadDispatchByClusterId(row.id, row.cluster_name, file);
    if (dispatchMessage) setMessage(dispatchMessage.trim());
  }

  const fields = [
    ['cluster_name','Cluster'],
    ['electricity_intensity_kwh_room_day','Electricity intensity'],
    ['cooling_share','Cooling share'],
    ['dhw_l_orn','DHW L/ORN'],
    ['occupancy_percent','Occupancy %'],
    ['grid_import_tariff_lkr_kwh','Grid tariff'],
    ['selected_biomass_fuel','Biomass fuel'],
    ['selected_biomass_delivered_cost_lkr_kg','Biomass price'],
    ['selected_biomass_lhv_kwh_kg','LHV'],
    ['notes','Notes']
  ];

  return <>
    <PageHeader title="Cluster Data" subtitle="Update hotel cluster defaults and attach 15-minute dispatch Excel/CSV data for each cluster." />

    {message && <div className="success">{message}</div>}

    <section className="panel">
      <h3>Template Download</h3>
      <div className="button-row">
        <button
          type="button"
          onClick={()=>downloadTemplate('/admin/clusters/dispatch15min/template', 'cluster_15min_dispatch_template.csv').catch((err)=>setMessage(err.message))}
        >
          Download 15-Minute Dispatch Template
        </button>
      </div>
      <p className="muted">For 15-minute dispatch uploads, use 96 rows with: Time Fraction (-), Hotel Electric factor, Cooling Thermal factor.</p>
    </section>

    <section className="panel">
      <h3>Add New Cluster</h3>
      <div className="cluster-grid">
        {fields.map(([key,label]) => (
          <label key={key}>{label}
            <input value={newRow[key] ?? ''} onChange={(e)=>setNew(key, e.target.value)} />
          </label>
        ))}
      </div>
      <h4>Monthly load profile factors</h4>
      <div className="month-factor-grid">
        {months.map((month, index) => (
          <label key={month}>{month}
            <input
              type="number"
              step="any"
              value={(newRow.monthly_factors || defaultMonthlyFactors)[index] ?? ''}
              onChange={(e)=>setNewMonthlyFactor(index, e.target.value)}
            />
          </label>
        ))}
      </div>
      <label className="dispatch-upload-label">
        Upload 15-Minute Dispatch Data
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e)=>setNewDispatchFile(e.target.files[0] || null)}
        />
      </label>
      <button onClick={addRow}>Add / Update Cluster</button>
    </section>

    <section className="panel">
      <h3>Existing Cluster Defaults</h3>
      <table className="data-table cluster-table">
        <thead>
          <tr>{fields.map(([key,label])=><th key={key}>{label}</th>)}{months.map((month)=><th key={month}>{month} factor</th>)}<th>Action</th></tr>
        </thead>
        <tbody>
          {clusters.map((row, i)=>(
            <tr key={row.id}>
              {fields.map(([key])=>(
                <td key={key}>
                  <input value={row[key] ?? ''} onChange={(e)=>updateRow(i, key, e.target.value)} />
                </td>
              ))}
              {months.map((month, monthIndex)=>(
                <td key={month}>
                  <input
                    type="number"
                    step="any"
                    value={(row.monthly_factors || defaultMonthlyFactors)[monthIndex] ?? ''}
                    onChange={(e)=>updateMonthlyFactor(i, monthIndex, e.target.value)}
                  />
                </td>
              ))}
              <td>
                <div className="button-row cluster-actions">
                  <button onClick={()=>saveRow(row)}>Update</button>
                  <button className="danger" onClick={()=>deleteRow(row)}>Delete</button>
                </div>
                <label className="dispatch-upload-label">
                  Upload 15-Minute Dispatch Data
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e)=>uploadDispatchFile(row, e.target.files[0]).catch((err)=>setMessage(err.message))}
                  />
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>;
}
