import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { apiRequest } from '../api';

export default function Admin() {
  const [settings, setSettings] = useState([]); const [equipment, setEquipment] = useState([]); const [tariffs, setTariffs] = useState([]); const [msg, setMsg] = useState('');
  const [newEq, setNewEq] = useState({ item_name:'', config_type:'extraction', room_capacity:250, capacity_value:'', capacity_unit:'', cost_lkr:'', supplier:'', reference_note:'' });
  async function load(){ setSettings(await apiRequest('/admin/settings')); setEquipment(await apiRequest('/admin/equipment')); setTariffs(await apiRequest('/admin/export-tariffs')); }
  useEffect(()=>{ load().catch((e)=>setMsg(e.message)); },[]);
  function setSetting(i,k,v){ const copy=[...settings]; copy[i]={...copy[i],[k]:v}; setSettings(copy); }
  async function saveSetting(s){ await apiRequest(`/admin/settings/${s.setting_key}`,{method:'PUT',body:s}); setMsg('Setting saved'); }
  function setTariff(i,k,v){ const copy=[...tariffs]; copy[i]={...copy[i],[k]:v}; setTariffs(copy); }
  async function saveTariff(t){ await apiRequest(`/admin/export-tariffs/${t.year}`,{method:'PUT',body:t}); setMsg('Export tariff saved'); }
  async function addEquipment(){ await apiRequest('/admin/equipment',{method:'POST',body:newEq}); setMsg('Equipment quotation added'); await load(); }
  async function deleteEq(id){ await apiRequest(`/admin/equipment/${id}`,{method:'DELETE'}); await load(); }
  return <>
    <PageHeader title="Admin Page" subtitle="Update Step03 Excel assumptions, biomass prices, yearly export tariff table and equipment quotations." />
    {msg && <div className="success">{msg}</div>}
    <section className="panel"><h3>Step03 assumptions, prices and emission factors</h3><table className="data-table"><thead><tr><th>Key</th><th>Value</th><th>Unit</th><th>Description</th><th></th></tr></thead><tbody>{settings.map((s,i)=><tr key={s.setting_key}><td>{s.setting_key}</td><td><input value={s.setting_value} onChange={(e)=>setSetting(i,'setting_value',e.target.value)} /></td><td><input value={s.unit||''} onChange={(e)=>setSetting(i,'unit',e.target.value)} /></td><td><input value={s.description||''} onChange={(e)=>setSetting(i,'description',e.target.value)} /></td><td><button onClick={()=>saveSetting(s)}>Save</button></td></tr>)}</tbody></table></section>
    <section className="panel"><h3>Year-linked export tariff schedule</h3><p className="muted">This table follows your Excel P:T export tariff schedule. Total export tariff = O&M + fuel + fixed.</p><table className="data-table"><thead><tr><th>Year</th><th>O&M</th><th>Fuel</th><th>Fixed</th><th>Total</th><th></th></tr></thead><tbody>{tariffs.map((t,i)=><tr key={t.year}><td>{t.year}</td><td><input value={t.om_tariff_lkr_kwh} onChange={(e)=>setTariff(i,'om_tariff_lkr_kwh',e.target.value)} /></td><td><input value={t.fuel_tariff_lkr_kwh} onChange={(e)=>setTariff(i,'fuel_tariff_lkr_kwh',e.target.value)} /></td><td><input value={t.fixed_tariff_lkr_kwh} onChange={(e)=>setTariff(i,'fixed_tariff_lkr_kwh',e.target.value)} /></td><td>{(Number(t.om_tariff_lkr_kwh)+Number(t.fuel_tariff_lkr_kwh)+Number(t.fixed_tariff_lkr_kwh)).toFixed(2)}</td><td><button onClick={()=>saveTariff(t)}>Save</button></td></tr>)}</tbody></table></section>
    <section className="panel"><h3>Add equipment quotation</h3><div className="eq-grid">{Object.keys(newEq).map((k)=>k==='config_type'?<label key={k}>{k}<select value={newEq[k]} onChange={(e)=>setNewEq({...newEq,[k]:e.target.value})}><option value="both">both</option><option value="back_pressure">back_pressure</option><option value="extraction">extraction</option></select></label>:<label key={k}>{k}<input value={newEq[k]} onChange={(e)=>setNewEq({...newEq,[k]:e.target.value})} /></label>)}</div><button onClick={addEquipment}>Add quotation</button></section>
    <section className="panel"><h3>Equipment quotation database</h3><table className="data-table"><thead><tr><th>Item</th><th>Config</th><th>Rooms</th><th>Capacity</th><th>Cost LKR</th><th>Supplier</th><th></th></tr></thead><tbody>{equipment.map((e)=><tr key={e.id}><td>{e.item_name}</td><td>{e.config_type}</td><td>{e.room_capacity}</td><td>{e.capacity_value} {e.capacity_unit}</td><td>{Number(e.cost_lkr).toLocaleString()}</td><td>{e.supplier}</td><td><button className="danger" onClick={()=>deleteEq(e.id)}>Delete</button></td></tr>)}</tbody></table></section>
  </>;
}
