import { useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import PageHeader from '../components/PageHeader';
import ResultTable from '../components/ResultTable';
import { useProject } from '../state/ProjectContext';
export default function Emissions() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);
  const rows = result ? [
    { name:'Baseline total', kg: result.emissions.baseline_total_emissions_kgco2_y },
    { name:'Project net', kg: result.emissions.proposed_net_emissions_kgco2_y },
    { name:'GHG reduction', kg: result.emissions.annual_ghg_reduction_kgco2_y }
  ] : [];
  return <>
    <PageHeader title="Emission Reduction" subtitle="Baseline grid/heating emissions compared with project grid import, biomass emissions and export displacement credit." />
    {!result && <div className="notice">No project selected.</div>}
    {result && <><section className="panel chart-panel"><ResponsiveContainer width="100%" height={320}><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="kg" name="kgCO₂/year" fill="#6941c6" /></BarChart></ResponsiveContainer></section><section className="panel"><ResultTable data={result.emissions} /></section></>}
  </>;
}
