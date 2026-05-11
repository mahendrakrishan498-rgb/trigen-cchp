import { useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line } from 'recharts';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import { useProject } from '../state/ProjectContext';
import { compactNumber, moneyShort, percentValue } from '../utils/formatters';

export default function Dashboard() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);
  const monthly = result?.monthly_dispatch || [];
  const cf = (result?.cash_flow || []).filter((r) => r.year_index <= 25);
  return <>
    <PageHeader title="Dashboard" subtitle="Savings-based financial feasibility summary for biomass-fired trigeneration plant." />
    {!result && <div className="notice">No selected project. Go to Inputs or Projects.</div>}
    {result && <>
      <div className="grid cards">
        <MetricCard label="NPV" value={moneyShort(result.financial?.npv_lkr)} unit="" />
        <MetricCard label="IRR" value={`${percentValue(result.financial?.irr_percent)}%`} unit="project cash flow" />
        <MetricCard label="Simple payback" value={result.financial?.simple_payback_years} unit="years" />
        <MetricCard label="GHG reduction" value={result.emissions?.co2_reduction_tonnes_year} unit="tCO₂/y" />
        <MetricCard label="Turbine" value={result.system_sizing?.turbine_kw} unit="kW" />
        <MetricCard label="Dual chiller" value={result.system_sizing?.absorption_chiller_rt} unit="RT" />
      </div>
      <div className="two-col wide-left">
        <section className="panel chart-panel"><h3>Monthly hotel electricity and grid export</h3><ResponsiveContainer width="100%" height={300}><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend /><Bar dataKey="hotel_electricity_kwh" name="Hotel electricity kWh" fill="#0b74b8" /><Bar dataKey="grid_export_kwh" name="Grid export kWh" fill="#14a879" /></BarChart></ResponsiveContainer></section>
        <section className="panel chart-panel"><h3>Cumulative discounted cash flow</h3><ResponsiveContainer width="100%" height={300}><LineChart data={cf}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year_index" /><YAxis tickFormatter={(v) => compactNumber(v)} /><Tooltip formatter={(v) => moneyShort(v)} /><Legend /><Line type="monotone" dataKey="cumulative_discounted_cash_flow_lkr" name="Cum. discounted CF LKR" stroke="#b42318" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></section>
      </div>
    </>}
  </>;
}
