const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

const router = express.Router();

// Important for Vercel: use memory storage, not disk storage
const upload = multer({
  storage: multer.memoryStorage()
});

function toNumber(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function pick(row, possibleNames, fallback = '') {
  const keys = Object.keys(row);

  for (const name of possibleNames) {
    const foundKey = keys.find(
      (k) => String(k).trim().toLowerCase() === String(name).trim().toLowerCase()
    );

    if (foundKey) return row[foundKey];
  }

  return fallback;
}

function normalizeMonth(value, index) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (!value) return months[index] || `Month ${index + 1}`;

  const text = String(value).trim();

  const found = months.find((m) => m.toLowerCase() === text.slice(0, 3).toLowerCase());

  return found || text;
}

function findValue(cells, startIndex = 1) {
  for (let i = startIndex; i < cells.length; i += 1) {
    const value = cells[i];
    if (String(value ?? '').trim() !== '') return value;
  }

  return '';
}

function normalizeLabel(value) {
  return String(value ?? '')
    .replace(/=/g, '')
    .trim()
    .toLowerCase();
}

const inputFieldMap = {
  'project titile': 'title',
  'project title': 'title',
  'hotel name': 'hotel_name',
  'project start year': 'financial_year',
  'financial/project year': 'financial_year',
  'number of rooms': 'rooms',
  'location / hotel cluster': 'location',
  'location': 'location',
  'laundry operation': 'laundry_operation',
  'electricity intensity (kwh/room/day)': 'electricity_intensity_kwh_room_day',
  'cooling share': 'cooling_share',
  'dhw l/orn': 'dhw_l_orn',
  'occupancy %': 'occupancy_percent',
  'grid import tariff (lkr/kwh)': 'grid_import_tariff_lkr_kwh',
  'selected biomass fuel': 'selected_biomass_fuel',
  'biomass price (lkr/kg)': 'selected_biomass_delivered_cost_lkr_kg',
  'biomass lhv (kwh/kg)': 'selected_biomass_lhv_kwh_kg'
};

const textInputFields = new Set([
  'title',
  'hotel_name',
  'location',
  'laundry_operation',
  'selected_biomass_fuel'
]);

function parseInputsUpdate(arrayRows) {
  const updates = {};

  arrayRows.slice(0, 20).forEach((cells) => {
    const label = normalizeLabel(cells[0]);
    const field = inputFieldMap[label];
    if (!field) return;

    const rawValue = findValue(cells, 1);
    if (String(rawValue ?? '').trim() === '') return;

    updates[field] = textInputFields.has(field)
      ? String(rawValue).trim()
      : toNumber(rawValue, 0);
  });

  return updates;
}

function findMonthlyHeaderIndex(arrayRows) {
  return arrayRows.findIndex((cells) =>
    cells.some((cell) => normalizeLabel(cell) === 'month')
  );
}

function parseMonthlyProfile(arrayRows, objectRows) {
  const headerIndex = findMonthlyHeaderIndex(arrayRows);

  if (headerIndex >= 0) {
    const headers = arrayRows[headerIndex].map((cell) => String(cell ?? '').trim());
    const dataRows = arrayRows.slice(headerIndex + 1).filter((cells) =>
      cells.some((cell) => String(cell ?? '').trim() !== '')
    );

    return dataRows.slice(0, 12).map((cells, index) => {
      const row = {};
      headers.forEach((header, columnIndex) => {
        if (header) row[header] = cells[columnIndex] ?? '';
      });

      return buildMonthlyRow(row, index);
    });
  }

  return objectRows.slice(0, 12).map((row, index) => buildMonthlyRow(row, index));
}

function buildMonthlyRow(row, index) {
  const month = normalizeMonth(
    pick(row, ['Month', 'month', 'MONTH'], ''),
    index
  );

  return {
    month,

    occupancy_percent: toNumber(
      pick(row, ['Occupancy %', 'Occupancy', 'occupancy_percent', 'occupancy'], 0),
      0
    ),

    hotel_electricity_kwh: toNumber(
      pick(row, ['Electricity kWh', 'Electricity', 'hotel_electricity_kwh', 'electricity_kwh'], 0),
      0
    ),

    cooling_thermal_kwh: toNumber(
      pick(row, ['Cooling kWh', 'Cooling thermal kWh', 'cooling_thermal_kwh', 'cooling_kwh'], 0),
      0
    ),

    heating_thermal_kwh: toNumber(
      pick(row, ['Heating kWh', 'Heating thermal kWh', 'heating_thermal_kwh', 'heating_kwh'], 0),
      0
    )
  };
}

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: 'No file uploaded'
      });
    }

    const workbook = XLSX.read(req.file.buffer, {
      type: 'buffer'
    });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: ''
    });
    const arrayRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: ''
    });

    if (!rows.length && !arrayRows.length) {
      return res.status(400).json({
        message: 'Excel file is empty'
      });
    }

    const inputsUpdate = parseInputsUpdate(arrayRows);
    const monthlyProfile = parseMonthlyProfile(arrayRows, rows);

    const annualElectricityKwh = monthlyProfile.reduce(
      (sum, r) => sum + Number(r.hotel_electricity_kwh || 0),
      0
    );

    const annualCoolingKwh = monthlyProfile.reduce(
      (sum, r) => sum + Number(r.cooling_thermal_kwh || 0),
      0
    );

    const annualHeatingKwh = monthlyProfile.reduce(
      (sum, r) => sum + Number(r.heating_thermal_kwh || 0),
      0
    );

    res.json({
      message: 'Excel input file uploaded and processed successfully',
      file_name: req.file.originalname,
      sheet_name: sheetName,
      inputs_update: inputsUpdate,
      monthly_profile: monthlyProfile,
      summary: {
        annual_electricity_kwh: annualElectricityKwh,
        annual_cooling_thermal_kwh: annualCoolingKwh,
        annual_heating_demand_kwh_th: annualHeatingKwh,
        average_daily_electricity_kwh: annualElectricityKwh / 365,
        average_daily_cooling_kwh: annualCoolingKwh / 365,
        average_daily_heating_kwh: annualHeatingKwh / 365
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
