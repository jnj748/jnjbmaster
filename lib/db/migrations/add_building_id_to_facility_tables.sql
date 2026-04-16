ALTER TABLE inspections ADD COLUMN IF NOT EXISTS building_id integer;
ALTER TABLE safety_checklists ADD COLUMN IF NOT EXISTS building_id integer;
ALTER TABLE maintenance_logs ADD COLUMN IF NOT EXISTS building_id integer;
