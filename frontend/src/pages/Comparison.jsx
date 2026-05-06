import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { apiRequest } from '../api';
import { useProject } from '../state/ProjectContext';
import { compactNumber, moneyShort } from '../utils/formatters';
const metrics = ['annual_electricity_kwh','annual_cooling_thermal_kwh','annual_heating_demand_kwh','selected_absorption_chiller_rt','main_chiller_rt','backup_chiller_rt','selected_turbine_kw','selected_inlet_steam_flow_kg_h','annual_grid_export_kwh','biomass_tonnes_year','net_initial_investment_lkr','year1_net_project_savings_lkr','payback_years','npv_lkr','irr_percent','profitability_index','annual_ghg_reduction_kgco2_y'];
export default function Comparison() {
  const { projectId } = useProject();
  const [file, setFile] = useState(null); const [rows, setRows] = useState(metrics.map((m)=>({ metric:m, retscreen_value:'', unit:'' }))); const [saved, setSaved] = useState([]); const [msg, setMsg] = useState('');
  async function load() { if (projectId) setSaved(await apiRequest(`/comparison/${projectId}`)); }
  useEffect(() => { load().catch(() => {}); }, [projectId]);
  function update(i,k,v){ const copy=[...rows]; copy[i]={...copy[i],[k]:v}; setRows(copy); }
  async function saveManual(){ if(!projectId) return setMsg('Select project first.'); const data=await apiRequest(`/comparison/${projectId}/manual`,{method:'POST',body:{rows}}); setMsg(data.message); await load(); }
  async function uploadFile(e){ e.preventDefault(); if(!projectId) return setMsg('Select project first.'); const fd=new FormData(); fd.append('file',file); const data=await apiRequest(`/comparison/${projectId}/upload`,{method:'POST',body:fd}); setMsg(data.message); await load(); }
  return <>
    <PageHeader title="Excel / RETScreen Comparison" subtitle="Upload or manually enter Excel/RETScreen values. The website calculates percentage error automatically." />
    <section className="panel"><h3>Upload comparison file</h3><p className="muted">Columns: metric, retscreen_value or excel_value, unit. Metrics can use names shown below.</p><form className="inline-form" onSubmit={uploadFile}><input type="file" accept=".csv,.xlsx,.xls" onChange={(e)=>setFile(e.target.files[0])} /><button>Upload</button></form>{msg && <p className="success">{msg}</p>}</section>
    <section className="panel"><h3>Manual table</h3><table className="data-table"><thead><tr><th>Metric</th><th>Excel/RETScreen value</th><th>Unit</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.metric}><td>{r.metric}</td><td><input value={r.retscreen_value} onChange={(e)=>update(i,'retscreen_value',e.target.value)} /></td><td><input value={r.unit} onChange={(e)=>update(i,'unit',e.target.value)} /></td></tr>)}</tbody></table><button onClick={saveManual}>Save comparison</button></section>
    <section className="panel"><h3>Saved comparison</h3><table className="data-table"><thead><tr><th>Metric</th><th>Website</th><th>Excel/RETScreen</th><th>Unit</th><th>Error %</th></tr></thead><tbody>{saved.map((r)=><tr key={r.id}><td>{r.metric}</td><td>{String(r.metric).toLowerCase().includes('lkr') ? moneyShort(r.website_value) : compactNumber(r.website_value)}</td><td>{String(r.metric).toLowerCase().includes('lkr') ? moneyShort(r.retscreen_value) : compactNumber(r.retscreen_value)}</td><td>{r.unit}</td><td>{Number(r.error_percent||0).toFixed(2)}</td></tr>)}</tbody></table></section>
  </>;
}
