import { useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import ResultTable from '../components/ResultTable';
import { useProject } from '../state/ProjectContext';

export default function Step02Design() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);

  return <>
    <PageHeader title="Technical Design" subtitle="Dual absorption chiller selection, extraction steam turbine selection and 15-minute dispatch." />
    {!result && <div className="notice">No project selected.</div>}
    {result && <>
      <div className="grid cards"><MetricCard label="Design cooling" value={result.step02_technical_design.design_cooling_rt} unit="RT" /><MetricCard label="Main chiller" value={result.system_sizing.main_chiller_rt} unit="RT" /><MetricCard label="Backup chiller" value={result.system_sizing.backup_chiller_rt} unit="RT" /><MetricCard label="Turbine" value={result.system_sizing.turbine_kw} unit="kW" /><MetricCard label="Process steam" value={result.step02_technical_design.process_steam_flow_kg_h} unit="kg/h" /><MetricCard label="Exhaust steam" value={result.step02_technical_design.exhaust_steam_design_kg_h} unit="kg/h" /></div>
      <section className="panel"><h3>Technical design calculations</h3><ResultTable data={result.step02_technical_design} /></section>
    </>}
  </>;
}
