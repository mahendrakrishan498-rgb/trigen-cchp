USE defaultdb;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  hotel_name VARCHAR(180),
  location VARCHAR(180),
  inputs_json JSON,
  result_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assumption_settings (
  setting_key VARCHAR(140) PRIMARY KEY,
  setting_value VARCHAR(180) NOT NULL,
  unit VARCHAR(80),
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS export_tariffs (
  year INT PRIMARY KEY,
  om_tariff_lkr_kwh DECIMAL(18,6) NOT NULL,
  fuel_tariff_lkr_kwh DECIMAL(18,6) NOT NULL,
  fixed_tariff_lkr_kwh DECIMAL(18,6) NOT NULL
);

CREATE TABLE IF NOT EXISTS equipment_quotations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_name VARCHAR(180) NOT NULL,
  config_type ENUM('both','back_pressure','extraction') DEFAULT 'both',
  room_capacity INT NOT NULL,
  capacity_value DECIMAL(18,4),
  capacity_unit VARCHAR(50),
  cost_lkr DECIMAL(18,2) DEFAULT 0,
  supplier VARCHAR(180),
  reference_note TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bms_uploads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  filename VARCHAR(255),
  record_count INT DEFAULT 0,
  summary_json JSON,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bms_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  upload_id INT NOT NULL,
  timestamp_text VARCHAR(80),
  electricity_kw DECIMAL(18,4),
  chiller_kw DECIMAL(18,4),
  hot_water_l DECIMAL(18,4),
  occupancy_percent DECIMAL(10,4),
  steam_kg_h DECIMAL(18,4),
  FOREIGN KEY (upload_id) REFERENCES bms_uploads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pscad_results (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  time_s DECIMAL(18,5),
  voltage_v DECIMAL(18,5),
  frequency_hz DECIMAL(18,5),
  power_kw DECIMAL(18,5),
  exported_kw DECIMAL(18,5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS retscreen_comparisons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  metric VARCHAR(140) NOT NULL,
  website_value DECIMAL(22,6),
  retscreen_value DECIMAL(22,6),
  unit VARCHAR(50),
  error_percent DECIMAL(14,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO assumption_settings (setting_key, setting_value, unit, description) VALUES
('default_occupancy_percent','71','%','South Coast cluster default occupancy from Excel workbook'),
('electricity_intensity_kwh_room_day','50','kWh/available-room/day','Benchmark electricity intensity'),
('cooling_share','0.591470459820233','fraction','Cooling share of electricity'),
('dhw_l_orn','308','L/occupied-room-night','DHW volume'),
('water_heating_constant_kwh_l_c','0.001163','kWh/(L.C)','Water heating constant'),
('cold_water_temp_c','27.5','C','Cold water inlet temperature'),
('hot_water_temp_c','55','C','Hot water delivery temperature'),
('hot_water_loss_factor','0.25','fraction','Hot-water loss factor'),
('electric_chiller_cop','5','COP','Existing electric chiller COP'),
('absorption_chiller_cop','0.70','COP','Single-effect absorption chiller thermal COP'),
('laundry_diesel_available_l_room_day','0.716','L/available-room-day','Laundry diesel demand benchmark'),
('laundry_diesel_occupied_l_orn','2.182','L/occupied-room-night','Laundry diesel demand benchmark'),
('diesel_energy_kwh_l','10','kWh/L','Workbook-match diesel useful heat coefficient'),
('existing_boiler_efficiency','0.8','fraction','Existing boiler efficiency'),
('new_biomass_steam_generator_efficiency','0.85','fraction','New biomass steam generator efficiency'),
('steam_enthalpy_rise_kj_kg','2100','kJ/kg','Process steam enthalpy rise'),
('peak_cooling_sizing_margin','0.10','fraction','Chiller sizing margin'),
('extraction_turbine_specific_yield_kwh_kg','0.12','kWh/kg steam','Extraction steam turbine specific electric yield'),
('heating_coincidence_factor','1.5','x average','Heating coincidence factor at cooling peak'),
('steam_to_turbine_utilization_factor','1','fraction','Steam-to-turbine utilization factor'),
('main_chiller_share','0.8','fraction','Main chiller share; 0.8 gives 80/20 dual-chiller arrangement'),
('analysis_period_years','25','years','Project analysis period'),
('discount_rate','0.12','fraction','Discount rate used for NPV'),
('inflation_escalation_rate','0.05','fraction','Escalation applied to annual costs and benefits'),
('grid_import_tariff_lkr_kwh','16.2916666667','Rs/kWh','Hotel Rate 2 weighted average tariff from Excel'),
('grid_export_tariff_lkr_kwh','46.21','Rs/kWh','Export tariff used in the final16 cluster workbooks'),
('financial_year','2026','year','User-selectable financial/project start year'),
('selected_biomass_fuel','Gliricidia','type','Selected biomass fuel'),
('cinnamon_delivered_cost_lkr_kg','25','Rs/kg','Cinnamon delivered cost'),
('gliricidia_delivered_cost_lkr_kg','12','Rs/kg','Gliricidia delivered cost'),
('cinnamon_lhv_kwh_kg','4.2','kWh/kg','Cinnamon LHV'),
('gliricidia_lhv_kwh_kg','4','kWh/kg','Gliricidia LHV'),
('use_absorption_chiller_capex_bands','Yes','Yes/No','Use workbook size-banded absorption chiller CAPEX rates'),
('absorption_chiller_specific_capex_lkr_rt','170000','Rs/RT','Step03 chiller specific CAPEX'),
('extraction_turbine_specific_capex_lkr_kw','60000','Rs/kW','Step03 extraction turbine specific CAPEX'),
('steam_generator_specific_capex_lkr_kg_h','1000','Rs/(kg/h)','Step03 steam generator and auxiliaries specific CAPEX'),
('cooling_integration_specific_capex_lkr_rt','15000','Rs/RT','Turbine condensing heat-rejection / cooling integration CAPEX'),
('grid_interconnection_specific_capex_lkr_kw','27000','Rs/kW','Grid interconnection specific CAPEX'),
('fuel_handling_specific_capex_lkr_kw','5664','Rs/kW','Biomass fuel handling CAPEX allowance'),
('steam_condensate_piping_factor','0.06','fraction','Steam and condensate piping factor on main equipment CAPEX'),
('water_treatment_condensate_factor','0.04','fraction','Water treatment and condensate system factor on main equipment CAPEX'),
('chw_cw_piping_factor','0.04','fraction','CHW/CW piping factor on main equipment CAPEX'),
('stack_flue_gas_specific_capex_lkr_kw','1500','Rs/kW','Stack and flue gas CAPEX allowance'),
('electrical_instrumentation_factor','0.08','fraction','Electrical and instrumentation factor on main equipment CAPEX'),
('civil_structural_factor','0.02','fraction','Civil and structural factor on main equipment CAPEX'),
('direct_capex_tax_factor','1.35','factor','Direct equipment CAPEX tax multiplier'),
('installation_factor','0.15','fraction','Installation factor applied to direct equipment CAPEX'),
('engineering_development_factor','0.09','fraction','Engineering and development factor'),
('contingency_factor','0.10','fraction','Contingency factor'),
('grant_subsidy_lkr','0','Rs','Grant or subsidy'),
('fixed_om_rate_capex','0.03','fraction CAPEX/y','Fixed O&M rate'),
('variable_turbine_om_lkr_kwh','1.5','Rs/kWh','Variable turbine O&M'),
('insurance_admin_rate_capex','0.005','fraction CAPEX/y','Insurance and admin'),
('major_overhaul_year','10','year','Major overhaul year'),
('major_overhaul_fraction_capex','0.10','fraction CAPEX','Major overhaul fraction'),
('salvage_value_fraction_capex','0.10','fraction CAPEX','Salvage value fraction'),
('grid_emission_kgco2_kwh','0.65','kgCO2/kWh','Grid emission factor'),
('biomass_emission_kgco2_kwh_fuel','0','kgCO2/kWh_fuel','Biomass emission factor')
ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), unit=VALUES(unit), description=VALUES(description);

INSERT INTO export_tariffs (year, om_tariff_lkr_kwh, fuel_tariff_lkr_kwh, fixed_tariff_lkr_kwh) VALUES
(2026,0,46.02,0),(2027,0,46.21,0),(2028,0,46.41,0),(2029,0,46.61,0),(2030,0,46.82,0),(2031,0,47.02,0),(2032,0,47.22,0),(2033,0,47.43,0),(2034,0,47.64,0),(2035,0,47.85,0),(2036,0,48.06,0),(2037,0,48.27,0),(2038,0,48.48,0),(2039,0,48.69,0),(2040,0,48.91,0),(2041,0,49.12,0),(2042,0,49.34,0),(2043,0,49.56,0),(2044,0,49.78,0),(2045,0,50.00,0),(2046,0,50.23,0)
ON DUPLICATE KEY UPDATE om_tariff_lkr_kwh=VALUES(om_tariff_lkr_kwh), fuel_tariff_lkr_kwh=VALUES(fuel_tariff_lkr_kwh), fixed_tariff_lkr_kwh=VALUES(fixed_tariff_lkr_kwh);

INSERT INTO equipment_quotations (item_name, config_type, room_capacity, capacity_value, capacity_unit, cost_lkr, supplier, reference_note) VALUES
('Dual absorption chillers','extraction',250,650,'RT',143000000,'Step03 Excel base','Main + backup selected from Excel logic'),
('Extraction steam turbine generator','extraction',250,800,'kW',240000000,'Step03 Excel base','Selected suitable industry turbine'),
('Steam generator and auxiliaries','extraction',250,6666.667,'kg/h',120000000,'Step03 Excel base','Based on selected inlet steam flow'),
('Cooling integration and BOP','extraction',250,650,'RT',26000000,'Step03 Excel base','Cooling tower/HX/integration'),
('Grid interconnection','extraction',250,800,'kW',16000000,'Step03 Excel base','Protection and grid connection')
ON DUPLICATE KEY UPDATE item_name=VALUES(item_name);



CREATE TABLE IF NOT EXISTS cluster_defaults (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cluster_name VARCHAR(140) NOT NULL UNIQUE,
  electricity_intensity_kwh_room_day DECIMAL(18,6) DEFAULT 50,
  cooling_share DECIMAL(18,9) DEFAULT 0.591470460,
  dhw_l_orn DECIMAL(18,6) DEFAULT 308,
  occupancy_percent DECIMAL(10,4) DEFAULT 92,
  grid_import_tariff_lkr_kwh DECIMAL(18,6) DEFAULT 16.291667,
  selected_biomass_fuel VARCHAR(100) DEFAULT 'Gliricidia',
  selected_biomass_delivered_cost_lkr_kg DECIMAL(18,6) DEFAULT 12,
  selected_biomass_lhv_kwh_kg DECIMAL(18,6) DEFAULT 4.0,
  notes TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cluster_dispatch_15min (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  cluster_id INT NOT NULL,
  interval_index INT NOT NULL,
  time_fraction DECIMAL(18,8),
  time_hour DECIMAL(10,4),
  hotel_electric_factor DECIMAL(18,8),
  cooling_thermal_factor DECIMAL(18,8),
  hotel_electric_kw DECIMAL(18,4),
  cooling_thermal_kw DECIMAL(18,4),
  turbine_output_kw DECIMAL(18,4),
  grid_import_kw DECIMAL(18,4),
  grid_export_kw DECIMAL(18,4),
  voltage_output_v DECIMAL(10,4),
  frequency_hz DECIMAL(10,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cluster_dispatch_interval (cluster_id, interval_index),
  INDEX idx_cluster_dispatch_cluster (cluster_id),
  CONSTRAINT fk_cluster_dispatch_cluster
    FOREIGN KEY (cluster_id) REFERENCES cluster_defaults(id) ON DELETE CASCADE
);

INSERT INTO cluster_defaults
(cluster_name, electricity_intensity_kwh_room_day, cooling_share, dhw_l_orn, occupancy_percent, grid_import_tariff_lkr_kwh, selected_biomass_fuel, selected_biomass_delivered_cost_lkr_kg, selected_biomass_lhv_kwh_kg, notes)
VALUES
('Colombo–Negombo', 58, 0.620000000, 320, 82, 16.291667, 'Gliricidia', 36, 4.0, 'Urban/coastal cluster with high air-conditioning demand.'),
('South/South-West Coast', 50, 0.591470460, 308, 71, 16.291667, 'Gliricidia', 12, 4.0, 'South/South-West resort cluster based on project workbook assumptions.'),
('Cultural Triangle', 46, 0.540000000, 295, 76, 60, 'Mixed biomass', 34, 4.1, 'Heritage/tourism hotel cluster with moderate cooling demand.'),
('Hill Country', 42, 0.450000000, 330, 72, 58, 'Wood chips', 37, 4.2, 'Hill country cluster with lower cooling and higher hot-water demand.'),
('East Coast/Wildlife', 48, 0.570000000, 300, 74, 61, 'Agricultural residue', 38, 4.0, 'Seasonal coastal/wildlife hotel cluster.'),
('Generic Hotel Case', 50, 0.591470460, 308, 92, 16.291667, 'Gliricidia', 12, 4.0, 'General editable hotel case.')
ON DUPLICATE KEY UPDATE
electricity_intensity_kwh_room_day=VALUES(electricity_intensity_kwh_room_day),
cooling_share=VALUES(cooling_share),
dhw_l_orn=VALUES(dhw_l_orn),
occupancy_percent=VALUES(occupancy_percent),
grid_import_tariff_lkr_kwh=VALUES(grid_import_tariff_lkr_kwh),
selected_biomass_fuel=VALUES(selected_biomass_fuel),
selected_biomass_delivered_cost_lkr_kg=VALUES(selected_biomass_delivered_cost_lkr_kg),
selected_biomass_lhv_kwh_kg=VALUES(selected_biomass_lhv_kwh_kg),
notes=VALUES(notes);
