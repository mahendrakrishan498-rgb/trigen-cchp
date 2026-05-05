import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import { apiRequest } from '../api';
import { useProject } from '../state/ProjectContext';

const defaults = {
  title: 'South-West Hotel Step03 Feasibility',
  hotel_name: 'Sample South-West Resort',
  location: 'South/South-West Coast',
  rooms: 250,
  occupancy_percent: 83,
  electricity_intensity_kwh_room_day: 50,
  cooling_share: 0.591470459820233,
  electric_chiller_cop: 5,
  absorption_chiller_cop: 0.7,
  dhw_l_orn: 308,
  cold_water_temp_c: 27.5,
  hot_water_temp_c: 55,
  hot_water_loss_factor: 0.25,
  laundry_operation: 'No',
  financial_year: 2026,
  analysis_period_years: 25,
  discount_rate: 0.12,
  inflation_escalation_rate: 0.05,
  grid_import_tariff_lkr_kwh: 62,
  selected_biomass_fuel: 'Gliricidia',
  selected_biomass_delivered_cost_lkr_kg: 35,
  selected_biomass_lhv_kwh_kg: 4,
  main_chiller_share: 0.8
};

function money(v) { return Number(v || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 }); }

export default function NewDesign() {
  
  const { setProjectId, setProject, projectId } = useProject();
  const [inputs, setInputs] = useState({ ...defaults, project_id: projectId || '' });
  const [clusters, setClusters] = useState([]);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');

  const [excelFile, setExcelFile] = useState(null);
const [excelFileName, setExcelFileName] = useState('No file selected');
const [excelMessage, setExcelMessage] = useState('');
  useEffect(() => {
    apiRequest('/clusters').then((rows) => {
      setClusters(rows);
      const selected = rows.find((c) => c.cluster_name === inputs.location);
      if (selected) applyCluster(selected, false);
    }).catch(() => {});
  }, []);

  function setField(k, v) { setInputs((old) => ({ ...old, [k]: v })); }

  function applyCluster(cluster, showMessage = true) {
    if (!cluster) return;
  
    setInputs((old) => ({
      ...old,
      location: cluster.cluster_name,
  
      electricity_intensity_kwh_room_day:
        Number(cluster.electricity_intensity_kwh_room_day || 0),
  
      cooling_share:
        Number(cluster.cooling_share || 0),
  
      dhw_l_orn:
        Number(cluster.dhw_l_orn || 0),
  
      occupancy_percent:
        Number(cluster.occupancy_percent || 0),
  
      grid_import_tariff_lkr_kwh:
        Number(cluster.grid_import_tariff_lkr_kwh || 0),
  
      selected_biomass_fuel:
        cluster.selected_biomass_fuel || 'Gliricidia',
  
      selected_biomass_delivered_cost_lkr_kg:
        Number(cluster.selected_biomass_delivered_cost_lkr_kg || 0),
  
      selected_biomass_lhv_kwh_kg:
        Number(cluster.selected_biomass_lhv_kwh_kg || 0)
    }));
  
    if (showMessage) {
      setMessage(`Cluster defaults loaded: ${cluster.cluster_name}. You can still edit values manually.`);
    }
  }

  function changeCluster(name) {
    const cluster = clusters.find((c) => c.cluster_name === name);
  
    if (!cluster) {
      setField('location', name);
      return;
    }
  
    applyCluster(cluster, true);
  }

  async function preview() {
    const data = await apiRequest('/calculations/preview', { method: 'POST', body: inputs });
    setResult(data);
    setMessage('Simulation completed using V3 Step03 Excel-linked equations.');
  }

  async function save() {
    const data = await apiRequest('/calculations/save', { method: 'POST', body: inputs });
    setProjectId(data.id);
    setProject({ id:data.id, ...inputs, result:data.result });
    setInputs({ ...inputs, project_id: data.id });
    setResult(data.result);
    setMessage(data.message);
  }

  const fields = [
    ['title','Project title','text'],
    ['hotel_name','Hotel name','text'],
    ['financial_year','Financial/project year','number'],
    ['rooms','Number of rooms','number'],
    ['occupancy_percent','Occupancy (%)','number'],
    ['electricity_intensity_kwh_room_day','Electricity intensity (kWh/room/day)','number'],
    ['cooling_share','Cooling share (fraction)','number'],
    ['dhw_l_orn','DHW L/ORN','number'],
    ['grid_import_tariff_lkr_kwh','Grid import tariff (LKR/kWh)','number'],
    ['selected_biomass_delivered_cost_lkr_kg','Biomass price (LKR/kg)','number'],
    ['selected_biomass_lhv_kwh_kg','Biomass LHV (kWh/kg)','number'],
    ['main_chiller_share','Main chiller share (0.8 = 80/20)','number'],
    ['analysis_period_years','Analysis period (years)','number'],
    ['discount_rate','Discount rate','number'],
    ['inflation_escalation_rate','Escalation rate','number']
  ];
  function downloadExcelTemplate() {
    const csvContent =
      'Project Titile=,,\n' +
      'Hotel name=,,\n' +
      'Project Start year=,,\n' +
      'Number of Rooms=,,\n' +
      'Location / Hotel cluster=,,\n' +
      'Laundry operation=,,No\n' +
      'Electricity intensity (kWh/room/day)=,,\n' +
      'Cooling share=,,\n' +
      'DHW L/ORN=,,\n' +
      'Occupancy %=,,\n' +
      'Grid import tariff (LKR/kWh)=,,\n' +
      'Selected biomass fuel=,,\n' +
      'Biomass price (LKR/kg)=,,\n' +
      'Biomass LHV (kWh/kg)=,,\n' +
      '\n' +
      'Month,Occupancy %,Electricity kWh,Cooling kWh,Heating kWh\n' +
      'Jan,,,,\n' +
      'Feb,,,,\n' +
      'Mar,,,,\n' +
      'Apr,,,,\n' +
      'May,,,,\n' +
      'Jun,,,,\n' +
      'Jul,,,,\n' +
      'Aug,,,,\n' +
      'Sep,,,,\n' +
      'Oct,,,,\n' +
      'Nov,,,,\n' +
      'Dec,,,,\n';
  
    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8'
    });
  
    const url = window.URL.createObjectURL(blob);
  
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'hotel_energy_input_template.csv');
    link.style.display = 'none';
  
    document.body.appendChild(link);
    link.click();
  
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
  
  function handleExcelSelect(e) {
    const file = e.target.files[0];
  
    if (!file) {
      setExcelFile(null);
      setExcelFileName('No file selected');
      return;
    }
  
    setExcelFile(file);
    setExcelFileName(file.name);
    setExcelMessage('File selected. Click Upload to attach this Excel input file.');
  }
  
  async function handleExcelUpload() {
    alert('Upload button clicked');
    console.log('Upload button clicked');
    if (!excelFile) {
      setExcelMessage('Please select an Excel/CSV file first.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', excelFile);
  
      const token = localStorage.getItem('token');
  
      const apiBase =
        (import.meta.env.VITE_API_BASE || 'http://localhost:5000/api').replace(/\/$/, '');
  
      const res = await fetch(`${apiBase}/excel/upload`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      });
  
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Excel upload failed');
      }
  
      const data = await res.json();
  
      setInputs((old) => ({
        ...old,
  
        // Update input tab fields from Excel C1:C14
        ...(data.inputs_update || {}),
  
        // Save uploaded file name
        excel_input_file_name: data.file_name,
  
        // Only add monthly profile if monthly data was filled
        ...(data.monthly_profile && data.monthly_profile.length > 0
          ? { monthly_profile: data.monthly_profile }
          : {}),
  
        uploaded_annual_electricity_kwh: data.summary.annual_electricity_kwh,
        uploaded_annual_cooling_thermal_kwh: data.summary.annual_cooling_thermal_kwh,
        uploaded_annual_heating_demand_kwh_th: data.summary.annual_heating_demand_kwh_th
      }));
  
      setExcelFileName(data.file_name);
  
      if (data.monthly_profile && data.monthly_profile.length > 0) {
        setExcelMessage(
          `Uploaded and processed: ${data.file_name}. Project inputs and monthly profile were updated. Now click Run Simulation.`
        );
      } else {
        setExcelMessage(
          `Uploaded and processed: ${data.file_name}. Project inputs were updated. Monthly graph data is blank.`
        );
      }
    } catch (err) {
      console.error(err);
      setExcelMessage(`Upload failed: ${err.message}`);
    }
  }

  return (
    <>
      <PageHeader
        title="Input"
        subtitle="Enter hotel, cluster, technical and financial inputs. Cluster defaults can be updated from the Cluster Data page."
      />
  
      {message && <p className="success">{message}</p>}
  
      <section className="panel">
        <h3>Hotel Cluster Selection</h3>
  
        <div className="form-grid">
          <label>
            Location / Hotel cluster
            <select
              value={inputs.location}
              onChange={(e) => changeCluster(e.target.value)}
            >
              <option value="">Select cluster</option>
  
              {clusters.map((c) => (
                <option key={c.id} value={c.cluster_name}>
                  {c.cluster_name}
                </option>
              ))}
            </select>
          </label>
  
          <label>
            Laundry operation?
            <select
              value={inputs.laundry_operation}
              onChange={(e) => setField('laundry_operation', e.target.value)}
            >
              <option>No</option>
              <option>Yes</option>
            </select>
          </label>
  
          <label>
            Selected biomass fuel
            <select
              value={inputs.selected_biomass_fuel}
              onChange={(e) => setField('selected_biomass_fuel', e.target.value)}
            >
              <option>Gliricidia</option>
              <option>Cinnamon</option>
              <option>Wood chips</option>
              <option>Agricultural residue</option>
              <option>Mixed biomass</option>
            </select>
          </label>
        </div>
  
        <p className="muted">
          Changing the cluster automatically fills electricity intensity, cooling share,
          DHW demand, tariff and biomass values. You can manually change them below.
        </p>
      </section>
  
      <div className="two-col">
        <section className="panel">
          <h3>Project and Excel-linked Inputs</h3>
  
          <div className="form-grid">
            {fields.map(([k, label, type]) => (
              <label key={k}>
                {label}
                <input
                  type={type}
                  step="any"
                  value={inputs[k] ?? ''}
                  onChange={(e) =>
                    setField(k, type === 'number' ? Number(e.target.value) : e.target.value)
                  }
                />
              </label>
            ))}
          </div>
  
          <label>
            CAPEX override (optional LKR)
            <input
              type="number"
              placeholder="Leave blank to use Excel CAPEX build-up"
              onChange={(e) =>
                setField('capex_lkr', e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
  
          <div className="button-row">
            <button onClick={save}>Save Project</button>
            <button onClick={preview}>Run Simulation</button>
          </div>
        </section>
  
        <section className="panel excel-upload-panel">
          <h3>Excel Input File</h3>
  
          <p className="muted">
            Upload the hotel energy input Excel/CSV file here. You can download the sample format first,
            fill the monthly data, and then upload it to attach with this project.
          </p>
  
          <div className="excel-box">
            <button type="button" className="secondary" onClick={downloadExcelTemplate}>
              Download Format
            </button>
  
            <div className="selected-file-box">
              <strong>Selected file:</strong>
              <span>{excelFileName}</span>
            </div>
  
            <label className="file-select-btn">
              Select File
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelSelect}
                hidden
              />
            </label>
  
            <button type="button" onClick={handleExcelUpload}>
              Upload
            </button>
  
            {excelMessage && <p className="success">{excelMessage}</p>}
          </div>
  
          {result && (
            <div className="mini-summary">
              <h4>Simulation Summary</h4>
  
              <table className="data-table">
                <tbody>
                  <tr>
                    <td>Turbine</td>
                    <td>{result.system_sizing?.turbine_kw || 0} kW</td>
                  </tr>
  
                  <tr>
                    <td>Dual chiller</td>
                    <td>
                      {(
                        Number(result.system_sizing?.main_chiller_rt || 0) +
                        Number(result.system_sizing?.backup_chiller_rt || 0)
                      ).toLocaleString()} RT
                    </td>
                  </tr>
  
                  <tr>
                    <td>NPV</td>
                    <td>{Number(result.financial?.npv_lkr || 0).toLocaleString()} LKR</td>
                  </tr>
  
                  <tr>
                    <td>IRR</td>
                    <td>{result.financial?.irr_percent || 0}%</td>
                  </tr>
  
                  <tr>
                    <td>Payback</td>
                    <td>{result.financial?.simple_payback_years || 0} years</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
  
      {result && (
        <section className="panel">
          <h3>Input Values Used in Simulation</h3>
  
          <table className="data-table">
            <thead>
              <tr>
                <th>Input</th>
                <th>Value</th>
              </tr>
            </thead>
  
            <tbody>
              {Object.entries(result.inputs_used || inputs).slice(0, 30).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>
                    {typeof v === 'number'
                      ? v.toLocaleString(undefined, { maximumFractionDigits: 4 })
                      : String(v)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}