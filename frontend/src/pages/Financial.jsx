import { useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import ResultTable from '../components/ResultTable';
import { useProject } from '../state/ProjectContext';
import { moneyShort, percentValue } from '../utils/formatters';
export default function Financial() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);
  return <>
    <PageHeader title="Financial Indicators" subtitle="Savings-based Step03 economics: avoided cost, export revenue, O&M, NPV, IRR and payback." />
    {!result && <div className="notice">No project selected.</div>}
    {result && <><div className="grid cards"><MetricCard label="Year-1 net savings" value={moneyShort(result.financial.year1_net_project_savings_lkr_y)} unit="/y" /><MetricCard label="Simple payback" value={result.financial.simple_payback_years} unit="years" /><MetricCard label="NPV" value={moneyShort(result.financial.npv_lkr)} unit="" /><MetricCard label="IRR" value={`${percentValue(result.financial.irr_percent)}%`} unit="" /><MetricCard label="Profitability index" value={result.financial.profitability_index} unit="ratio" /><MetricCard label="Life-cycle savings" value={moneyShort(result.financial.annual_life_cycle_savings_lkr_y)} unit="/y" /></div><section className="panel"><h3>Financial calculation table</h3><ResultTable data={result.financial} /></section></>}
  </>;
}
