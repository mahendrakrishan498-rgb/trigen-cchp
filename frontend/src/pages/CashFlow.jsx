import { useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, BarChart, Bar } from 'recharts';
import PageHeader from '../components/PageHeader';
import { useProject } from '../state/ProjectContext';
function money(v) { return Number(v || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 }); }
export default function CashFlow() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);
  const rows = result?.cash_flow || [];
  return <>
    <PageHeader title="Step03 Cash Flow" subtitle="25-year savings-based pre-tax cash flow with yearly export tariff links." />
    {!result && <div className="notice">No project selected.</div>}
    {result && <><div className="two-col wide-left"><section className="panel chart-panel"><h3>Net project cash flow</h3><ResponsiveContainer width="100%" height={300}><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year_index" /><YAxis /><Tooltip /><Bar dataKey="net_cash_flow_lkr" name="Net cash flow LKR" fill="#0b74b8" /></BarChart></ResponsiveContainer></section><section className="panel chart-panel"><h3>Cumulative discounted cash flow</h3><ResponsiveContainer width="100%" height={300}><LineChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year_index" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="cumulative_discounted_cash_flow_lkr" name="Cum. DCF" stroke="#b42318" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></section></div><section className="panel"><table className="data-table"><thead><tr><th>Year</th><th>Export tariff</th><th>Benefits</th><th>Biomass cost</th><th>O&M + admin</th><th>Net CF</th><th>Cum. DCF</th></tr></thead><tbody>{rows.map((r)=><tr key={r.year_index}><td>{r.year_index}</td><td>{r.export_tariff_lkr_kwh}</td><td>{money(r.total_project_benefits_lkr)}</td><td>{money(r.biomass_fuel_cost_lkr)}</td><td>{money((r.fixed_om_lkr||0)+(r.variable_om_lkr||0)+(r.insurance_admin_lkr||0))}</td><td>{money(r.net_cash_flow_lkr)}</td><td>{money(r.cumulative_discounted_cash_flow_lkr)}</td></tr>)}</tbody></table></section></>}
  </>;
}
