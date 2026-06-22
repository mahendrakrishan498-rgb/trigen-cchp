import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import { apiRequest } from '../api';
import { useProject } from '../state/ProjectContext';
import { moneyShort, percentValue } from '../utils/formatters';

const defaults = {
  title: 'Sample Hotel Feasibility Study',
  hotel_name: 'Sample Hotel',
  location: 'South/South-West Coast',
  rooms: 150,
  occupancy_percent: 71,
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
  analysis_period_years: 20,
  discount_rate: 0.12,
  inflation_escalation_rate: 0.025,
  grid_import_tariff_lkr_kwh: 16.291666666666668,
  selected_biomass_fuel: 'Gliricidia',
  selected_biomass_delivered_cost_lkr_kg: 12,
  selected_biomass_lhv_kwh_kg: 4,
  main_chiller_share: 0.8,
  sustainable_market_scenario: 'No',
  sustainable_room_rate_lkr: 30000,
  sustainable_room_price_increase_fraction: 0.1
};

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const excelTemplateUrl = 'https://drive.usercontent.google.com/download?id=1X5pWJXu52SSiQ7tU2rmENgJn8D48guxI&export=download&authuser=1&confirm=t&uuid=2a71b701-427a-4e19-ac1a-e81d4cca678c&at=ALBwUgkSZj-gCrk9Pa9_1WsGg3ee:1778060356483';

function makeMonthlyRows(profile = []) {
  return months.map((month, index) => {
    const row = profile[index] || {};

    return {
      month: row.month || month,
      occupancy_percent: row.occupancy_percent ?? '',
      hotel_electricity_kwh: row.hotel_electricity_kwh ?? '',
      cooling_thermal_kwh: row.cooling_thermal_kwh ?? '',
      heating_thermal_kwh: row.heating_thermal_kwh ?? ''
    };
  });
}

function normalizeMonthlyFactors(value) {
  const defaults = [1.42, 1.28, 1.03, 1.20, 0.94, 0.45, 0.64, 0.89, 0.78, 0.98, 1.06, 1.31];
  const source = Array.isArray(value) ? value : [];
  return defaults.map((fallback, index) => {
    const n = Number(source[index]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  });
}

function hasMonthlyLoadData(rows) {
  return rows.some((row) =>
    ['hotel_electricity_kwh', 'cooling_thermal_kwh', 'heating_thermal_kwh'].some((field) =>
      String(row[field] ?? '').trim() !== '' && Number(row[field] || 0) !== 0
    )
  );
}

function defaultLaundryForCluster(name) {
  return /hill/i.test(name || '') ? 'Yes' : 'No';
}

export default function NewDesign() {
  
  const { setProjectId, setProject, projectId } = useProject();
  const [inputs, setInputs] = useState({ ...defaults, project_id: projectId || '' });
  const [clusters, setClusters] = useState([]);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');

  const [excelFile, setExcelFile] = useState(null);
const [excelFileName, setExcelFileName] = useState('No file selected');
const [excelMessage, setExcelMessage] = useState('');
const [monthlyRows, setMonthlyRows] = useState(() => makeMonthlyRows());
const [showMonthlyProfile, setShowMonthlyProfile] = useState(false);
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

      laundry_operation:
        defaultLaundryForCluster(cluster.cluster_name),
  
      grid_import_tariff_lkr_kwh:
        Number(cluster.grid_import_tariff_lkr_kwh || 0),
  
      selected_biomass_fuel:
        cluster.selected_biomass_fuel || 'Gliricidia',
  
      selected_biomass_delivered_cost_lkr_kg:
        Number(cluster.selected_biomass_delivered_cost_lkr_kg || 0),
  
      selected_biomass_lhv_kwh_kg:
        Number(cluster.selected_biomass_lhv_kwh_kg || 0),

      monthly_factors:
        normalizeMonthlyFactors(cluster.monthly_factors)
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

  function updateMonthlyRow(index, field, value) {
    setMonthlyRows((old) => old.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  }

  function getManualMonthlyProfile() {
    if (!hasMonthlyLoadData(monthlyRows)) return [];

    return monthlyRows.map((row, index) => ({
      month: row.month || months[index],
      occupancy_percent: Number(row.occupancy_percent || 0),
      hotel_electricity_kwh: Number(row.hotel_electricity_kwh || 0),
      cooling_thermal_kwh: Number(row.cooling_thermal_kwh || 0),
      heating_thermal_kwh: Number(row.heating_thermal_kwh || 0)
    }));
  }

  function buildCalculationInputs() {
    const profile = getManualMonthlyProfile();
    const payload = { ...inputs };

    if (profile.length > 0) {
      payload.monthly_profile = profile;
    } else {
      delete payload.monthly_profile;
    }

    return payload;
  }

  function useDefaultMonthlyFactors() {
    setMonthlyRows(makeMonthlyRows());
    setShowMonthlyProfile(false);
    setInputs((old) => {
      const next = { ...old };
      delete next.monthly_profile;
      return next;
    });
  }

  async function preview() {
    const payload = buildCalculationInputs();
    const data = await apiRequest('/calculations/preview', { method: 'POST', body: payload });
    setResult(data);
    setMessage('Simulation completed using V3 Step03 Excel-linked equations.');
  }

  async function save() {
    const payload = buildCalculationInputs();
    const data = await apiRequest('/calculations/save', { method: 'POST', body: payload });
    setProjectId(data.id);
    setProject({ id:data.id, ...payload, result:data.result });
    setInputs({ ...payload, project_id: data.id });
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
    const link = document.createElement('a');
    link.href = excelTemplateUrl;
    link.setAttribute('download', 'hotel_energy_input_template.xlsx');
    link.style.display = 'none';
  
    document.body.appendChild(link);
    link.click();
  
    document.body.removeChild(link);
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
    if (!excelFile) {
      setExcelMessage('Please select an Excel/CSV file first.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', excelFile);
      const data = await apiRequest('/excel/upload', {
        method: 'POST',
        body: formData
      });
      const uploadedProfile = data.monthly_profile && data.monthly_profile.length > 0
        ? data.monthly_profile
        : [];
      const uploadedRows = makeMonthlyRows(uploadedProfile);
      const hasUploadedMonthlyLoad = hasMonthlyLoadData(uploadedRows);
  
      setInputs((old) => {
        const next = {
          ...old,

          // Update input tab fields from Excel C1:C14
          ...(data.inputs_update || {}),

          // Save uploaded file name
          excel_input_file_name: data.file_name,

          uploaded_annual_electricity_kwh: data.summary.annual_electricity_kwh,
          uploaded_annual_cooling_thermal_kwh: data.summary.annual_cooling_thermal_kwh,
          uploaded_annual_heating_demand_kwh_th: data.summary.annual_heating_demand_kwh_th
        };

        if (hasUploadedMonthlyLoad) {
          next.monthly_profile = uploadedProfile;
        } else {
          delete next.monthly_profile;
        }

        return next;
      });

      setMonthlyRows(uploadedRows);
      setShowMonthlyProfile(hasUploadedMonthlyLoad);
  
      setExcelFileName(data.file_name);
  
      if (hasUploadedMonthlyLoad) {
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
            Sustainable tourism premium market scenario in cash flow
            <select
              value={inputs.sustainable_market_scenario}
              onChange={(e) => setField('sustainable_market_scenario', e.target.value)}
            >
              <option>Yes</option>
              <option>No</option>
            </select>
          </label>

          {inputs.sustainable_market_scenario === 'Yes' && (
            <div className="form-grid">
              <label>
                Sustainable room rate (LKR/night)
                <input
                  type="number"
                  step="any"
                  value={inputs.sustainable_room_rate_lkr ?? ''}
                  onChange={(e) => setField('sustainable_room_rate_lkr', Number(e.target.value))}
                />
              </label>

              <label>
                Room price increase fraction
                <input
                  type="number"
                  step="any"
                  value={inputs.sustainable_room_price_increase_fraction ?? ''}
                  onChange={(e) => setField('sustainable_room_price_increase_fraction', Number(e.target.value))}
                />
              </label>
            </div>
          )}
  
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

            <button type="button" className="secondary" onClick={() => setShowMonthlyProfile(true)}>
              Enter Monthly Data
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
                    <td>{moneyShort(result.financial?.npv_lkr)}</td>
                  </tr>
  
                  <tr>
                    <td>IRR</td>
                    <td>{percentValue(result.financial?.irr_percent)}%</td>
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

      {showMonthlyProfile && (
        <section className="panel">
          <div className="button-row monthly-profile-header">
            <h3>Monthly Load Profile</h3>
            <button type="button" className="secondary" onClick={useDefaultMonthlyFactors}>
              Use Monthly Factors
            </button>
          </div>

          <div className="table-scroll">
            <table className="data-table monthly-input-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Occupancy %</th>
                  <th>Electricity kWh</th>
                  <th>Cooling kWh</th>
                  <th>Heating kWh</th>
                </tr>
              </thead>

              <tbody>
                {monthlyRows.map((row, index) => (
                  <tr key={months[index]}>
                    <td>{row.month || months[index]}</td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={row.occupancy_percent}
                        onChange={(e) => updateMonthlyRow(index, 'occupancy_percent', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={row.hotel_electricity_kwh}
                        onChange={(e) => updateMonthlyRow(index, 'hotel_electricity_kwh', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={row.cooling_thermal_kwh}
                        onChange={(e) => updateMonthlyRow(index, 'cooling_thermal_kwh', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={row.heating_thermal_kwh}
                        onChange={(e) => updateMonthlyRow(index, 'heating_thermal_kwh', e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
  
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
