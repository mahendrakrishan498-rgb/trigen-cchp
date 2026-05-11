import PageHeader from '../components/PageHeader';
export default function Methodology() {
  const sections = [
    ['Electricity', 'Annual electricity = rooms × 365 × electricity intensity, unless BMS/measured annual electricity is uploaded.'],
    ['Cooling', 'Cooling electricity = annual electricity × cooling share. Cooling thermal = cooling electricity × existing electric chiller COP.'],
    ['Heating', 'DHW heat = ORN × DHW L/ORN × 0.001163 × (Thot − Tcold) × (1 + losses). Laundry heat uses the workbook diesel heat coefficient.'],
    ['Chiller sizing', 'Peak cooling kW is converted to RT and increased by a sizing margin. The model selects main and backup absorption chillers from candidate RT sizes.'],
    ['Turbine sizing', 'Process steam demand = chiller steam duty + coincident heating duty. Turbine kW = steam flow × specific electric yield × utilization factor; the first suitable candidate turbine size is selected.'],
    ['CAPEX build-up', 'Direct CAPEX = chiller + turbine + steam generator + cooling integration + grid interconnection. Gross CAPEX adds installation, engineering and contingency.'],
    ['Avoided cost basis', 'Self-used electricity, cooling and steam are treated as avoided hotel costs. Only exported electricity is treated as direct revenue.'],
    ['Cash flow', 'Each year applies escalation and year-linked export tariff. Cash flow includes biomass cost, fixed O&M, variable O&M, insurance, overhaul and salvage value.'],
    ['Emissions', 'GHG reduction = baseline grid/heating emissions − project net emissions. Exported electricity receives a displacement credit.']
  ];
  return <><PageHeader title="Methodology & Equations" subtitle="Website equations follow the uploaded Step03 South-West Excel workbook logic." /><section className="panel equations">{sections.map(([h,p])=><div key={h}><h3>{h}</h3><p>{p}</p></div>)}</section></>;
}
