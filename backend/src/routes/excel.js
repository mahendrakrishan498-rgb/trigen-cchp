const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function toText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function getCell(sheet, address) {
  return sheet[address] ? sheet[address].v : '';
}

function setIfText(obj, key, value) {
  const text = toText(value);
  if (text !== '') obj[key] = text;
}

function setIfNumber(obj, key, value) {
  if (value === undefined || value === null || value === '') return;
  const n = toNumber(value, null);
  if (n !== null && Number.isFinite(n)) obj[key] = n;
}

function findMonthlyHeaderRow(sheet) {
  if (!sheet['!ref']) return -1;

  const range = XLSX.utils.decode_range(sheet['!ref']);

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const cellAddress = XLSX.utils.encode_cell({ r, c: 0 });
    const value = toText(sheet[cellAddress]?.v).toLowerCase();

    if (value === 'month') return r;
  }

  return -1;
}

function readMonthlyProfile(sheet) {
  const headerRow = findMonthlyHeaderRow(sheet);
  if (headerRow === -1) return [];

  const profile = [];

  for (let i = 1; i <= 12; i += 1) {
    const r = headerRow + i;

    const month = toText(sheet[XLSX.utils.encode_cell({ r, c: 0 })]?.v);
    const occupancy = sheet[XLSX.utils.encode_cell({ r, c: 1 })]?.v;
    const electricity = sheet[XLSX.utils.encode_cell({ r, c: 2 })]?.v;
    const cooling = sheet[XLSX.utils.encode_cell({ r, c: 3 })]?.v;
    const heating = sheet[XLSX.utils.encode_cell({ r, c: 4 })]?.v;

    const hasData =
      occupancy !== '' ||
      electricity !== '' ||
      cooling !== '' ||
      heating !== '';

    if (!month || !hasData) continue;

    profile.push({
      month,
      occupancy_percent: toNumber(occupancy, 0),
      hotel_electricity_kwh: toNumber(electricity, 0),
      cooling_thermal_kwh: toNumber(cooling, 0),
      heating_thermal_kwh: toNumber(heating, 0)
    });
  }

  return profile;
}

router.get('/test', (req, res) => {
  res.json({
    ok: true,
    message: 'Excel route is working'
  });
});

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

    const inputsUpdate = {};

    // Main project inputs from column C
    setIfText(inputsUpdate, 'title', getCell(sheet, 'C1'));
    setIfText(inputsUpdate, 'hotel_name', getCell(sheet, 'C2'));
    setIfNumber(inputsUpdate, 'financial_year', getCell(sheet, 'C3'));
    setIfNumber(inputsUpdate, 'rooms', getCell(sheet, 'C4'));

    // Extra design inputs from column C
    setIfText(inputsUpdate, 'location', getCell(sheet, 'C5'));
    setIfText(inputsUpdate, 'laundry_operation', getCell(sheet, 'C6'));
    setIfNumber(inputsUpdate, 'electricity_intensity_kwh_room_day', getCell(sheet, 'C7'));
    setIfNumber(inputsUpdate, 'cooling_share', getCell(sheet, 'C8'));
    setIfNumber(inputsUpdate, 'dhw_l_orn', getCell(sheet, 'C9'));
    setIfNumber(inputsUpdate, 'occupancy_percent', getCell(sheet, 'C10'));
    setIfNumber(inputsUpdate, 'grid_import_tariff_lkr_kwh', getCell(sheet, 'C11'));
    setIfText(inputsUpdate, 'selected_biomass_fuel', getCell(sheet, 'C12'));
    setIfNumber(inputsUpdate, 'selected_biomass_delivered_cost_lkr_kg', getCell(sheet, 'C13'));
    setIfNumber(inputsUpdate, 'selected_biomass_lhv_kwh_kg', getCell(sheet, 'C14'));

    const monthlyProfile = readMonthlyProfile(sheet);

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

    return res.json({
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