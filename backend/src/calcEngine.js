const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
const CHILLER_CANDIDATES_RT = [100,150,200,250,300,350,400,500,600,700,800,1000,1200,1500,2000,2500,3000];
const TURBINE_CANDIDATES_KW = [50,75,100,150,200,250,300,350,400,500,600,700,800,1000,1250,1500,2000];
const EXPORT_TARIFFS = [
  { year:2026, om:2.35, fuel:23, fixed:17.92 }, { year:2027, om:2.60944, fuel:25.093, fixed:17.92 },
  { year:2028, om:2.897522176, fuel:27.376462999999994, fixed:17.92 }, { year:2029, om:3.217408624230401, fuel:29.86772113299999, fixed:17.92 },
  { year:2030, om:3.572610536345438, fuel:32.58568375610299, fixed:17.92 }, { year:2031, om:3.967026739557974, fuel:35.55098097790836, fixed:17.92 },
  { year:2032, om:4.404986491605174, fuel:38.786120246898015, fixed:17.92 }, { year:2033, om:4.891297000278386, fuel:42.31565718936573, fixed:17.92 },
  { year:2034, om:5.43129618910912, fuel:46.16638199359801, fixed:9.02 }, { year:2035, om:6.030911288386767, fuel:50.36752275501542, fixed:9.02 },
  { year:2036, om:6.696723894624666, fuel:54.95096732572182, fixed:9.02 }, { year:2037, om:7.4360422125912295, fuel:59.9515053523625, fixed:9.02 },
  { year:2038, om:8.256981272861303, fuel:65.40709233942749, fixed:9.02 }, { year:2039, om:9.168552005385191, fuel:71.35913774231538, fixed:9.02 },
  { year:2040, om:10.180760146779717, fuel:77.85281927686607, fixed:9.02 }, { year:2041, om:15.11, fuel:84.93742583106088, fixed:5.95 },
  { year:2042, om:16.778144, fuel:92.66673158168742, fixed:5.95 }, { year:2043, om:18.6304510976, fuel:101.09940415562096, fixed:5.95 },
  { year:2044, om:20.687252898775043, fuel:110.29944993378245, fixed:5.95 }, { year:2045, om:22.97112561879981, fuel:120.33669987775666, fixed:5.95 },
  { year:2046, om:25.50713788711531, fuel:131.2873395666325, fixed:5.95 }, { year:2047, om:28.32312590985284, fuel:143.23448746719606, fixed:5.95 },
  { year:2048, om:31.449999010300598, fuel:156.2688258267109, fixed:5.95 }, { year:2049, om:34.922078901037786, fuel:170.48928897694157, fixed:5.95 },
  { year:2050, om:38.77747641171236, fuel:186.00381427384323, fixed:5.95 }, { year:2051, om:43.05850980756541, fuel:202.93016137276297, fixed:5.95 },
  { year:2052, om:47.81216929032063, fuel:221.39680605768436, fixed:5.95 }, { year:2053, om:53.090632779972026, fuel:241.5439154089336, fixed:5.95 },
  { year:2054, om:58.95183863888094, fuel:263.5244117111465, fixed:5.95 }, { year:2055, om:65.46012162461341, fuel:287.50513317686085, fixed:5.95 },
  { year:2056, om:72.68691905197073, fuel:313.6681002959551, fixed:5.95 }, { year:2057, om:80.71155491530831, fuel:342.21189742288703, fixed:5.95 }
];

function n(value, fallback = 0) { const x = Number(value); return Number.isFinite(x) ? x : fallback; }
function round(value, digits = 2) { const p = 10 ** digits; return Math.round(n(value) * p) / p; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function nextCandidate(required, list) { return list.find((v) => v >= required) || list[list.length - 1]; }
function xnpv(rate, cashFlows) { return cashFlows.reduce((sum, cf, i) => sum + cf / ((1 + rate) ** i), 0); }
function irr(cashFlows) { let low = -0.9, high = 2; for (let i=0;i<120;i+=1) { const mid=(low+high)/2; if (xnpv(mid,cashFlows)>0) low=mid; else high=mid; } return (low+high)/2; }
function exportTariffForYear(year, table = EXPORT_TARIFFS) { const row = table.find((r) => Number(r.year) === Number(year)) || table[table.length-1]; return n(row.om) + n(row.fuel) + n(row.fixed); }
function annuity(rate, years) { return rate * ((1 + rate) ** years) / (((1 + rate) ** years) - 1); }

function normalizeInput15MinProfile(inputProfile) {
  if (!Array.isArray(inputProfile) || !inputProfile.length) return null;

  const rows = inputProfile.slice(0, 96).map((row, index) => {
    const electric = n(row.electric_factor ?? row.hotel_electric_factor ?? row.hotelElectricFactor, 0);
    const cooling = n(row.cooling_factor ?? row.cooling_thermal_factor ?? row.coolingThermalFactor, 0);
    return {
      time_fraction: n(row.time_fraction, index / 96),
      hour: n(row.hour ?? row.time_hour, index / 4),
      electric_factor: electric > 0 ? electric : 1,
      cooling_factor: cooling > 0 ? cooling : 1
    };
  });

  if (!rows.some((row) => row.electric_factor > 0 || row.cooling_factor > 0)) return null;

  return rows;
}

function make15MinProfile(inputProfile = null) {
  const supplied = normalizeInput15MinProfile(inputProfile);
  if (supplied) return supplied;

  const arr = [];
  for (let i=0;i<96;i+=1) {
    const h = i / 4;
    const morning = Math.exp(-((h - 8.2) ** 2) / 16);
    const evening = Math.exp(-((h - 19.2) ** 2) / 12);
    const nightDip = 0.72 + 0.12 * Math.sin((h - 5) * Math.PI / 12);
    const electricShape = 0.78 + 0.22 * morning + 0.42 * evening + 0.12 * nightDip;
    const coolingShape = 0.55 + 0.75 * Math.exp(-((h - 14.5) ** 2) / 36) + 0.28 * evening;
    arr.push({ time_fraction: round(i/96, 5), hour: round(h, 2), electric_factor: electricShape, cooling_factor: coolingShape });
  }
  const eAvg = arr.reduce((s,r)=>s+r.electric_factor,0)/arr.length;
  const cAvg = arr.reduce((s,r)=>s+r.cooling_factor,0)/arr.length;
  return arr.map((r) => { const c = r.cooling_factor / cAvg; return { ...r, electric_factor: r.electric_factor/eAvg, cooling_factor: 1 + (c - 1) * 0.52 }; });
}

function monthlyFactors(occupancyPercent, inputFactors = null) {
  const defaultBase = [1.42,1.28,1.03,1.20,0.94,0.45,0.64,0.89,0.78,0.98,1.06,1.31];
  const source = Array.isArray(inputFactors) && inputFactors.length ? inputFactors : defaultBase;
  const base = defaultBase.map((fallback, index) => {
    const value = Number(source[index]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  });
  const avg = base.reduce((a,b)=>a+b,0)/base.length;
  return base.map((v,i) => ({ month: MONTHS[i], days: DAYS[i], factor: v/avg, occupancy_percent: round(clamp(occupancyPercent * (0.92 + (v/avg - 1) * 0.18), 40, 100), 2) }));
}

function settingsValue(input, settings, key, fallback) { return n(input[key], n(settings[key], fallback)); }
function settingsString(input, settings, key, fallback) { return input[key] || settings[key] || fallback; }

function calculate(input = {}, settings = {}, equipmentRows = [], exportTariffs = EXPORT_TARIFFS, bmsSummary = null) {
  const tariffSchedule = Array.isArray(input.export_tariff_schedule) && input.export_tariff_schedule.length
    ? input.export_tariff_schedule
    : exportTariffs;
  const rooms = settingsValue(input, settings, 'rooms', 250);
  const occupancyPercent = settingsValue(input, settings, 'occupancy_percent', settings.default_occupancy_percent || 92);
  const occupancy = occupancyPercent > 1 ? occupancyPercent / 100 : occupancyPercent;
  const electricityIntensity = settingsValue(input, settings, 'electricity_intensity_kwh_room_day', 50);
  const coolingShare = settingsValue(input, settings, 'cooling_share', 0.591470459820233);
  const electricChillerCop = settingsValue(input, settings, 'electric_chiller_cop', 5);
  const absorptionCop = settingsValue(input, settings, 'absorption_chiller_cop', 0.7);
  const dhwLorn = settingsValue(input, settings, 'dhw_l_orn', 308);
  const cold = settingsValue(input, settings, 'cold_water_temp_c', 27.5);
  const hot = settingsValue(input, settings, 'hot_water_temp_c', 55);
  const waterConst = settingsValue(input, settings, 'water_heating_constant_kwh_l_c', 0.001163);
  const hotWaterLoss = settingsValue(input, settings, 'hot_water_loss_factor', 0.25);
  const laundryOperation = String(input.laundry_operation || input.laundryOperation || 'No').toLowerCase() === 'yes';
  const laundryAvailableL = settingsValue(input, settings, 'laundry_diesel_available_l_room_day', 0.716);
  const laundryOccupiedL = settingsValue(input, settings, 'laundry_diesel_occupied_l_orn', 2.182);
  const dieselThermalKwhL = settingsValue(input, settings, 'diesel_energy_kwh_l', 10);
  const existingBoilerEff = settingsValue(input, settings, 'existing_boiler_efficiency', 0.8);
  const biomassBoilerEff = settingsValue(input, settings, 'new_biomass_steam_generator_efficiency', 0.85);
  const steamDh = settingsValue(input, settings, 'steam_enthalpy_rise_kj_kg', 2100);
  const turbineSteamOperatingHours = settingsValue(input, settings, 'turbine_steam_operating_hours_y', 8760);
  const sizingMargin = settingsValue(input, settings, 'peak_cooling_sizing_margin', 0.1);
  const turbineYield = settingsValue(input, settings, 'extraction_turbine_specific_yield_kwh_kg', 0.12);
  const steamUtil = settingsValue(input, settings, 'steam_to_turbine_utilization_factor', 1);
  const heatCoincidence = settingsValue(input, settings, 'heating_coincidence_factor', 1.5);
  const workbookTurbineKwPerRoom = settingsValue(input, settings, 'workbook_turbine_kw_per_room', 0);
  const workbookChillerRtPerRoom = settingsValue(input, settings, 'workbook_chiller_rt_per_room', 0);
  const mainShare = clamp(settingsValue(input, settings, 'main_chiller_share', 0.8), 0.05, 0.95);
  const backupShare = 1 - mainShare;
  const analysisPeriod = Math.round(settingsValue(input, settings, 'analysis_period_years', 25));
  const financialMetricYears = Math.min(
    analysisPeriod,
    Math.round(settingsValue(input, settings, 'financial_metric_years', 20))
  );
  const discountRate = settingsValue(input, settings, 'discount_rate', 0.12);
  const escalation = settingsValue(input, settings, 'inflation_escalation_rate', 0.05);
  const projectYear = Math.round(settingsValue(input, settings, 'financial_year', 2026));
  const gridImportTariff = settingsValue(input, settings, 'grid_import_tariff_lkr_kwh', 16.2916666667);
  const exportTariffYear1 = settingsValue(input, settings, 'grid_export_tariff_lkr_kwh', exportTariffForYear(projectYear, tariffSchedule));
  const sustainableMarketScenario = /yes|true|1/i.test(String(input.sustainable_market_scenario || input.consider_sustainable_tourism_premium_market_scenario || 'No'));
  const sustainableRoomRate = settingsValue(input, settings, 'sustainable_room_rate_lkr', 30000);
  const sustainableRoomPriceIncrease = settingsValue(input, settings, 'sustainable_room_price_increase_fraction', 0.1);
  const biomassFuelType = settingsString(input, settings, 'selected_biomass_fuel', 'Gliricidia');
  const cinnamonCost = settingsValue(input, settings, 'cinnamon_delivered_cost_lkr_kg', 25);
  const gliricidiaCost = settingsValue(input, settings, 'gliricidia_delivered_cost_lkr_kg', 12);
  const cinnamonLhv = settingsValue(input, settings, 'cinnamon_lhv_kwh_kg', 4.2);
  const gliricidiaLhv = settingsValue(input, settings, 'gliricidia_lhv_kwh_kg', 4);
  const selectedBiomassCostKg = /cinnamon/i.test(biomassFuelType) ? cinnamonCost : settingsValue(input, settings, 'selected_biomass_delivered_cost_lkr_kg', gliricidiaCost);
  const selectedBiomassLhv = /cinnamon/i.test(biomassFuelType) ? cinnamonLhv : settingsValue(input, settings, 'selected_biomass_lhv_kwh_kg', gliricidiaLhv);
  const biomassFuelCostKwh = selectedBiomassCostKg / Math.max(selectedBiomassLhv, 0.01);
  const chillerCapexRate = settingsValue(input, settings, 'absorption_chiller_specific_capex_lkr_rt', 220000);
  const turbineCapexRate = settingsValue(input, settings, 'extraction_turbine_specific_capex_lkr_kw', 300000);
  const steamGeneratorCapexRate = settingsValue(input, settings, 'steam_generator_specific_capex_lkr_kg_h', 18000);
  const integrationCapexRate = settingsValue(input, settings, 'cooling_integration_specific_capex_lkr_rt', 40000);
  const gridInterconnectionRate = settingsValue(input, settings, 'grid_interconnection_specific_capex_lkr_kw', 20000);
  const fuelHandlingRate = settingsValue(input, settings, 'fuel_handling_specific_capex_lkr_kw', 0);
  const steamPipingFactor = settingsValue(input, settings, 'steam_condensate_piping_factor', 0);
  const waterTreatmentFactor = settingsValue(input, settings, 'water_treatment_condensate_factor', 0);
  const chwPipingFactor = settingsValue(input, settings, 'chw_cw_piping_factor', 0);
  const stackFlueGasRate = settingsValue(input, settings, 'stack_flue_gas_specific_capex_lkr_kw', 0);
  const electricalInstrumentationFactor = settingsValue(input, settings, 'electrical_instrumentation_factor', 0);
  const civilStructuralFactor = settingsValue(input, settings, 'civil_structural_factor', 0);
  const directCapexTaxFactor = settingsValue(input, settings, 'direct_capex_tax_factor', 1);
  const installationFactor = settingsValue(input, settings, 'installation_factor', 0.18);
  const engineeringFactor = settingsValue(input, settings, 'engineering_development_factor', 0.08);
  const contingencyFactor = settingsValue(input, settings, 'contingency_factor', 0.10);
  const grantSubsidy = settingsValue(input, settings, 'grant_subsidy_lkr', 0);
  const fixedOmRate = settingsValue(input, settings, 'fixed_om_rate_capex', 0.03);
  const variableTurbineOm = settingsValue(input, settings, 'variable_turbine_om_lkr_kwh', 1.5);
  const insuranceAdminRate = settingsValue(input, settings, 'insurance_admin_rate_capex', 0.005);
  const majorOverhaulYear = Math.round(settingsValue(input, settings, 'major_overhaul_year', 10));
  const majorOverhaulFraction = settingsValue(input, settings, 'major_overhaul_fraction_capex', 0.1);
  const salvageFraction = settingsValue(input, settings, 'salvage_value_fraction_capex', 0.1);
  const gridEmission = settingsValue(input, settings, 'grid_emission_kgco2_kwh', 0.65);
  const biomassEmission = settingsValue(input, settings, 'biomass_emission_kgco2_kwh_fuel', 0);

  const measuredElectricity = bmsSummary?.total_electricity_kwh ? n(bmsSummary.total_electricity_kwh) * (365 / Math.max(n(bmsSummary.days_covered, 365), 1)) : n(input.measured_annual_electricity_kwh, 0);
  const annualElectricity = measuredElectricity > 0 ? measuredElectricity : rooms * 365 * electricityIntensity;
  const finalCoolingShare = bmsSummary?.cooling_share_from_bms ? n(bmsSummary.cooling_share_from_bms, coolingShare) : coolingShare;
  const annualCoolingElectric = n(input.measured_chiller_electricity_kwh, 0) || annualElectricity * finalCoolingShare;
  const annualCoolingThermal = n(input.measured_cooling_thermal_kwh, 0) || annualCoolingElectric * electricChillerCop;
  const availableRoomNights = rooms * 365;
  const occupiedRoomNights = availableRoomNights * occupancy;
  const dhwHeat = occupiedRoomNights * dhwLorn * waterConst * (hot - cold) * (1 + hotWaterLoss);
  const laundryDieselLitres = laundryOperation ? availableRoomNights * laundryAvailableL : 0;
  const laundryHeat = laundryDieselLitres * dieselThermalKwhL;
  const annualHeatingDemand = n(input.measured_annual_heating_kwh, 0) || dhwHeat + laundryHeat;

  const profile = make15MinProfile(input.dispatch_15min_profile || input.dispatch_15min_factors);
  const avgElectricKw = annualElectricity / 8760;
  const avgCoolingThermalKw = annualCoolingThermal / 8760;
  const peakElectricKw = Math.max(...profile.map((p)=>avgElectricKw*p.electric_factor));
  const peakCoolingThermalKw = Math.max(...profile.map((p)=>avgCoolingThermalKw*p.cooling_factor));
  const peakCoolingRt = peakCoolingThermalKw / 3.517;
  const designCoolingRt = peakCoolingRt * (1 + sizingMargin);
  const requiredMainRt = designCoolingRt * mainShare;
  const requiredBackupRt = designCoolingRt * backupShare;
  let selectedMainRt = nextCandidate(requiredMainRt, CHILLER_CANDIDATES_RT);
  let selectedBackupRt = nextCandidate(requiredBackupRt, CHILLER_CANDIDATES_RT);
  let totalChillerRt = selectedMainRt + selectedBackupRt;
  const workbookMinimumChillerRt = workbookChillerRtPerRoom > 0
    ? nextCandidate(rooms * workbookChillerRtPerRoom, CHILLER_CANDIDATES_RT)
    : 0;
  if (workbookMinimumChillerRt > totalChillerRt) {
    selectedMainRt = workbookMinimumChillerRt;
    selectedBackupRt = 0;
    totalChillerRt = workbookMinimumChillerRt;
  }
  const mainChillerKw = selectedMainRt * 3.517;
  const backupChillerKw = selectedBackupRt * 3.517;
  const mainChillerSteamKw = mainChillerKw / absorptionCop;
  const backupChillerSteamKw = backupChillerKw / absorptionCop;
  const totalChillerSteamKw = mainChillerSteamKw + backupChillerSteamKw;
  const avgHeatingKw = annualHeatingDemand / 8760;
  const coincidentHeatingKw = avgHeatingKw * heatCoincidence;
  const totalProcessSteamKw = totalChillerSteamKw + coincidentHeatingKw;
  const processSteamFlowKgH = totalProcessSteamKw * 3600 / steamDh;
  const potentialTurbineKw = Math.max(
    processSteamFlowKgH * turbineYield * steamUtil,
    rooms * workbookTurbineKwPerRoom
  );
  const selectedTurbineKw = nextCandidate(potentialTurbineKw, TURBINE_CANDIDATES_KW);
  const selectedTurbineSteamFlowKgH = selectedTurbineKw / Math.max(turbineYield * steamUtil, 0.001);
  const exhaustSteamKgH = Math.max(0, selectedTurbineSteamFlowKgH - processSteamFlowKgH);
  const actualTurbineKw = selectedTurbineKw;

  const annualTurbineElectricity = actualTurbineKw * 8760;
  const gridBalance = profile.reduce((acc, p) => {
    const hotelElectric = avgElectricKw * p.electric_factor;
    const coolingThermal = avgCoolingThermalKw * p.cooling_factor;
    const coolingElectric = coolingThermal / electricChillerCop;
    const proposedHotelElectric = Math.max(0, hotelElectric - coolingElectric);
    acc.importKw += Math.max(0, proposedHotelElectric - actualTurbineKw);
    acc.exportKw += Math.max(0, actualTurbineKw - proposedHotelElectric);
    return acc;
  }, { importKw: 0, exportKw: 0 });
  const annualGridImport = gridBalance.importKw / profile.length * 8760;
  const annualGridExport = gridBalance.exportKw / profile.length * 8760;
  const annualProcessSteamUsedKg = annualHeatingDemand / (steamDh / 3600) + annualCoolingThermal / absorptionCop / (steamDh / 3600);
  const annualTurbineInletSteamKg = selectedTurbineSteamFlowKgH * turbineSteamOperatingHours;
  const annualExhaustSteamKg = Math.max(0, annualTurbineInletSteamKg - annualProcessSteamUsedKg);
  const exhaustRatio = annualTurbineInletSteamKg > 0 ? annualExhaustSteamKg / annualTurbineInletSteamKg : 0;

  const dualChillerCapex = totalChillerRt * chillerCapexRate;
  const turbineCapex = selectedTurbineKw * turbineCapexRate;
  const steamGeneratorCapex = selectedTurbineSteamFlowKgH * steamGeneratorCapexRate;
  const integrationCapex = totalChillerRt * integrationCapexRate;
  const gridInterconnectionCapex = selectedTurbineKw * gridInterconnectionRate;
  const mainEquipmentCapex = dualChillerCapex + turbineCapex + steamGeneratorCapex + integrationCapex + gridInterconnectionCapex;
  const fuelHandlingCapex = selectedTurbineKw * fuelHandlingRate;
  const steamPipingCapex = mainEquipmentCapex * steamPipingFactor;
  const waterTreatmentCapex = mainEquipmentCapex * waterTreatmentFactor;
  const chwPipingCapex = mainEquipmentCapex * chwPipingFactor;
  const stackFlueGasCapex = selectedTurbineKw * stackFlueGasRate;
  const electricalInstrumentationCapex = mainEquipmentCapex * electricalInstrumentationFactor;
  const civilStructuralCapex = mainEquipmentCapex * civilStructuralFactor;
  const directEquipmentCapexBeforeTax = mainEquipmentCapex
    + fuelHandlingCapex
    + steamPipingCapex
    + waterTreatmentCapex
    + chwPipingCapex
    + stackFlueGasCapex
    + electricalInstrumentationCapex
    + civilStructuralCapex;
  const directEquipmentCapex = directEquipmentCapexBeforeTax * directCapexTaxFactor;
  const installationCost = directEquipmentCapex * installationFactor;
  const engineeringCost = directEquipmentCapex * engineeringFactor;
  const contingency = directEquipmentCapex * contingencyFactor;
  const grossCapex = directEquipmentCapex + installationCost + engineeringCost + contingency;
  const netInitialInvestment = Math.max(0, n(input.capex_lkr, grossCapex) - grantSubsidy);

  const avoidedElectricityCost = annualElectricity * gridImportTariff;
  const avoidedHeatingFuelInput = annualHeatingDemand / Math.max(existingBoilerEff, 0.01);
  const avoidedHeatingCost = avoidedHeatingFuelInput * biomassFuelCostKwh;
  const totalAvoidedEnergyCost = avoidedElectricityCost + avoidedHeatingCost;
  const proposedUsefulSteamEnergy = annualTurbineInletSteamKg * steamDh / 3600;
  const proposedBiomassFuelInputKwh = proposedUsefulSteamEnergy / Math.max(biomassBoilerEff, 0.01);
  const proposedBiomassFuelCost = proposedBiomassFuelInputKwh * biomassFuelCostKwh;
  const proposedGridImportCost = annualGridImport * gridImportTariff;
  const exportRevenueYear1 = annualGridExport * exportTariffYear1;
  const fixedOm = netInitialInvestment * fixedOmRate;
  const variableOm = annualTurbineElectricity * variableTurbineOm;
  const insuranceAdmin = netInitialInvestment * insuranceAdminRate;
  const operatingCostBeforeExport = proposedBiomassFuelCost + proposedGridImportCost + fixedOm + variableOm + insuranceAdmin;
  const projectNetOperatingCost = operatingCostBeforeExport - exportRevenueYear1;
  const sustainablePremiumYear1 = sustainableMarketScenario
    ? rooms * occupancy * 365 * sustainableRoomRate * sustainableRoomPriceIncrease
    : 0;
  const year1NetSavings = totalAvoidedEnergyCost + sustainablePremiumYear1 - projectNetOperatingCost;
  const simplePayback = year1NetSavings > 0 ? netInitialInvestment / year1NetSavings : null;

  const cashFlow = [];
  for (let y=0; y<=analysisPeriod; y+=1) {
    const year = projectYear + y - 1;
    const esc = y === 0 ? 0 : (1 + escalation) ** (y - 1);
    const exportTariff = y === 0 ? 0 : exportTariffForYear(projectYear + y - 1, tariffSchedule);
    const avoidedElectricity = y === 0 ? 0 : avoidedElectricityCost * esc;
    const avoidedHeating = y === 0 ? 0 : avoidedHeatingCost * esc;
    const exportRevenue = y === 0 ? 0 : annualGridExport * exportTariff;
    const sustainablePremium = y === 0 ? 0 : sustainablePremiumYear1 * esc;
    const biomassCost = y === 0 ? 0 : proposedBiomassFuelCost * esc;
    const fixed = y === 0 ? 0 : fixedOm * esc;
    const variable = y === 0 ? 0 : variableOm * esc;
    const insurance = y === 0 ? 0 : insuranceAdmin * esc;
    const overhaul = y === majorOverhaulYear ? netInitialInvestment * majorOverhaulFraction : 0;
    const salvage = y === analysisPeriod ? netInitialInvestment * salvageFraction : 0;
    const benefits = avoidedElectricity + avoidedHeating + exportRevenue + sustainablePremium;
    const costs = biomassCost + proposedGridImportCost * esc + fixed + variable + insurance + overhaul;
    const net = y === 0 ? -netInitialInvestment : benefits - costs + salvage;
    cashFlow.push({ year_index:y, year: y===0 ? 0 : year, escalation_factor: round(esc,4), export_tariff_lkr_kwh: round(exportTariff,2), avoided_electricity_cost_lkr: round(avoidedElectricity), avoided_heating_cost_lkr: round(avoidedHeating), export_revenue_lkr: round(exportRevenue), sustainable_market_premium_lkr: round(sustainablePremium), total_project_benefits_lkr: round(benefits), biomass_fuel_cost_lkr: round(biomassCost), fixed_om_lkr: round(fixed), variable_om_lkr: round(variable), insurance_admin_lkr: round(insurance), overhaul_lkr: round(overhaul), salvage_lkr: round(salvage), net_cash_flow_lkr: round(net), discounted_cash_flow_lkr: round(net / ((1 + discountRate) ** y)), cumulative_cash_flow_lkr: 0, cumulative_discounted_cash_flow_lkr: 0 });
  }
  let cum = 0, dcum = 0;
  cashFlow.forEach((r) => { cum += r.net_cash_flow_lkr; dcum += r.discounted_cash_flow_lkr; r.cumulative_cash_flow_lkr = round(cum); r.cumulative_discounted_cash_flow_lkr = round(dcum); });
  const cashValues = cashFlow.map((r)=>r.net_cash_flow_lkr);
  let discountedPayback = null;
  for (let i = 1; i < cashFlow.length; i += 1) {
    const previous = cashFlow[i - 1].cumulative_discounted_cash_flow_lkr;
    const current = cashFlow[i].cumulative_discounted_cash_flow_lkr;
    if (previous < 0 && current >= 0) {
      discountedPayback = (i - 1) + Math.abs(previous) / Math.max(current - previous, 1);
      break;
    }
  }
  const metricCashValues = cashFlow
    .filter((r) => r.year_index <= financialMetricYears)
    .map((r)=>r.net_cash_flow_lkr);
  const npv = xnpv(discountRate, metricCashValues);
  const irrValue = Math.min(...metricCashValues) < 0 && Math.max(...metricCashValues) > 0 ? irr(metricCashValues) : null;
  const profitabilityIndex = Number.isFinite(npv) ? (npv + netInitialInvestment) / Math.max(netInitialInvestment, 1) : null;
  const annualLifeCycleSavings = Number.isFinite(npv) ? npv * annuity(discountRate, analysisPeriod) : null;

  const baselineGridEmissions = annualElectricity * gridEmission;
  const baselineHeatingEmissions = avoidedHeatingFuelInput * biomassEmission;
  const baselineTotalEmissions = baselineGridEmissions + baselineHeatingEmissions;
  const proposedGridImportEmissions = annualGridImport * gridEmission;
  const proposedExportDisplacementCredit = annualGridExport * gridEmission;
  const proposedBiomassFuelEmissions = proposedBiomassFuelInputKwh * biomassEmission;
  const proposedNetEmissions = proposedGridImportEmissions - proposedExportDisplacementCredit + proposedBiomassFuelEmissions;
  const annualGhgReduction = baselineTotalEmissions - proposedNetEmissions;

  const mf = monthlyFactors(occupancyPercent, input.monthly_factors);
  const monthlyTotalFactorDays = mf.reduce((s,m)=>s+m.factor*m.days,0);
  const monthly = mf.map((m, idx) => {
    const weight = m.factor * m.days / monthlyTotalFactorDays;
    const hotelElectricity = annualElectricity * weight;
    const coolingThermal = annualCoolingThermal * weight;
    const heatingThermal = annualHeatingDemand * weight;
    const chillerSteamThermal = coolingThermal / absorptionCop;
    const totalProcessSteam = chillerSteamThermal + heatingThermal;
    const processSteamKg = totalProcessSteam / (steamDh / 3600);
    const turbineInletSteamKg = selectedTurbineSteamFlowKgH * 24 * m.days;
    const exhaustSteamKg = Math.max(0, turbineInletSteamKg - processSteamKg);
    const turbineElectricity = selectedTurbineKw * 24 * m.days;
    const gridImport = Math.max(0, hotelElectricity - turbineElectricity);
    const gridExport = Math.max(0, turbineElectricity - hotelElectricity);
    return { month: m.month, days: m.days, occupancy_percent: m.occupancy_percent, hotel_electricity_kwh: round(hotelElectricity), cooling_thermal_kwh: round(coolingThermal), heating_thermal_kwh: round(heatingThermal), chiller_steam_thermal_kwh: round(chillerSteamThermal), total_process_steam_kwh: round(totalProcessSteam), process_steam_kg: round(processSteamKg), turbine_inlet_steam_kg: round(turbineInletSteamKg), exhaust_steam_kg: round(exhaustSteamKg), turbine_electricity_kwh: round(turbineElectricity), grid_import_kwh: round(gridImport), grid_export_kwh: round(gridExport), import_cost_lkr: round(gridImport * gridImportTariff), export_revenue_lkr: round(gridExport * exportTariffYear1) };
  });

  const dispatch15min = profile.map((p) => {
    const hotelElectric = avgElectricKw * p.electric_factor;
    const coolingThermal = avgCoolingThermalKw * p.cooling_factor;
    const coolingElectric = coolingThermal / electricChillerCop;
    const proposedHotelElectric = Math.max(0, hotelElectric - coolingElectric);
    const heating = avgHeatingKw * heatCoincidence;
    const chillerSteam = coolingThermal / absorptionCop;
    const totalSteamKw = chillerSteam + heating;
    const steamFlow = totalSteamKw * 3600 / steamDh;
    const exportKw = Math.max(0, selectedTurbineKw - proposedHotelElectric);
    const importKw = Math.max(0, proposedHotelElectric - selectedTurbineKw);
    return { hour:p.hour, hotel_electric_kw:round(hotelElectric,2), proposed_hotel_electric_kw:round(proposedHotelElectric,2), cooling_electric_kw:round(coolingElectric,2), cooling_thermal_kw:round(coolingThermal,2), heating_kw:round(heating,2), chiller_steam_kw:round(chillerSteam,2), total_process_steam_kw:round(totalSteamKw,2), process_steam_flow_kg_h:round(steamFlow,2), turbine_inlet_steam_flow_kg_h:round(selectedTurbineSteamFlowKgH,2), exhaust_steam_kg_h:round(Math.max(0, selectedTurbineSteamFlowKgH-steamFlow),2), grid_import_kw:round(importKw,2), grid_export_kw:round(exportKw,2) };
  });

  function scenario(name, capexMult=1, gridMult=1, biomassMult=1, exportMult=1) {
    const adjCapex = netInitialInvestment * capexMult;
    const adjBenefits = avoidedElectricityCost * gridMult + avoidedHeatingCost + exportRevenueYear1 * exportMult + sustainablePremiumYear1;
    const adjCosts = proposedBiomassFuelCost * biomassMult + proposedGridImportCost * gridMult + (adjCapex * fixedOmRate) + variableOm + (adjCapex * insuranceAdminRate);
    const adjSavings = adjBenefits - adjCosts;
    const adjCash = cashFlow.map((r, i) => i === 0 ? -adjCapex : (r.net_cash_flow_lkr + (avoidedElectricityCost*(gridMult-1))*((1+escalation)**Math.max(i-1,0)) - (proposedBiomassFuelCost*(biomassMult-1))*((1+escalation)**Math.max(i-1,0)) + (r.export_revenue_lkr*(exportMult-1))));
    const adjNpv = xnpv(discountRate, adjCash);
    const ghg = annualGhgReduction + annualElectricity * gridEmission * (gridMult-1) - annualGridExport * gridEmission * (exportMult-1);
    return { scenario:name, capex_multiplier:capexMult, grid_tariff_multiplier:gridMult, biomass_cost_multiplier:biomassMult, export_tariff_multiplier:exportMult, adjusted_year1_net_project_savings_lkr:round(adjSavings), adjusted_npv_lkr:round(adjNpv), adjusted_simple_payback_years: adjSavings>0?round(adjCapex/adjSavings,2):null, adjusted_annual_ghg_reduction_kgco2_y:round(ghg) };
  }
  const sensitivity = [
    scenario('Base case',1,1,1,1), scenario('CAPEX -20%',0.8,1,1,1), scenario('CAPEX +20%',1.2,1,1,1),
    scenario('Grid tariff -20%',1,0.8,1,1), scenario('Grid tariff +20%',1,1.2,1,1), scenario('Biomass cost -20%',1,1,0.8,1), scenario('Biomass cost +20%',1,1,1.2,1),
    scenario('Export tariff -20%',1,1,1,0.8), scenario('Export tariff +20%',1,1,1,1.2)
  ];
  const monthlyAverageBiomassTonnes = proposedBiomassFuelInputKwh / selectedBiomassLhv / 1000 / 12;
  const feasibilityChecks = {
    npv_status: npv > 0 ? 'PASS' : 'FAIL',
    irr_status: irrValue !== null && irrValue > 0 ? 'PASS' : 'FAIL',
    simple_payback_status: simplePayback !== null && simplePayback <= analysisPeriod ? 'PASS' : 'FAIL',
    discounted_payback_status: discountedPayback !== null && discountedPayback <= analysisPeriod ? 'PASS' : 'FAIL',
    biomass_benchmark_status: monthlyAverageBiomassTonnes <= 1500 ? 'PASS' : 'FAIL'
  };
  const finalDecision = Object.values(feasibilityChecks).every((status) => status === 'PASS')
    ? 'FEASIBLE'
    : 'NOT FEASIBLE';

  return {
    workbook_version:'Step03 South west yearly export tariff model',
    inputs_used:{ rooms, occupancy_percent:round(occupancy*100,2), configuration:'extraction_steam_turbine', financial_year:projectYear, analysis_period_years:analysisPeriod, financial_metric_years:financialMetricYears, discount_rate:discountRate, escalation_rate:escalation, grid_import_tariff_lkr_kwh:gridImportTariff, year1_export_tariff_lkr_kwh:round(exportTariffYear1,2), sustainable_market_scenario:sustainableMarketScenario?'Yes':'No', sustainable_room_rate_lkr:round(sustainableRoomRate), sustainable_room_price_increase_fraction:round(sustainableRoomPriceIncrease,4), selected_biomass_fuel:biomassFuelType, selected_biomass_cost_lkr_kg:round(selectedBiomassCostKg,2), selected_biomass_lhv_kwh_kg:round(selectedBiomassLhv,2), biomass_fuel_cost_lkr_kwh:round(biomassFuelCostKwh,4), dispatch_15min_factor_source: (input.dispatch_15min_profile || input.dispatch_15min_factors) ? 'cluster 15-minute factors' : 'default profile' },
    step01_load_profile:{ available_room_nights:round(availableRoomNights), occupied_room_nights:round(occupiedRoomNights), annual_electricity_kwh:round(annualElectricity), annual_cooling_electricity_kwh:round(annualCoolingElectric), annual_cooling_thermal_kwh:round(annualCoolingThermal), dhw_heat_kwh_y:round(dhwHeat), laundry_heat_kwh_y:round(laundryHeat), annual_heating_demand_kwh_th:round(annualHeatingDemand), cooling_share_used:round(finalCoolingShare,4), source:measuredElectricity>0?'BMS/measured data':'benchmark room-based model' },
    load_profile:{ occupied_rooms:round(rooms*occupancy,2), daily_electricity_kwh:round(annualElectricity/365), annual_electricity_kwh:round(annualElectricity), daily_cooling_useful_kwh:round(annualCoolingThermal/365), daily_dhw_thermal_kwh:round(dhwHeat/365), monthly_profile:monthly.map((m)=>({month:m.month,electricity_kwh:m.hotel_electricity_kwh,cooling_kwh:m.cooling_thermal_kwh,dhw_kwh:m.heating_thermal_kwh})) },
    step02_technical_design:{ peak_hotel_electric_kw:round(peakElectricKw,2), peak_cooling_thermal_kw:round(peakCoolingThermalKw,2), peak_cooling_rt:round(peakCoolingRt,2), design_cooling_rt:round(designCoolingRt,2), main_chiller_share:round(mainShare,2), backup_chiller_share:round(backupShare,2), selected_main_chiller_rt:selectedMainRt, selected_backup_chiller_rt:selectedBackupRt, selected_total_absorption_chiller_rt:totalChillerRt, selected_total_absorption_chiller_capacity_kw:round(totalChillerRt*3.517), total_design_chiller_steam_thermal_input_kw:round(totalChillerSteamKw), average_heating_kw:round(avgHeatingKw,2), coincident_heating_kw:round(coincidentHeatingKw,2), total_process_steam_kw:round(totalProcessSteamKw,2), process_steam_flow_kg_h:round(processSteamFlowKgH,2), potential_turbine_output_kw:round(potentialTurbineKw,2), selected_turbine_kw:selectedTurbineKw, selected_turbine_inlet_steam_flow_kg_h:round(selectedTurbineSteamFlowKgH,2), exhaust_steam_design_kg_h:round(exhaustSteamKgH,2) },
    system_sizing:{ room_case:rooms, boiler_tph:round(selectedTurbineSteamFlowKgH/1000,2), turbine_kw:selectedTurbineKw, absorption_chiller_rt:totalChillerRt, main_chiller_rt:selectedMainRt, backup_chiller_rt:selectedBackupRt, heat_exchanger_kw:round(coincidentHeatingKw,2), capex_lkr:round(netInitialInvestment) },
    monthly_dispatch:monthly,
    dispatch_15min:dispatch15min,
    step03_capex:{ dual_absorption_chiller_capex_lkr:round(dualChillerCapex), extraction_turbine_capex_lkr:round(turbineCapex), steam_generator_auxiliaries_capex_lkr:round(steamGeneratorCapex), dual_chiller_cooling_integration_capex_lkr:round(integrationCapex), grid_interconnection_capex_lkr:round(gridInterconnectionCapex), fuel_handling_capex_lkr:round(fuelHandlingCapex), steam_condensate_piping_capex_lkr:round(steamPipingCapex), water_treatment_condensate_capex_lkr:round(waterTreatmentCapex), chw_cw_piping_capex_lkr:round(chwPipingCapex), stack_flue_gas_capex_lkr:round(stackFlueGasCapex), electrical_instrumentation_capex_lkr:round(electricalInstrumentationCapex), civil_structural_capex_lkr:round(civilStructuralCapex), direct_equipment_capex_before_tax_lkr:round(directEquipmentCapexBeforeTax), direct_capex_tax_factor:round(directCapexTaxFactor,3), direct_equipment_capex_lkr:round(directEquipmentCapex), installation_cost_lkr:round(installationCost), engineering_development_cost_lkr:round(engineeringCost), contingency_lkr:round(contingency), gross_capex_lkr:round(grossCapex), grant_subsidy_lkr:round(grantSubsidy), net_initial_investment_lkr:round(netInitialInvestment) },
    energy_balance:{ annual_turbine_electricity_kwh:round(annualTurbineElectricity), annual_hotel_electricity_kwh:round(annualElectricity), annual_grid_import_kwh:round(annualGridImport), annual_grid_export_kwh:round(annualGridExport), annual_process_steam_used_kg:round(annualProcessSteamUsedKg), annual_turbine_inlet_steam_kg:round(annualTurbineInletSteamKg), annual_exhaust_steam_kg:round(annualExhaustSteamKg), exhaust_steam_ratio:round(exhaustRatio,4) },
    fuel:{ selected_biomass_fuel:biomassFuelType, biomass_lhv_kwh_kg:round(selectedBiomassLhv,2), biomass_cost_lkr_kg:round(selectedBiomassCostKg,2), proposed_biomass_fuel_input_kwh_y:round(proposedBiomassFuelInputKwh), annual_biomass_kg:round(proposedBiomassFuelInputKwh/selectedBiomassLhv), annual_biomass_tonnes:round(proposedBiomassFuelInputKwh/selectedBiomassLhv/1000,2), monthly_average_biomass_tonnes:round(monthlyAverageBiomassTonnes,2) },
    financial:{ avoided_hotel_electricity_cost_lkr_y:round(avoidedElectricityCost), avoided_hotel_heating_fuel_input_kwh_y:round(avoidedHeatingFuelInput), avoided_hotel_heating_cost_lkr_y:round(avoidedHeatingCost), total_avoided_hotel_energy_cost_lkr_y:round(totalAvoidedEnergyCost), sustainable_market_premium_year1_lkr_y:round(sustainablePremiumYear1), proposed_annual_biomass_fuel_cost_lkr_y:round(proposedBiomassFuelCost), proposed_annual_grid_import_cost_lkr_y:round(proposedGridImportCost), grid_export_revenue_year1_lkr_y:round(exportRevenueYear1), proposed_fixed_om_lkr_y:round(fixedOm), proposed_variable_om_lkr_y:round(variableOm), proposed_insurance_admin_lkr_y:round(insuranceAdmin), proposed_annual_project_operating_cost_before_export_lkr_y:round(operatingCostBeforeExport), proposed_annual_project_net_operating_cost_lkr_y:round(projectNetOperatingCost), annual_net_benefit_lkr:round(year1NetSavings), year1_net_project_savings_lkr_y:round(year1NetSavings), simple_payback_years:simplePayback?round(simplePayback,2):null, discounted_payback_years:discountedPayback===null?null:round(discountedPayback,2), npv_lkr:round(npv), irr_percent:irrValue===null?null:round(irrValue*100,2), profitability_index:profitabilityIndex===null?null:round(profitabilityIndex,3), annual_life_cycle_savings_lkr_y:round(annualLifeCycleSavings) },
    feasibility:{ ...feasibilityChecks, final_decision:finalDecision, npv_benchmark:'NPV > 0', irr_benchmark:'IRR > 0', simple_payback_benchmark:'<= analysis period', discounted_payback_benchmark:'<= analysis period', biomass_benchmark:'<= 1500 t/mo', biomass_supply_note:'Biomass use >1500 t/mo is treated as NOT FEASIBLE for this study unless supply is contractually proven.' },
    emissions:{ baseline_grid_emissions_kgco2_y:round(baselineGridEmissions), baseline_heating_fuel_emissions_kgco2_y:round(baselineHeatingEmissions), baseline_total_emissions_kgco2_y:round(baselineTotalEmissions), proposed_grid_import_emissions_kgco2_y:round(proposedGridImportEmissions), proposed_export_displacement_credit_kgco2_y:round(proposedExportDisplacementCredit), proposed_biomass_fuel_emissions_kgco2_y:round(proposedBiomassFuelEmissions), proposed_net_emissions_kgco2_y:round(proposedNetEmissions), annual_ghg_reduction_kgco2_y:round(annualGhgReduction), co2_reduction_tonnes_year:round(annualGhgReduction/1000,2), co2_reduction_percent:round((annualGhgReduction/Math.max(baselineTotalEmissions,1))*100,2) },
    cash_flow:cashFlow,
    sensitivity,
    export_tariff_schedule:tariffSchedule.map((r)=>({ year:r.year, om_lkr_kwh:r.om, fuel_lkr_kwh:r.fuel, fixed_lkr_kwh:r.fixed, total_lkr_kwh:round(n(r.om)+n(r.fuel)+n(r.fixed),2) })),
    methodology_notes:[
      'Step01 follows the Excel energy segregation logic: annual electricity is benchmark-based or BMS/measured; cooling electricity is multiplied by existing chiller COP; heating is DHW plus laundry/process heat.',
      'Step02 follows the Excel dual-chiller and extraction steam turbine selection logic: peak cooling is converted to RT, main/backup chillers are selected from candidate sizes, and the first suitable turbine is selected from candidate kW values.',
      'Step03 follows the uploaded workbook savings-based model: avoided hotel energy cost plus export revenue are benefits; biomass fuel, O&M, insurance, overhaul and CAPEX are project costs.',
      'Export revenue is year-linked using the export tariff schedule. Year 1 uses the selected financial year tariff, while later cash-flow years use their corresponding tariff rows.',
      'CO2 reduction compares baseline grid/heating emissions with project import emissions, biomass emissions and exported-grid displacement credit.'
    ]
  };
}

module.exports = { calculate, round, EXPORT_TARIFFS, MONTHS, DAYS };
