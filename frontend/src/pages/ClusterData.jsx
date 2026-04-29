import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { API_BASE, apiRequest, getToken } from '../api';

const blank = {
  cluster_name: '',
  electricity_intensity_kwh_room_day: 50,
  cooling_share: 0.59147046,
  dhw_l_orn: 308,
  occupancy_percent: 83,
  grid_import_tariff_lkr_kwh: 62,
  selected_biomass_fuel: 'Gliricidia',
  selected_biomass_delivered_cost_lkr_kg: 35,
  selected_biomass_lhv_kwh_kg: 4.0,
  notes: ''
};

export default function ClusterData() {
  const [clusters, setClusters] = useState([]);
  const [newRow, setNewRow] = useState(blank);
  const [message, setMessage] = useState('');

  async function load() {
    setClusters(await apiRequest('/admin/clusters'));
  }

  useEffect(() => { load().catch((e)=>setMessage(e.message)); }, []);

  function updateRow(i, key, value) {
    const copy = [...clusters];
    copy[i] = { ...copy[i], [key]: key === 'cluster_name' || key === 'selected_biomass_fuel' || key === 'notes' ? value : Number(value) };
    setClusters(copy);
  }

  function setNew(key, value) {
    setNewRow({ ...newRow, [key]: key === 'cluster_name' || key === 'selected_biomass_fuel' || key === 'notes' ? value : Number(value) });
  }

  async function saveRow(row) {
    await apiRequest(`/admin/clusters/${row.id}`, { method: 'PUT', body: row });
    setMessage(`Updated ${row.cluster_name}`);
    await load();
  }

  async function addRow() {
    if (!newRow.cluster_name) {
      setMessage('Please enter cluster name.');
      return;
    }
    await apiRequest('/admin/clusters', { method: 'POST', body: newRow });
    setMessage('Cluster saved.');
    setNewRow(blank);
    await load();
  }

  async function uploadFile(file) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/admin/clusters/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form
    });
    if (!res.ok) throw new Error('Cluster upload failed');
    const data = await res.json();
    setMessage(`${data.message}. Updated rows: ${data.updated}`);
    await load();
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
    <PageHeader title="Cluster Data" subtitle="Update hotel cluster defaults used by the Input tab. Download the template, fill values, upload it, or edit the table manually." />

    {message && <div className="success">{message}</div>}

    <section className="panel">
      <h3>Template Upload</h3>
      <div className="button-row">
        <a className="button-link" href={`${API_BASE}/admin/clusters/template`} target="_blank" rel="noreferrer">Download Cluster Template</a>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(e)=>uploadFile(e.target.files[0]).catch((err)=>setMessage(err.message))} />
      </div>
      <p className="muted">Supported columns: cluster_name, electricity_intensity_kwh_room_day, cooling_share, dhw_l_orn, occupancy_percent, grid_import_tariff_lkr_kwh, selected_biomass_fuel, selected_biomass_delivered_cost_lkr_kg, selected_biomass_lhv_kwh_kg, notes.</p>
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
      <button onClick={addRow}>Add / Update Cluster</button>
    </section>

    <section className="panel">
      <h3>Existing Cluster Defaults</h3>
      <table className="data-table cluster-table">
        <thead>
          <tr>{fields.map(([key,label])=><th key={key}>{label}</th>)}<th>Action</th></tr>
        </thead>
        <tbody>
          {clusters.map((row, i)=>(
            <tr key={row.id}>
              {fields.map(([key])=>(
                <td key={key}>
                  <input value={row[key] ?? ''} onChange={(e)=>updateRow(i, key, e.target.value)} />
                </td>
              ))}
              <td><button onClick={()=>saveRow(row)}>Update</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>;
}
