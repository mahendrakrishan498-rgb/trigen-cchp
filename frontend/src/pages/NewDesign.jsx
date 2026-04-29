import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import { apiRequest } from '../api';
import { useProject } from '../state/ProjectContext';

const defaults = {
  title: 'South-West Hotel Step03 Feasibility',
  hotel_name: 'Sample South-West Resort',
  location: 'South/South-West Coast',
  rooms: 250,
  occupancy_percent: 83,
  electricity_intensity_kwh_room_day: 50,
  cooling_share: 0.591470459820233,
  electric_chiller_cop: 5,
  absorption_chiller_cop: 0.7,
  dhw_l_orn: 308,
  cold_water_temp_c: 27.5,
  hot_water_temp_c: 55,
  hot_water_loss_factor: 0.25,
  laundry_operation: 'No',
  financial_year: 2026,
  analysis_period_years: 25,
  discount_rate: 0.12,
  inflation_escalation_rate: 0.05,
  grid_import_tariff_lkr_kwh: 62,
  selected_biomass_fuel: 'Gliricidia',
  selected_biomass_delivered_cost_lkr_kg: 35,
  selected_biomass_lhv_kwh_kg: 4,
  main_chiller_share: 0.8
};

function money(v) { return Number(v || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 }); }

export default function NewDesign() {
  const { setProjectId, setProject, projectId } = useProject();
  const [inputs, setInputs] = useState({ ...defaults, project_id: projectId || '' });
  const [clusters, setClusters] = useState([]);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiRequest('/admin/clusters').then((rows) => {
      setClusters(rows);
      const selected = rows.find((c) => c.cluster_name === inputs.location);
      if (selected) applyCluster(selected, false);
    }).catch(() => {});
  }, []);

  function setField(k, v) { setInputs((old) => ({ ...old, [k]: v })); }

  function applyCluster(cluster, showMessage = true) {
    if (!cluster) return;
    setInputs((old) => ({
      ...old,
      location: cluster.cluster_name,
      electricity_intensity_kwh_room_day: Number(cluster.electricity_intensity_kwh_room_day),
      cooling_share: Number(cluster.cooling_share),
      dhw_l_orn: Number(cluster.dhw_l_orn),
      occupancy_percent: Number(cluster.occupancy_percent),
      grid_import_tariff_lkr_kwh: Number(cluster.grid_import_tariff_lkr_kwh),
      selected_biomass_fuel: cluster.selected_biomass_fuel,
      selected_biomass_delivered_cost_lkr_kg: Number(cluster.selected_biomass_delivered_cost_lkr_kg),
      selected_biomass_lhv_kwh_kg: Number(cluster.selected_biomass_lhv_kwh_kg)
    }));
    if (showMessage) setMessage(`Cluster defaults loaded: ${cluster.cluster_name}. You can still edit any value manually.`);
  }

  function changeCluster(name) {
    const cluster = clusters.find((c) => c.cluster_name === name);
    applyCluster(cluster);
  }

  async function preview() {
    const data = await apiRequest('/calculations/preview', { method: 'POST', body: inputs });
    setResult(data);
    setMessage('Simulation completed using V3 Step03 Excel-linked equations.');
  }

  async function save() {
    const data = await apiRequest('/calculations/save', { method: 'POST', body: inputs });
    setProjectId(data.id);
    setProject({ id:data.id, ...inputs, result:data.result });
    setInputs({ ...inputs, project_id: data.id });
    setResult(data.result);
    setMessage(data.message);
  }

  const fields = [
    ['title','Project title','text'],
    ['hotel_name','Hotel name','text'],
    ['financial_year','Financial/project year','number'],
    ['rooms','Number of rooms','number'],
    ['occupancy_percent','Occupancy (%)','number'],
    ['electricity_intensity_kwh_room_day','Electricity intensity (kWh/room/day)','number'],
    ['cooling_share','Cooling share (fraction)','number'],
    ['dhw_l_orn','DHW L/ORN','number'],
    ['grid_import_tariff_lkr_kwh','Grid import tariff (LKR/kWh)','number'],
    ['selected_biomass_delivered_cost_lkr_kg','Biomass price (LKR/kg)','number'],
    ['selected_biomass_lhv_kwh_kg','Biomass LHV (kWh/kg)','number'],
    ['main_chiller_share','Main chiller share (0.8 = 80/20)','number'],
    ['analysis_period_years','Analysis period (years)','number'],
    ['discount_rate','Discount rate','number'],
    ['inflation_escalation_rate','Escalation rate','number']
  ];

  return <>
    <PageHeader title="Input" subtitle="Enter hotel, cluster, technical and financial inputs. Cluster defaults can be updated from the Cluster Data page." />

    {message && <p className="success">{message}</p>}

    <section className="panel">
      <h3>Hotel Cluster Selection</h3>
      <div className="form-grid">
        <label>Location / Hotel cluster
          <select value={inputs.location} onChange={(e)=>changeCluster(e.target.value)}>
            {clusters.length === 0 && <option>{inputs.location}</option>}
            {clusters.map((c)=><option key={c.id} value={c.cluster_name}>{c.cluster_name}</option>)}
          </select>
        </label>
        <label>Laundry operation?
          <select value={inputs.laundry_operation} onChange={(e)=>setField('laundry_operation', e.target.value)}>
            <option>No</option>
            <option>Yes</option>
          </select>
        </label>
        <label>Selected biomass fuel
          <select value={inputs.selected_biomass_fuel} onChange={(e)=>setField('selected_biomass_fuel', e.target.value)}>
            <option>Gliricidia</option>
            <option>Cinnamon</option>
            <option>Wood chips</option>
            <option>Agricultural residue</option>
            <option>Mixed biomass</option>
          </select>
        </label>
      </div>
      <p className="muted">Changing the cluster automatically fills electricity intensity, cooling share, DHW demand, tariff and biomass values. You can manually change them below.</p>
    </section>

    <div className="two-col">
      <section className="panel">
        <h3>Project and Excel-linked Inputs</h3>
        <div className="form-grid">
          {fields.map(([k,label,type]) => (
            <label key={k}>{label}
              <input type={type} step="any" value={inputs[k] ?? ''} onChange={(e)=>setField(k, type==='number'?Number(e.target.value):e.target.value)} />
            </label>
          ))}
        </div>
        <label>CAPEX override (optional LKR)
          <input type="number" placeholder="Leave blank to use Excel CAPEX build-up" onChange={(e)=>setField('capex_lkr', e.target.value ? Number(e.target.value) : undefined)} />
        </label>

        <div className="button-row">
          <button onClick={save}>Save Project</button>
          <button onClick={preview}>Run Simulation</button>
        </div>
      </section>

      <section className="panel">
        <h3>Simulation Summary</h3>
        {!result && <p className="muted">Click Run Simulation or Save Project to see key results.</p>}
        {result && <div className="grid cards small">
          <MetricCard label="Turbine" value={result.system_sizing.turbine_kw} unit="kW" />
          <MetricCard label="Main/backup chiller" value={`${result.system_sizing.main_chiller_rt}/${result.system_sizing.backup_chiller_rt}`} unit="RT" />
          <MetricCard label="Steam generator" value={money(result.system_sizing.steam_generator_kg_h)} unit="kg/h" />
          <MetricCard label="NPV" value={money(result.financial.npv_lkr)} unit="LKR" />
          <MetricCard label="IRR" value={result.financial.irr_percent} unit="%" />
          <MetricCard label="Payback" value={result.financial.simple_payback_years} unit="years" />
        </div>}
      </section>
    </div>

    {result && <section className="panel">
      <h3>Input Values Used in Simulation</h3>
      <table className="data-table">
        <thead><tr><th>Input</th><th>Value</th></tr></thead>
        <tbody>{Object.entries(result.inputs_used || inputs).slice(0, 30).map(([k,v])=>(
          <tr key={k}><td>{k}</td><td>{typeof v === 'number' ? v.toLocaleString(undefined, {maximumFractionDigits: 4}) : String(v)}</td></tr>
        ))}</tbody>
      </table>
    </section>}
  </>;
}
