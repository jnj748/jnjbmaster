ALTER TABLE inspections ADD COLUMN IF NOT EXISTS building_id integer;
ALTER TABLE safety_checklists ADD COLUMN IF NOT EXISTS building_id integer;
ALTER TABLE maintenance_logs ADD COLUMN IF NOT EXISTS building_id integer;

UPDATE inspections i
  SET building_id = u.building_id
  FROM users u
  WHERE i.building_id IS NULL
    AND u.building_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM users u2 WHERE u2.building_id IS NOT NULL LIMIT 1
    );

UPDATE safety_checklists sc
  SET building_id = (SELECT MIN(id) FROM buildings)
  WHERE sc.building_id IS NULL;

UPDATE maintenance_logs ml
  SET building_id = (SELECT MIN(id) FROM buildings)
  WHERE ml.building_id IS NULL;
