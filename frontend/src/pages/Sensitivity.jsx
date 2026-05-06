import { useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import PageHeader from '../components/PageHeader';
import { useProject } from '../state/ProjectContext';
import { compactNumber, moneyShort } from '../utils/formatters';

export default function Sensitivity() {
  const { projectId, project, loadProject, result } = useProject();
  useEffect(() => { if (projectId && !project) loadProject(projectId).catch(() => {}); }, [projectId]);
  const rows = result?.sensitivity || [];

  return <>
    <PageHeader title="Step03 Sensitivity" subtitle="One-way checks around CAPEX, grid tariff, biomass cost and export tariff." />
    {!result && <div className="notice">No project selected.</div>}
    {result && <>
      <section className="panel chart-panel">
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="scenario" angle={-18} textAnchor="end" height={80} />
            <YAxis tickFormatter={(v) => compactNumber(v)} />
            <Tooltip />
            <Legend />
            <Bar dataKey="adjusted_simple_payback_years" name="Payback years" fill="#f79009" />
          </BarChart>
        </ResponsiveContainer>
      </section>
      <section className="panel">
        <table className="data-table">
          <thead>
            <tr><th>Scenario</th><th>Year-1 savings</th><th>NPV</th><th>Payback</th><th>GHG reduction kgCO2/y</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.scenario}>
                <td>{r.scenario}</td>
                <td>{moneyShort(r.adjusted_year1_net_project_savings_lkr)}</td>
                <td>{moneyShort(r.adjusted_npv_lkr)}</td>
                <td>{r.adjusted_simple_payback_years ?? 'N/A'}</td>
                <td>{compactNumber(r.adjusted_annual_ghg_reduction_kgco2_y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>}
  </>;
}
