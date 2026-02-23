CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  migration_name VARCHAR(190) NOT NULL,
  checksum VARCHAR(128) NOT NULL DEFAULT '',
  details_json LONGTEXT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_migration_name (migration_name)
);

CREATE TABLE IF NOT EXISTS platform_state (
  state_key VARCHAR(100) PRIMARY KEY,
  state_json LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_state_chunks (
  state_key VARCHAR(100) NOT NULL,
  chunk_index INT NOT NULL,
  chunk_data LONGBLOB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (state_key, chunk_index)
);

CREATE TABLE IF NOT EXISTS telemetry_incidents (
  id VARCHAR(120) NOT NULL,
  request_id VARCHAR(128) NOT NULL DEFAULT '',
  workspace_id VARCHAR(64) NOT NULL DEFAULT 'main',
  type VARCHAR(80) NOT NULL,
  message TEXT NOT NULL,
  stack LONGTEXT NULL,
  source VARCHAR(120) NOT NULL DEFAULT 'frontend',
  route VARCHAR(300) NOT NULL DEFAULT '',
  user_agent VARCHAR(300) NOT NULL DEFAULT '',
  meta_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_incident_workspace_created (workspace_id, created_at),
  KEY idx_incident_request_id (request_id),
  KEY idx_incident_type (type),
  KEY idx_incident_source (source)
);
