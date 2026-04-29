import { useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import PageHeader from '../components/PageHeader';
import ResultTable from '../components/ResultTable';
import { useProject } from '../state/ProjectContext';

export default function LoadProfile() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);
  const monthly = result?.monthly_dispatch || [];
  return <>
    <PageHeader title="Load Profile" subtitle="Energy segregation: electricity, cooling thermal demand and heating demand." />
    {!result && <div className="notice">No project selected.</div>}
    {result && <>
      <section className="panel chart-panel"><h3>Monthly electricity, cooling and heating</h3><ResponsiveContainer width="100%" height={330}><AreaChart data={monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend /><Area type="monotone" dataKey="hotel_electricity_kwh" name="Electricity kWh" stroke="#0b74b8" fill="#b9e2ff" /><Area type="monotone" dataKey="cooling_thermal_kwh" name="Cooling thermal kWh" stroke="#14a879" fill="#b7f0d8" /><Area type="monotone" dataKey="heating_thermal_kwh" name="Heating kWh" stroke="#f79009" fill="#ffe0ad" /></AreaChart></ResponsiveContainer></section>
      <div className="two-col"><section className="panel"><h3>Step01 summary</h3><ResultTable data={result.step01_load_profile} /></section><section className="panel"><h3>Benchmark load profile</h3><ResultTable data={result.load_profile} /></section></div>
    </>}
  </>;
}
