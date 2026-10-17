-- Add jwt_version to usuarios to allow invalidating existing sessions on password reset
ALTER TABLE usuarios ADD COLUMN jwt_version INT DEFAULT 1;
