ALTER TABLE inspections ADD COLUMN IF NOT EXISTS building_id integer;
ALTER TABLE safety_checklists ADD COLUMN IF NOT EXISTS building_id integer;
ALTER TABLE maintenance_logs ADD COLUMN IF NOT EXISTS building_id integer;

UPDATE inspections SET building_id = 1 WHERE building_id IS NULL;
UPDATE safety_checklists SET building_id = 1 WHERE building_id IS NULL;
UPDATE maintenance_logs SET building_id = 1 WHERE building_id IS NULL;
