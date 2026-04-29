import { useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import ResultTable from '../components/ResultTable';
import { useProject } from '../state/ProjectContext';

function money(v) { return Number(v || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 }); }
export default function SystemSizing() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);
  return <>
    <PageHeader title="System Sizing" subtitle="Boiler/steam generator, extraction turbine, dual absorption chillers and heat exchanger." />
    {!result && <div className="notice">No project selected.</div>}
    {result && <><div className="grid cards"><MetricCard label="Boiler/steam generator" value={result.system_sizing.boiler_tph} unit="ton/hr" /><MetricCard label="Steam turbine" value={result.system_sizing.turbine_kw} unit="kW" /><MetricCard label="Total chiller" value={result.system_sizing.absorption_chiller_rt} unit="RT" /><MetricCard label="Heat exchanger" value={result.system_sizing.heat_exchanger_kw} unit="kW" /><MetricCard label="CAPEX" value={money(result.system_sizing.capex_lkr)} unit="LKR" /><MetricCard label="Annual biomass" value={result.fuel.annual_biomass_tonnes} unit="tonnes/y" /></div><div className="two-col"><section className="panel"><h3>CAPEX build-up</h3><ResultTable data={result.step03_capex} /></section><section className="panel"><h3>Energy balance</h3><ResultTable data={result.energy_balance} /><h3>Fuel</h3><ResultTable data={result.fuel} /></section></div></>}
  </>;
}
