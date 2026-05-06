import { useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import PageHeader from '../components/PageHeader';
import { useProject } from '../state/ProjectContext';
import { compactNumber, moneyShort } from '../utils/formatters';
function number(v) { return Number(v || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 }); }
export default function MonthlyEconomics() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);
  const rows = result?.monthly_dispatch || [];
  return <>
    <PageHeader title="Step03 Monthly Economics" subtitle="Monthly dispatch, export revenue and import/export grid balance." />
    {!result && <div className="notice">No project selected.</div>}
    {result && <><section className="panel chart-panel"><h3>Monthly export revenue and import cost</h3><ResponsiveContainer width="100%" height={330}><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(v) => compactNumber(v)} /><Tooltip formatter={(v) => moneyShort(v)} /><Legend /><Bar dataKey="export_revenue_lkr" name="Export revenue LKR" fill="#14a879" /><Bar dataKey="import_cost_lkr" name="Import cost LKR" fill="#f04438" /></BarChart></ResponsiveContainer></section><section className="panel"><table className="data-table"><thead><tr><th>Month</th><th>Hotel Elec kWh</th><th>Cooling kWh</th><th>Heating kWh</th><th>Turbine kWh</th><th>Grid Export kWh</th><th>Export Revenue</th></tr></thead><tbody>{rows.map((r)=><tr key={r.month}><td>{r.month}</td><td>{number(r.hotel_electricity_kwh)}</td><td>{number(r.cooling_thermal_kwh)}</td><td>{number(r.heating_thermal_kwh)}</td><td>{number(r.turbine_electricity_kwh)}</td><td>{number(r.grid_export_kwh)}</td><td>{moneyShort(r.export_revenue_lkr)}</td></tr>)}</tbody></table></section></>}
  </>;
}
