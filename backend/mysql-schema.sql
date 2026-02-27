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

CREATE TABLE IF NOT EXISTS campaigns (
  workspace_id VARCHAR(64) NOT NULL DEFAULT 'main',
  campaign_id VARCHAR(120) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  country VARCHAR(120) NOT NULL DEFAULT '',
  languages_json LONGTEXT NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  workflow_stage VARCHAR(40) NOT NULL DEFAULT 'draft',
  workflow_stage_updated_at DATETIME(3) NULL,
  workflow_wip_limit INT NOT NULL DEFAULT 3,
  behavior_statement LONGTEXT NULL,
  behavior_current LONGTEXT NULL,
  behavior_desired LONGTEXT NULL,
  behavior_context LONGTEXT NULL,
  insight_text LONGTEXT NULL,
  insight_evidence_source LONGTEXT NULL,
  insight_confidence_level VARCHAR(20) NOT NULL DEFAULT 'medium',
  driver_types_json LONGTEXT NOT NULL,
  driver_text LONGTEXT NULL,
  driver_why_now LONGTEXT NULL,
  driver_tension LONGTEXT NULL,
  situation LONGTEXT NULL,
  problem LONGTEXT NULL,
  prior_learnings LONGTEXT NULL,
  business_objective LONGTEXT NULL,
  communication_objective LONGTEXT NULL,
  creative_brief_json LONGTEXT NOT NULL,
  content_themes_and_calendar LONGTEXT NULL,
  deliverables_needed LONGTEXT NULL,
  measurement_and_learning_plan LONGTEXT NULL,
  governance_risks_and_approvals LONGTEXT NULL,
  timeline_details LONGTEXT NULL,
  appendices LONGTEXT NULL,
  portfolio_json LONGTEXT NOT NULL,
  template_system_json LONGTEXT NOT NULL,
  digital_ops_json LONGTEXT NOT NULL,
  crm_lifecycle_json LONGTEXT NOT NULL,
  experiment_lab_json LONGTEXT NOT NULL,
  governance_policy_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, campaign_id),
  KEY idx_campaign_workspace_updated (workspace_id, updated_at),
  KEY idx_campaign_workspace_status (workspace_id, status),
  KEY idx_campaign_workspace_stage (workspace_id, workflow_stage)
);

CREATE TABLE IF NOT EXISTS campaign_audiences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  audience_id VARCHAR(120) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'primary',
  segment_name TEXT NULL,
  description_text LONGTEXT NULL,
  barriers LONGTEXT NULL,
  motivators LONGTEXT NULL,
  desired_action LONGTEXT NULL,
  key_message LONGTEXT NULL,
  support_rtb LONGTEXT NULL,
  cta LONGTEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_audience (workspace_id, campaign_id, audience_id),
  KEY idx_campaign_audience_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_channel_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  role_id VARCHAR(120) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'owned',
  channel TEXT NULL,
  role_text LONGTEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_channel_role (workspace_id, campaign_id, role_id),
  KEY idx_campaign_channel_role_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_media_plan_rows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  row_id VARCHAR(120) NOT NULL,
  channel TEXT NULL,
  targeting LONGTEXT NULL,
  flighting LONGTEXT NULL,
  budget TEXT NULL,
  kpi LONGTEXT NULL,
  benchmark LONGTEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_media_plan_row (workspace_id, campaign_id, row_id),
  KEY idx_campaign_media_plan_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_qa_checklist (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  item_id VARCHAR(120) NOT NULL,
  label_text LONGTEXT NULL,
  checked_flag TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_qa_item (workspace_id, campaign_id, item_id),
  KEY idx_campaign_qa_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_ideas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  idea_id VARCHAR(120) NOT NULL,
  method VARCHAR(40) NOT NULL DEFAULT 'Re-expression',
  title LONGTEXT NULL,
  description_text LONGTEXT NULL,
  link_to_insight LONGTEXT NULL,
  link_to_driver LONGTEXT NULL,
  feasibility_score DOUBLE NOT NULL DEFAULT 0,
  originality_score DOUBLE NOT NULL DEFAULT 0,
  strategic_fit_score DOUBLE NOT NULL DEFAULT 0,
  cultural_fit_score DOUBLE NOT NULL DEFAULT 0,
  selected_flag TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_idea (workspace_id, campaign_id, idea_id),
  KEY idx_campaign_idea_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_concepts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  concept_id VARCHAR(120) NOT NULL,
  name LONGTEXT NULL,
  big_idea LONGTEXT NULL,
  smp LONGTEXT NULL,
  key_promise LONGTEXT NULL,
  support_points_json LONGTEXT NOT NULL,
  tone LONGTEXT NULL,
  selected_idea_ids_json LONGTEXT NOT NULL,
  channels_json LONGTEXT NOT NULL,
  risks_json LONGTEXT NOT NULL,
  tagline LONGTEXT NULL,
  key_visual_description LONGTEXT NULL,
  execution_rationale LONGTEXT NULL,
  behavior_trigger LONGTEXT NULL,
  board_data_json LONGTEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_concept (workspace_id, campaign_id, concept_id),
  KEY idx_campaign_concept_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_collaboration_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  member_name VARCHAR(190) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_collab_member (workspace_id, campaign_id, member_name),
  KEY idx_campaign_collab_member_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_collaboration_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  message_id VARCHAR(120) NOT NULL,
  author VARCHAR(190) NOT NULL DEFAULT '',
  content LONGTEXT NULL,
  created_at DATETIME(3) NULL,
  mentions_json LONGTEXT NOT NULL,
  parent_id VARCHAR(120) NULL,
  resolved_flag TINYINT(1) NOT NULL DEFAULT 0,
  resolved_at DATETIME(3) NULL,
  resolved_by VARCHAR(190) NULL,
  field_key VARCHAR(190) NULL,
  anchor_label VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_collab_message (workspace_id, campaign_id, message_id),
  KEY idx_campaign_collab_message_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_collaboration_presence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  member_name VARCHAR(190) NOT NULL,
  field_key VARCHAR(190) NULL,
  is_typing TINYINT(1) NOT NULL DEFAULT 0,
  last_seen_at DATETIME(3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_campaign_collab_presence_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_evidence_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  evidence_id VARCHAR(120) NOT NULL,
  section_key VARCHAR(40) NOT NULL DEFAULT 'research',
  claim LONGTEXT NULL,
  source LONGTEXT NULL,
  source_quality VARCHAR(20) NOT NULL DEFAULT 'medium',
  confidence VARCHAR(20) NOT NULL DEFAULT 'medium',
  owner VARCHAR(190) NULL,
  url LONGTEXT NULL,
  created_at DATETIME(3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_evidence_item (workspace_id, campaign_id, evidence_id),
  KEY idx_campaign_evidence_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_issues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  issue_id VARCHAR(120) NOT NULL,
  title LONGTEXT NULL,
  description_text LONGTEXT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  owner VARCHAR(190) NOT NULL DEFAULT 'Unassigned',
  sla_hours INT NOT NULL DEFAULT 48,
  created_at DATETIME(3) NULL,
  updated_at DATETIME(3) NULL,
  resolved_at DATETIME(3) NULL,
  postmortem LONGTEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_issue (workspace_id, campaign_id, issue_id),
  KEY idx_campaign_issue_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_reminders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  reminder_id VARCHAR(120) NOT NULL,
  type_key VARCHAR(40) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message LONGTEXT NULL,
  created_at DATETIME(3) NULL,
  due_at DATETIME(3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_reminder (workspace_id, campaign_id, reminder_id),
  KEY idx_campaign_reminder_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  snapshot_id VARCHAR(120) NOT NULL,
  label_text VARCHAR(255) NOT NULL DEFAULT 'Campaign snapshot',
  created_at DATETIME(3) NULL,
  created_by VARCHAR(190) NOT NULL DEFAULT 'System',
  summary LONGTEXT NULL,
  state_json LONGTEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_snapshot (workspace_id, campaign_id, snapshot_id),
  KEY idx_campaign_snapshot_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  approval_id VARCHAR(120) NOT NULL,
  role_key VARCHAR(40) NOT NULL DEFAULT 'strategy_lead',
  approver VARCHAR(190) NOT NULL DEFAULT '',
  signature LONGTEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  note LONGTEXT NULL,
  created_at DATETIME(3) NULL,
  updated_at DATETIME(3) NULL,
  approved_at DATETIME(3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_approval (workspace_id, campaign_id, approval_id),
  KEY idx_campaign_approval_lookup (workspace_id, campaign_id, sort_order)
);

CREATE TABLE IF NOT EXISTS campaign_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(120) NOT NULL,
  audit_id VARCHAR(120) NOT NULL,
  action_key VARCHAR(80) NOT NULL,
  actor VARCHAR(190) NOT NULL DEFAULT 'System',
  detail LONGTEXT NULL,
  created_at DATETIME(3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_audit_event (workspace_id, campaign_id, audit_id),
  KEY idx_campaign_audit_lookup (workspace_id, campaign_id, sort_order)
);
