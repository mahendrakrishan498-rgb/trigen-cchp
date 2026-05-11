import { useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import { useProject } from '../state/ProjectContext';
import { moneyShort, percentValue } from '../utils/formatters';

function statusText(value) {
  return value || 'N/A';
}

function statusClass(value) {
  if (value === 'PASS' || value === 'FEASIBLE') return 'status-cell status-pass';
  if (value === 'FAIL' || value === 'NOT FEASIBLE') return 'status-cell status-fail';
  return '';
}

export default function Feasibility() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);

  const financial = result?.financial || {};
  const fuel = result?.fuel || {};
  const feasibility = result?.feasibility || {};
  const rows = [
    ['NPV status', feasibility.npv_status, feasibility.npv_benchmark || 'NPV > 0', moneyShort(financial.npv_lkr)],
    ['IRR status', feasibility.irr_status, feasibility.irr_benchmark || 'IRR > 0', `${percentValue(financial.irr_percent)}%`],
    ['Simple payback status', feasibility.simple_payback_status, feasibility.simple_payback_benchmark || '<= analysis period', `${financial.simple_payback_years ?? 'N/A'} years`],
    ['Discounted payback status', feasibility.discounted_payback_status, feasibility.discounted_payback_benchmark || '<= analysis period', `${financial.discounted_payback_years ?? 'N/A'} years`],
    ['Biomass benchmark status', feasibility.biomass_benchmark_status, feasibility.biomass_benchmark || '<= 1500 t/mo', `${fuel.monthly_average_biomass_tonnes ?? 'N/A'} t/mo`]
  ];

  return <>
    <PageHeader title="Feasibility" subtitle="Excel-aligned project screening using NPV, IRR, payback and biomass supply threshold." />
    {!result && <div className="notice">No project selected.</div>}
    {result && <>
      <div className="grid cards">
        <MetricCard label="Final decision" value={feasibility.final_decision || 'N/A'} unit="" />
        <MetricCard label="NPV" value={moneyShort(financial.npv_lkr)} unit="" />
        <MetricCard label="IRR" value={`${percentValue(financial.irr_percent)}%`} unit="" />
        <MetricCard label="Discounted payback" value={financial.discounted_payback_years ?? 'N/A'} unit="years" />
        <MetricCard label="Biomass use" value={fuel.monthly_average_biomass_tonnes ?? 'N/A'} unit="t/mo" />
      </div>

      <section className="panel">
        <h3>Feasibility decision table</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Feasibility decision</th>
              <th>Value</th>
              <th>Benchmark</th>
              <th>Source / note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value, benchmark, note]) => (
              <tr key={label}>
                <th>{label}</th>
                <td className={statusClass(value)}>{statusText(value)}</td>
                <td>{benchmark}</td>
                <td>{note}</td>
              </tr>
            ))}
            <tr>
              <th>Final decision</th>
              <td className={statusClass(feasibility.final_decision)}>{feasibility.final_decision || 'N/A'}</td>
              <td>All checks PASS</td>
              <td>Conservative project screening result based on IRR, NPV, payback and biomass threshold.</td>
            </tr>
            <tr>
              <th>Supply note</th>
              <td colSpan="3">{feasibility.biomass_supply_note}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>}
  </>;
}
