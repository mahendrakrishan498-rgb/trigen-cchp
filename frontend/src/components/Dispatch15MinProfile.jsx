import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { apiRequest } from '../api';

function round(value, digits = 4) {
  const m = 10 ** digits;
  return Math.round(Number(value || 0) * m) / m;
}

function DispatchChart({ title, children, data }) {
  return (
    <section className="panel chart-panel dispatch-chart">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time_hour" name="Hour" />
          <YAxis />
          <Tooltip />
          <Legend />
          {children}
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

function designDispatchRows(rows, result) {
  const designedTurbineKw = Number(result?.system_sizing?.turbine_kw || 0);
  const fallbackRatedPower = Math.max(...rows.map((row) => Number(row.turbine_output_kw || 0)), 800);
  const ratedPowerKw = designedTurbineKw || fallbackRatedPower;
  const avgElectricKw = Number(result?.step01_load_profile?.annual_electricity_kwh || 0) / 8760;
  const avgCoolingKw = Number(result?.step01_load_profile?.annual_cooling_thermal_kwh || 0) / 8760;

  return rows.map((row) => {
    const electricFactor = Number(row.hotel_electric_factor || 0) || 1;
    const coolingFactor = Number(row.cooling_thermal_factor || 0) || 1;
    const hotelElectricKw = Number(row.hotel_electric_kw || 0) || avgElectricKw * electricFactor;
    const coolingThermalKw = Number(row.cooling_thermal_kw || 0) || avgCoolingKw * coolingFactor;
    const turbineOutputKw = designedTurbineKw || Number(row.turbine_output_kw || 0);
    const loadFraction = ratedPowerKw > 0 ? hotelElectricKw / ratedPowerKw : 0;

    return {
      ...row,
      hotel_electric_kw: round(hotelElectricKw),
      cooling_thermal_kw: round(coolingThermalKw),
      turbine_output_kw: round(turbineOutputKw),
      grid_import_kw: round(Math.max(0, hotelElectricKw - turbineOutputKw)),
      grid_export_kw: round(Math.max(0, turbineOutputKw - hotelElectricKw)),
      voltage_output_v: round(Math.max(360, 400 * (1 - 0.04 * loadFraction))),
      frequency_hz: round(Math.max(49, 50 * (1 - 0.02 * loadFraction)))
    };
  });
}

export default function Dispatch15MinProfile({ project, result }) {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');

  const clusterName = project?.location || project?.inputs?.location || result?.inputs_used?.location || '';

  useEffect(() => {
    let ignore = false;

    async function loadDispatch() {
      if (!clusterName) {
        setRows([]);
        setMessage('No 15-minute dispatch data uploaded for this cluster.');
        return;
      }

      try {
        const clusters = await apiRequest('/clusters');
        const selected = clusters.find((cluster) => cluster.cluster_name === clusterName);
        if (!selected) {
          setRows([]);
          setMessage('No 15-minute dispatch data uploaded for this cluster.');
          return;
        }

        const data = await apiRequest(`/clusters/${selected.id}/dispatch15min`);
        if (ignore) return;
        setRows(data.rows || []);
        setMessage((data.rows || []).length ? '' : 'No 15-minute dispatch data uploaded for this cluster.');
      } catch (err) {
        if (!ignore) {
          setRows([]);
          setMessage(err.message || 'No 15-minute dispatch data uploaded for this cluster.');
        }
      }
    }

    loadDispatch();
    return () => { ignore = true; };
  }, [clusterName]);

  const chartRows = useMemo(() => designDispatchRows(rows, result), [rows, result]);

  return (
    <section className="panel">
      <h3>15-Minute CCHP Dispatch Profile</h3>
      {message && <p className="muted">{message}</p>}
      {chartRows.length > 0 && (
        <>
          <p className="muted">
            Turbine output, grid import/export, voltage and frequency are recalculated using the current system design turbine size.
          </p>
          <div className="dispatch-chart-grid">
            <DispatchChart title="Time vs Hotel Electric Load" data={chartRows}>
              <Line type="monotone" dataKey="hotel_electric_kw" name="Hotel electric kW" stroke="#0b74b8" strokeWidth={2} dot={false} />
            </DispatchChart>
            <DispatchChart title="Time vs Turbine Output" data={chartRows}>
              <Line type="monotone" dataKey="turbine_output_kw" name="Designed turbine kW" stroke="#6941c6" strokeWidth={2} dot={false} />
            </DispatchChart>
            <DispatchChart title="Time vs Cooling Thermal Load" data={chartRows}>
              <Line type="monotone" dataKey="cooling_thermal_kw" name="Cooling thermal kW" stroke="#14a879" strokeWidth={2} dot={false} />
            </DispatchChart>
            <DispatchChart title="Time vs Voltage Output" data={chartRows}>
              <Line type="monotone" dataKey="voltage_output_v" name="Voltage V" stroke="#f79009" strokeWidth={2} dot={false} />
            </DispatchChart>
            <DispatchChart title="Time vs Frequency" data={chartRows}>
              <Line type="monotone" dataKey="frequency_hz" name="Frequency Hz" stroke="#b42318" strokeWidth={2} dot={false} />
            </DispatchChart>
            <DispatchChart title="Time vs Grid Import and Grid Export" data={chartRows}>
              <Line type="monotone" dataKey="grid_import_kw" name="Grid import kW" stroke="#0b74b8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="grid_export_kw" name="Grid export kW" stroke="#14a879" strokeWidth={2} dot={false} />
            </DispatchChart>
          </div>
        </>
      )}
    </section>
  );
}
