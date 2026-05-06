import { useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import Dispatch15MinProfile from '../components/Dispatch15MinProfile';
import { useProject } from '../state/ProjectContext';

export default function Pscad() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);

  return (
    <>
      <PageHeader
        title="Design Analysis"
        subtitle="15-minute generator dispatch, voltage, frequency and grid interaction based on the selected system design."
      />

      {!result && <div className="notice">No project selected.</div>}
      {result && (
        <>
          <div className="grid cards">
            <MetricCard label="Designed turbine" value={result.system_sizing?.turbine_kw} unit="kW" />
            <MetricCard label="Absorption chiller" value={result.system_sizing?.absorption_chiller_rt} unit="RT" />
            <MetricCard label="Boiler/steam generator" value={result.system_sizing?.boiler_tph} unit="ton/hr" />
            <MetricCard label="Heat exchanger" value={result.system_sizing?.heat_exchanger_kw} unit="kW" />
            <MetricCard label="Main chiller" value={result.system_sizing?.main_chiller_rt} unit="RT" />
            <MetricCard label="Backup chiller" value={result.system_sizing?.backup_chiller_rt} unit="RT" />
          </div>

          <Dispatch15MinProfile project={project} result={result} />
        </>
      )}
    </>
  );
}
