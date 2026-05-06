import { useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import ResultTable from '../components/ResultTable';
import { useProject } from '../state/ProjectContext';

export default function Step02Design() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);

  const design = result?.step02_technical_design || {};
  const sizing = result?.system_sizing || {};
  const totalChillerRt =
    Number(sizing.main_chiller_rt || 0) + Number(sizing.backup_chiller_rt || 0);
  const configurationComponents = [
    ['1', 'Biomass-fired boiler / steam generator', sizing.boiler_tph, 'ton/hr'],
    ['2', 'High-pressure steam line', design.selected_turbine_inlet_steam_flow_kg_h, 'kg/h'],
    ['3', 'Extraction-condensing steam turbine', sizing.turbine_kw, 'kW'],
    ['4', 'Electric generator output', sizing.turbine_kw, 'kW'],
    ['5a', 'Absorption chiller generator', totalChillerRt || sizing.absorption_chiller_rt, 'RT'],
    ['5b', 'DHW heat exchanger', sizing.heat_exchanger_kw, 'kW']
  ];

  return <>
    <PageHeader title="Technical Design" subtitle="Dual absorption chiller selection, extraction steam turbine selection and 15-minute dispatch." />
    {!result && <div className="notice">No project selected.</div>}
    {result && <>
      <div className="grid cards"><MetricCard label="Design cooling" value={result.step02_technical_design.design_cooling_rt} unit="RT" /><MetricCard label="Main chiller" value={result.system_sizing.main_chiller_rt} unit="RT" /><MetricCard label="Backup chiller" value={result.system_sizing.backup_chiller_rt} unit="RT" /><MetricCard label="Turbine" value={result.system_sizing.turbine_kw} unit="kW" /><MetricCard label="Process steam" value={result.step02_technical_design.process_steam_flow_kg_h} unit="kg/h" /><MetricCard label="Exhaust steam" value={result.step02_technical_design.exhaust_steam_design_kg_h} unit="kg/h" /></div>
      <section className="panel configuration-panel">
        <div className="configuration-header">
          <h3>Trigeneration configuration</h3>
          <span>Components 1-5b</span>
        </div>
        <div className="configuration-component-grid">
          {configurationComponents.map(([index, label, value, unit]) => (
            <div className="configuration-component" key={index}>
              <strong>{index}</strong>
              <span>{label}</span>
              <small>{value ?? 'N/A'} {unit}</small>
            </div>
          ))}
        </div>
        <img
          className="configuration-image"
          src="/configuration-01.png"
          alt="Biomass-fired extraction-condensing trigeneration configuration"
        />
      </section>
      <section className="panel"><h3>Technical design calculations</h3><ResultTable data={result.step02_technical_design} /></section>
    </>}
  </>;
}
