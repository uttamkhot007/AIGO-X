# ISO 27001 Cookie-Cutter Automation Platform
## Complete Application Blueprint

---

# 1. PLATFORM OVERVIEW

**What the Platform Does:**
The ISO 27001 Cookie-Cutter Automation Platform is a multi-tenant SaaS application that automates the end-to-end implementation of an Information Security Management System (ISMS) according to ISO/IEC 27001:2022 standards. The platform transforms what is typically a 12-24 month manual effort into a streamlined, guided journey with auto-generated documentation, automated workflows, and real-time compliance tracking. It serves as an intelligent "implementation engine" that collects organizational context through a staged onboarding wizard and automatically produces a complete certification-ready implementation pack.

**Who Uses It:**
- **Small to Mid-sized Organizations (SMEs):** 50-500 employees seeking ISO 27001 certification
- **CISOs & Security Leaders:** Responsible for implementing and maintaining ISMS
- **Compliance Managers:** Managing regulatory requirements and audits
- **IT Directors:** Coordinating technical control implementation
- **Consultants & MSPs:** Serving multiple client organizations
- **Internal Audit Teams:** Conducting pre-certification audits
- **Implementation Partners:** Accelerating client delivery timelines

**Key Outcomes:**
- ⚡ **12-week Fast Track** or **24-week Standard** implementation timelines
- 📚 **Auto-generated ISMS Documentation Pack** (20+ key documents)
- 📊 **Real-time Compliance Dashboard** with control implementation status
- 🔍 **Risk Register + Treatment Plans** with automated scoring
- 📋 **Annex A Control Tracker** with evidence mapping
- ✅ **Certification Readiness Score** with Stage-1/Stage-2 audit prep
- 🔄 **Automated Workflows** for reviews, approvals, and CAPA
- 📈 **Maturity Assessments** with improvement recommendations
- 🏢 **Multi-tenant Support** for consultants managing multiple orgs

---

# 2. FULL MODULE LIST

| Module | Submodules | Purpose | ISO Clause Mapping | Annex A Mapping | Key Outputs |
|--------|-----------|---------|-------------------|----------------|-------------|
| **Organization Setup** | - Org Profile<br>- Team & Roles<br>- Site/Business Units<br>- Multi-tenant Configuration | Establish organizational structure and access | 4.1, 4.2, 5.1-5.3 | Org (5.1-5.28) | Org hierarchy, user accounts, permissions matrix |
| **Context Module** | - Business Context<br>- Interested Parties<br>- Regulatory Requirements<br>- Internal Requirements | Define internal/external context and requirements | 4.1, 4.2, 4.4 | - | Context document, interested parties register, requirements log |
| **Scope Module** | - Scope Boundaries<br>- Exclusions Justification<br>- Site/Business Unit Scope<br>- Third-party Dependencies | Define and document ISMS scope | 4.3 | All | Scope statement, exclusions justification, scope diagram |
| **Risk Framework** | - Risk Methodology<br>- Risk Criteria<br>- Impact/Likelihood Scales<br>- Risk Appetite | Establish risk assessment framework | 6.1.1, 6.1.2 | - | Risk methodology document, risk criteria matrix |
| **Asset Management** | - Asset Inventory<br>- Asset Classification<br>- Data Classification<br>- Asset Owners | Identify, classify, and manage assets | 8.1, 8.2 | People (7.1-7.10)<br>Physical (8.1-8.25)<br>Tech (8.26-8.34) | Asset register, classification matrix, asset ownership matrix |
| **Risk Assessment** | - Risk Identification<br>- Risk Analysis<br>- Risk Evaluation<br>- Risk Scoring | Conduct systematic risk assessment | 6.1.2, 6.1.3 | All (risk-driven) | Risk register, risk scores, risk heat map |
| **Risk Treatment** | - Treatment Options<br>- Risk Treatment Plans<br>- Control Selection<br>- Residual Risk | Select and implement risk treatments | 6.1.3, 6.1.4 | All | Risk treatment plan, residual risk register, control selection |
| **Statement of Applicability** | - Annex A Controls Catalog<br>- Control Applicability<br>- Control Implementation<br>- Control Exclusions | Define applicable controls and implementation status | 6.1.3 | All (93 controls) | Statement of Applicability (SoA), control implementation tracker |
| **Policy Module** | - ISMS Policy<br>- Domain-specific Policies<br>- Policy Approval<br>- Policy Distribution | Develop and maintain policy framework | 5.1-5.3 | Org (5.1-5.28) | ISMS policy, policy pack (15+ policies), policy approval records |
| **Control Implementation** | - Control Tasks<br>- Implementation Evidence<br>- Control Testing<br>- Maturity Assessment | Implement and verify controls | 8.1, 8.2 | All (93 controls) | Control implementation tracker, evidence repository, test results |
| **Evidence Management** | - Evidence Upload<br>- Evidence Mapping<br>- Evidence Review<br>- Evidence Checklist | Collect and manage audit evidence | 9.1, 9.2, 9.3 | All | Evidence repository, evidence checklist per control |
| **Awareness & Training** | - Training Needs Analysis<br>- Training Content<br>- Training Records<br>- Awareness Campaigns | Ensure security awareness and training | 7.2, 7.3 | People (7.1-7.10) | Training plan, training records, awareness materials |
| **Supplier Management** | - Supplier Inventory<br>- Supplier Risk Assessment<br>- Supplier Agreements<br>- Supplier Reviews | Manage third-party and supplier risks | 8.1, 8.2 | Org (5.19-5.23) | Supplier register, supplier risk assessments, SLA templates |
| **Internal Audit Module** | - Audit Planning<br>- Audit Checklists<br>- Audit Execution<br>- Audit Findings | Plan and conduct internal audits | 9.2 | - | Internal audit program, audit checklists, audit reports, findings |
| **Management Review** | - Review Agenda<br>- KPI Tracking<br>- Review Minutes<br>- Action Tracking | Conduct management reviews | 9.3 | - | Management review agenda, review pack, minutes, action items |
| **CAPA Module** | - Nonconformities<br>- Corrective Actions<br>- Preventive Actions<br>- Effectiveness Checks | Manage nonconformities and improvements | 9.1, 10.1, 10.2 | - | Nonconformity register, CAPA plan, effectiveness verification |
| **Incident Management** | - Incident Reporting<br>- Incident Classification<br>- Incident Response<br>- Incident Log | Manage security incidents | 8.24, 8.25 | Tech (8.24-8.25) | Incident log, incident reports, response procedures |
| **Document Control** | - Document Repository<br>- Version Control<br>- Approval Workflows<br>- Distribution Tracking | Control documentation lifecycle | 7.5 | - | Document register, version history, approval records |
| **Compliance Dashboard** | - Control Status<br>- Risk Overview<br>- Audit Status<br>- Certification Readiness | Real-time compliance visibility | 9.1 | - | Dashboard, readiness score, gap reports |
| **Reporting & Export** | - PDF Generator<br>- Excel Exports<br>- Audit Packs<br>- Management Reports | Generate reports and deliverables | All | All | Complete document pack, audit-ready packages |

---

# 3. ONBOARDING WIZARD BLUEPRINT

| Onboarding Stage | Key Questions | Data Collected | Auto-generated Outputs | Responsible Roles |
|-----------------|--------------|----------------|----------------------|-------------------|
| **Stage 1: Organization Setup** | 1. What is your organization name and legal entity?<br>2. What is your primary industry/sector?<br>3. Number of employees and sites?<br>4. Which departments/business units are in scope?<br>5. Who are the key ISMS roles (CISO, ISMS Manager, Owner)? | - Org name, type, sector<br>- Employee count, locations<br>- Business units/departments<br>- Key personnel and roles | - Organization profile<br>- User accounts<br>- Role assignments<br>- Initial project timeline | Implementation Lead, CISO |
| **Stage 2: Context & Interested Parties** | 1. What are your core products/services?<br>2. Who are your key customers/clients?<br>3. What regulations apply (GDPR, HIPAA, SOC 2, etc.)?<br>4. Who are your key suppliers/partners?<br>5. What are your internal drivers (customer contracts, regulatory, competitive)? | - Products/services catalog<br>- Customer segments<br>- Regulatory requirements<br>- Supplier list<br>- Internal objectives | - Context document<br>- Interested parties register<br>- Regulatory requirements log<br>- Compliance matrix | Compliance Manager, Business Owner |
| **Stage 3: Scope Definition** | 1. Which locations/sites are in scope?<br>2. Which business processes are in scope?<br>3. Are there any exclusions (justify: physical, technical, contractual)?<br>4. Which third parties/cloud services are in scope?<br>5. What are the scope boundaries (inclusions/exclusions)? | - Site locations<br>- Business processes<br>- Exclusions with justification<br>- Cloud services/IT systems<br>- Boundary documentation | - Scope statement<br>- Scope diagram<br>- Exclusions justification<br>- System inventory | CISO, IT Director |
| **Stage 4: Risk Methodology & Criteria** | 1. What is your risk appetite (low, medium, high)?<br>2. Impact criteria (financial, reputation, legal, operational)?<br>3. Likelihood scale (rare to almost certain)?<br>4. Risk scoring threshold for acceptance?<br>5. Risk assessment frequency (annual, quarterly)? | - Risk appetite level<br>- Impact scales (1-5)<br>- Likelihood scales (1-5)<br>- Acceptable risk threshold<br>- Assessment frequency | - Risk methodology document<br>- Risk criteria matrix<br>- Risk scoring model<br>- Risk register template | Risk Manager, CISO |
| **Stage 5: Asset Inventory & Data Classification** | 1. What are your critical information assets?<br>2. What data types do you process (PII, financial, health, IP)?<br>3. What is your data classification scheme (public, internal, confidential, restricted)?<br>4. Who owns each asset?<br>5. Where are assets stored/processed? | - Asset types and descriptions<br>- Data categories<br>- Classification scheme<br>- Asset owners<br>- Asset locations | - Asset register<br>- Data classification policy<br>- Asset ownership matrix<br>- Critical asset list | IT Manager, Data Owner |
| **Stage 6: Risk Assessment** | 1. What are the top threats to your organization?<br>2. What are the vulnerabilities in your systems/processes?<br>3. What are the potential impacts if threats materialize?<br>4. How likely are these to occur?<br>5. What existing controls are in place? | - Threat catalog<br>- Vulnerability list<br>- Impact assessments<br>- Likelihood ratings<br>- Existing controls | - Risk register<br>- Risk heat map<br>- High-risk items list<br>- Control gaps identified | Risk Manager, IT Security |
| **Stage 7: SoA & Control Selection** | 1. Which Annex A controls are applicable based on your scope?<br>2. Which controls will be excluded (with justification)?<br>3. What is the implementation status of each control?<br>4. What is the target implementation date?<br>5. What is the control ownership structure? | - Control applicability (yes/no)<br>- Exclusions with justification<br>- Implementation status<br>- Target dates<br>- Control owners | - Statement of Applicability (SoA)<br>- Control implementation tracker<br>- Control gap analysis<br>- Implementation roadmap | CISO, Control Owners |
| **Stage 8: Policy Pack** | 1. What policies do you currently have?<br>2. Which policies need customization for your industry?<br>3. Who approves policies in your organization?<br>4. What is your policy review cycle?<br>5. How are policies communicated to staff? | - Existing policy inventory<br>- Customization requirements<br>- Approval workflow<br>- Review frequency<br>- Distribution method | - ISMS policy<br>- Policy pack (15+ policies)<br>- Policy approval workflow<br>- Policy distribution plan | CISO, HR, Legal |
| **Stage 9: Control Implementation & Evidence Sources** | 1. What tools/platforms do you use for each control?<br>2. Where is evidence stored (SIEM, ticketing, HR system)?<br>3. What evidence can be automatically collected?<br>4. What evidence requires manual collection?<br>5. What is the control maturity level (1-5)? | - Tool inventory<br>- Evidence sources<br>- Automation capabilities<br>- Manual evidence requirements<br>- Maturity assessments | - Control implementation tracker<br>- Evidence source mapping<br>- Evidence checklist per control<br>- Maturity assessment report | Control Owners, IT Teams |
| **Stage 10: Awareness Program** | 1. What is your current training program?<br>2. What roles need specialized training?<br>3. What are your training methods (e-learning, workshops, phishing sims)?<br>4. How often is training delivered?<br>5. How do you track training completion? | - Current training inventory<br>- Role-based requirements<br>- Training delivery methods<br>- Training frequency<br>- Completion tracking | - Training plan<br>- Training content library<br>- Training schedule<br>- Training record templates | HR, Security Awareness Lead |
| **Stage 11: Audit Program** | 1. What is your audit frequency (annual, biannual)?<br>2. What is your audit scope (full ISMS, specific areas)?<br>3. Who are your internal auditors?<br>4. What is your audit methodology? | - Audit schedule<br>- Audit scope<br>- Auditor assignments<br>- Audit approach | - Internal audit program<br>- Audit checklists<br>- Audit calendar<br>- Auditor assignments | Internal Auditor, CISO |
| **Stage 12: Management Review Setup** | 1. Who participates in management review?<br>2. How often are reviews conducted?<br>3. What KPIs will be tracked?<br>4. What is the review agenda? | - Review participants<br>- Review frequency<br>- KPI list<br>- Agenda items | - Management review agenda<br>- Review schedule<br>- KPI dashboard<br>- Review pack template | Executive Team, CISO |
| **Stage 13: CAPA & Continual Improvement** | 1. How do you identify nonconformities?<br>2. What is your CAPA workflow?<br>3. How do you verify effectiveness?<br>4. What triggers improvement initiatives? | - Nonconformity sources<br>- CAPA process<br>- Effectiveness criteria<br>- Improvement triggers | - CAPA procedure<br>- Nonconformity register<br>- CAPA plan template<br>- Improvement log | Quality Manager, CISO |

---

# 4. COOKIE CUTTER IMPLEMENTATION DELIVERABLES PACK

## Documents (20+)

### **Context & Governance**
- ✓ ISMS Context Statement
- ✓ ISMS Policy
- ✓ Scope Statement
- ✓ Roles and Responsibilities Matrix
- ✓ Governance Structure Document

### **Risk Management**
- ✓ Risk Assessment Methodology
- ✓ Risk Register (with scoring)
- ✓ Risk Treatment Plan
- ✓ Residual Risk Acceptance
- ✓ Risk Appetite Statement

### **Compliance & Controls**
- ✓ Statement of Applicability (SoA)
- ✓ Control Implementation Tracker
- ✓ Annex A Control Implementation Status
- ✓ Exclusions Justification Document

### **Policy Pack (15+ Policies)**
1. Information Security Policy
2. Access Control Policy
3. Data Classification Policy
4. Acceptable Use Policy
5. Incident Management Policy
6. Business Continuity Policy
7. Supplier Security Policy
8. Asset Management Policy
9. Cryptography Policy
10. Physical Security Policy
11. Network Security Policy
12. Change Management Policy
13. Human Resources Security Policy
14. Mobile Device Policy
15. Logging and Monitoring Policy

### **Operational Procedures**
- ✓ Asset Management Procedure
- ✓ Access Control Procedure
- ✓ Incident Response Procedure
- ✓ Supplier Assessment Procedure
- ✓ Internal Audit Procedure
- ✓ Management Review Procedure
- ✓ Document Control Procedure
- ✓ Backup and Recovery Procedure

## Registers (8+)

- ✓ Asset Register
- ✓ Risk Register
- ✓ Interested Parties Register
- ✓ Legal/Regulatory Requirements Register
- ✓ Supplier Register
- ✓ Nonconformity Register
- ✓ CAPA Register
- ✓ Incident Register
- ✓ Training Record Register
- ✓ Document Register

## Templates (25+)

### **Assessment Templates**
- Risk Assessment Template
- Asset Classification Template
- Supplier Risk Assessment Template
- Control Implementation Template
- Maturity Assessment Template

### **Audit Templates**
- Internal Audit Checklist (Clause 4-10)
- Annex A Control Audit Checklist
- Audit Report Template
- Nonconformity Report Template

### **Evidence Templates**
- Evidence Collection Checklist (per control)
- Evidence Review Template
- Evidence Repository Structure

### **Forms & Records**
- Access Request Form
- Incident Report Form
- Change Request Form
- Training Attendance Form
- Supplier Assessment Form
- Exception Approval Form

### **Planning Templates**
- 12-Week Implementation Plan
- 24-Week Implementation Plan
- Internal Audit Schedule
- Management Review Agenda
- Training Schedule

## Evidence Lists (Per Annex A Domain)

### **Organizational (5.1-5.28)** - 28 Controls
Evidence types per control: policies, procedures, meeting minutes, approvals, org charts, job descriptions

### **People (7.1-7.10)** - 10 Controls
Evidence types per control: training records, job descriptions, NDAs, contracts, disciplinary records

### **Physical (8.1-8.25)** - 25 Controls
Evidence types per control: access logs, visitor logs, camera footage, floor plans, security badges

### **Technological (8.26-8.34)** - 34 Controls
Evidence types per control: configurations, logs, encryption evidence, network diagrams, test results

## Dashboards (6+)

- ✓ **Compliance Overview Dashboard** - Overall readiness score
- ✓ **Control Implementation Dashboard** - Progress by Annex A domain
- ✓ **Risk Dashboard** - Risk heat map, top risks, trend analysis
- ✓ **Audit Dashboard** - Audit schedule, findings, CAPA status
- ✓ **Evidence Dashboard** - Evidence coverage, gaps, upcoming deadlines
- ✓ **KPI Dashboard** - Security metrics, training completion, incident trends
- ✓ **Certification Readiness Dashboard** - Stage-1/Stage-2 readiness checklist

---

# 5. DATA MODEL (ENTITIES)

## Core Entities

### **Organization**
- `id` (PK)
- `name`
- `legal_entity_type`
- `industry_sector`
- `employee_count`
- `website`
- `tenant_id` (for multi-tenant)
- `created_at`, `updated_at`
- **Relationships:** HasMany Sites, BusinessUnits, Users, Assets, Risks, Controls

### **Site**
- `id` (PK)
- `organization_id` (FK)
- `name`
- `address`
- `country`
- `site_type` (HQ, branch, data center)
- `is_in_scope` (boolean)
- **Relationships:** BelongsTo Organization, HasMany Assets

### **BusinessUnit**
- `id` (PK)
- `organization_id` (FK)
- `name`
- `description`
- `head_id` (FK to User)
- `is_in_scope` (boolean)
- **Relationships:** BelongsTo Organization, HasMany Processes, Assets

### **User**
- `id` (PK)
- `organization_id` (FK)
- `email`
- `name`
- `role` (CISO, ISMS Manager, Auditor, Control Owner, Viewer)
- `business_unit_id` (FK)
- `created_at`, `updated_at`
- **Relationships:** BelongsTo Organization, HasMany Risks, Controls

### **InterestedParty**
- `id` (PK)
- `organization_id` (FK)
- `name`
- `type` (customer, supplier, regulator, partner, internal)
- `requirements`
- `influence_level` (high, medium, low)
- **Relationships:** BelongsTo Organization

### **RegulatoryRequirement**
- `id` (PK)
- `organization_id` (FK)
- `name` (GDPR, HIPAA, SOC 2, ISO 27001, etc.)
- `description`
- `status` (applicable, monitoring, complied)
- `verification_method`
- **Relationships:** BelongsTo Organization

### **Scope**
- `id` (PK)
- `organization_id` (FK)
- `statement`
- `inclusions`
- `exclusions`
- `justification_for_exclusions`
- `boundary_document_url`
- `version`
- `status` (draft, approved)
- **Relationships:** BelongsTo Organization

### **Asset**
- `id` (PK)
- `organization_id` (FK)
- `site_id` (FK, optional)
- `business_unit_id` (FK, optional)
- `name`
- `type` (information, hardware, software, facility, person)
- `classification` (public, internal, confidential, restricted)
- `owner_id` (FK to User)
- `custodian_id` (FK to User)
- `description`
- `location`
- `is_critical` (boolean)
- **Relationships:** BelongsTo Organization, HasMany Risks

### **Risk**
- `id` (PK)
- `organization_id` (FK)
- `asset_id` (FK, optional)
- `title`
- `description`
- `threat`
- `vulnerability`
- `likelihood_score` (1-5)
- `impact_score` (1-5)
- `overall_score` (calculated)
- `risk_level` (low, medium, high, critical)
- `existing_controls`
- `owner_id` (FK to User)
- `status` (identified, analyzed, treatment_planned, accepted, monitored)
- `created_at`, `updated_at`
- **Relationships:** BelongsTo Organization, HasMany RiskTreatments

### **RiskTreatment**
- `id` (PK)
- `risk_id` (FK)
- `option` (avoid, transfer, mitigate, accept)
- `control_id` (FK to Control, optional)
- `description`
- `target_date`
- `residual_likelihood_score`
- `residual_impact_score`
- `residual_score` (calculated)
- `residual_risk_level`
- `status` (planned, in_progress, completed, verified)
- `responsible_id` (FK to User)
- **Relationships:** BelongsTo Risk

### **AnnexAControl**
- `id` (PK)
- `control_number` (e.g., "5.1", "8.8")
- `domain` (Organizational, People, Physical, Technological)
- `title`
- `description`
- `iso_27002_reference`
- `control_type` (preventive, detective, corrective, compensating)
- **Relationships:** HasMany OrganizationControls

### **OrganizationControl**
- `id` (PK)
- `organization_id` (FK)
- `annex_a_control_id` (FK)
- `is_applicable` (boolean)
- `exclusion_justification`
- `implementation_status` (not_implemented, planned, partially_implemented, implemented, tested, effective)
- `target_date`
- `owner_id` (FK to User)
- `maturity_level` (1-5)
- `test_frequency`
- `last_test_date`
- `next_test_date`
- **Relationships:** BelongsTo Organization, BelongsTo AnnexAControl, HasMany EvidenceItems

### **ControlEvidence**
- `id` (PK)
- `organization_control_id` (FK)
- `title`
- `description`
- `evidence_type` (policy, procedure, log, screenshot, config, report, certificate)
- `source` (manual, automated, tool_name)
- `file_url`
- `upload_date`
- `reviewed_by_id` (FK to User)
- `review_date`
- `status` (pending, approved, rejected)
- **Relationships:** BelongsTo OrganizationControl

### **Document**
- `id` (PK)
- `organization_id` (FK)
- `type` (policy, procedure, plan, report, record)
- `title`
- `description`
- `version`
- `status` (draft, under_review, approved, deprecated)
- `file_url`
- `created_by_id` (FK to User)
- `approved_by_id` (FK to User)
- `effective_date`
- `review_date`
- `next_review_date`
- **Relationships:** BelongsTo Organization

### **Policy**
- `id` (PK)
- `organization_id` (FK)
- `document_id` (FK)
- `policy_type`
- `requires_customization` (boolean)
- `customization_notes`
- `distribution_method`
- `acknowledgment_required` (boolean)
- **Relationships:** BelongsTo Organization, BelongsTo Document

### **Training**
- `id` (PK)
- `organization_id` (FK)
- `title`
- `description`
- `type` (onboarding, role_based, awareness, phishing_simulation)
- `target_audience`
- `delivery_method`
- `duration`
- **Relationships:** BelongsTo Organization, HasMany TrainingRecords

### **TrainingRecord**
- `id` (PK)
- `training_id` (FK)
- `user_id` (FK)
- `completion_date`
- `score` (optional)
- `status` (completed, failed, in_progress)
- `certificate_url`
- **Relationships:** BelongsTo Training, BelongsTo User

### **Supplier**
- `id` (PK)
- `organization_id` (FK)
- `name`
- `type` (software, infrastructure, consulting, other)
- `contact_details`
- `services_provided`
- `data_access` (yes/no)
- `risk_level` (low, medium, high)
- `sla_exists` (boolean)
- `assessment_status`
- **Relationships:** BelongsTo Organization, HasMany SupplierAssessments

### **SupplierAssessment**
- `id` (PK)
- `supplier_id` (FK)
- `assessment_date`
- `assessor_id` (FK to User)
- `risk_score`
- `findings`
- `recommendations`
- `approval_status`
- **Relationships:** BelongsTo Supplier

### **Audit**
- `id` (PK)
- `organization_id` (FK)
- `type` (internal, stage1, stage2, surveillance)
- `title`
- `planned_start_date`
- `planned_end_date`
- `actual_start_date`
- `actual_end_date`
- `auditor_id` (FK to User)
- `status` (planned, in_progress, completed, findings_issued)
- `scope`
- **Relationships:** BelongsTo Organization, HasMany AuditFindings

### **AuditFinding**
- `id` (PK)
- `audit_id` (FK)
- `control_id` (FK to OrganizationControl, optional)
- `clause_reference` (e.g., "9.2")
- `finding_type` (nonconformity, observation, opportunity_for_improvement)
- `severity` (major, minor)
- `description`
- `root_cause`
- `evidence_reference`
- `status` (open, capa_initiated, closed, verified)
- **Relationships:** BelongsTo Audit, HasMany CAPAItems

### **CAPAItem**
- `id` (PK)
- `finding_id` (FK to AuditFinding, optional)
- `nonconformity_id` (FK, optional)
- `type` (corrective, preventive)
- `description`
- `root_cause`
- `action_plan`
- `target_date`
- `responsible_id` (FK to User)
- `completion_date`
- `effectiveness_verification`
- `effectiveness_verified_by_id` (FK to User)
- `status` (planned, in_progress, completed, verified, closed)
- **Relationships:** BelongsTo AuditFinding

### **Incident**
- `id` (PK)
- `organization_id` (FK)
- `incident_number` (auto-generated)
- `title`
- `description`
- `type` (malware, phishing, data_breach, denial_of_service, unavailability, other)
- `severity` (low, medium, high, critical)
- `discovered_date`
- `reported_by_id` (FK to User)
- `assigned_to_id` (FK to User)
- `resolution_date`
- `root_cause`
- `status` (reported, investigating, resolved, closed)
- **Relationships:** BelongsTo Organization, HasMany IncidentTasks

### **ManagementReview**
- `id` (PK)
- `organization_id` (FK)
- `review_period_start`
- `review_period_end`
- `review_date`
- `attendees` (JSON)
- `agenda_items` (JSON)
- `findings`
- `decisions`
- `action_items` (JSON)
- `status` (planned, conducted, completed)
- **Relationships:** BelongsTo Organization

### **KPI**
- `id` (PK)
- `organization_id` (FK)
- `name`
- `description`
- `metric_type` (percentage, count, score, boolean)
- `target_value`
- `frequency` (daily, weekly, monthly, quarterly, annually)
- **Relationships:** BelongsTo Organization, HasMany KPIValues

### **KPIValue**
- `id` (PK)
- `kpi_id` (FK)
- `recorded_date`
- `actual_value`
- `status` (on_track, at_risk, off_track)
- **Relationships:** BelongsTo KPI

### **ImplementationPlan**
- `id` (PK)
- `organization_id` (FK)
- `plan_type` (12_week, 24_week)
- `start_date`
- `target_completion_date`
- `status` (not_started, in_progress, on_track, delayed, completed)
- **Relationships:** BelongsTo Organization, HasMany Milestones

### **Milestone**
- `id` (PK)
- `implementation_plan_id` (FK)
- `title`
- `description`
- `planned_date`
- `actual_date`
- `deliverables` (JSON)
- `status` (not_started, in_progress, completed, delayed)
- **Relationships:** BelongsTo ImplementationPlan

---

# 6. IMPLEMENTATION TIMELINE TEMPLATE

## 12-Week Fast Track Implementation Plan

| Week | Phase | Key Activities | Milestones & Deliverables | Dependencies |
|------|-------|----------------|---------------------------|--------------|
| **Week 1** | **Setup & Context** | - Complete onboarding wizard<br>- Establish project team<br>- Define ISMS context<br>- Identify interested parties<br>- Map regulatory requirements | ✓ Organization setup complete<br>✓ Context document<br>✓ Interested parties register<br>✓ Regulatory requirements log | Project kickoff |
| **Week 2** | **Scope & Risk Framework** | - Define ISMS scope<br>- Identify exclusions<br>- Develop risk methodology<br>- Establish risk criteria | ✓ Scope statement<br>✓ Scope diagram<br>✓ Risk methodology document<br>✓ Risk criteria matrix | Context approved |
| **Week 3** | **Asset Inventory** | - Create asset inventory<br>- Classify assets<br>- Assign asset owners<br>- Identify critical assets | ✓ Asset register<br>✓ Classification matrix<br>✓ Asset ownership matrix<br>✓ Critical asset list | Scope approved |
| **Week 4** | **Risk Assessment** | - Identify threats and vulnerabilities<br>- Assess risks<br>- Score and prioritize<br>- Generate risk register | ✓ Risk register<br>✓ Risk heat map<br>✓ High-risk items list<br>✓ Control gaps identified | Asset inventory complete |
| **Week 5** | **Risk Treatment & SoA** | - Select risk treatments<br>- Determine Annex A applicability<br>- Define control exclusions<br>- Create SoA | ✓ Risk treatment plan<br>✓ Statement of Applicability<br>✓ Control implementation tracker<br>✓ Exclusions justification | Risk assessment complete |
| **Week 6** | **Policy Development** | - Customize policy pack<br>- Approve ISMS policy<br>- Approve domain policies<br>- Setup approval workflow | ✓ ISMS policy<br>✓ Policy pack (15+ policies)<br>✓ Policy approval records<br>✓ Policy distribution plan | SoA approved |
| **Week 7** | **Control Implementation (Phase 1)** | - Implement high-priority controls<br>- Collect evidence<br>- Map evidence sources<br>- Assign control owners | ✓ Control implementation tracker (50%+)<br>✓ Evidence repository<br>✓ Evidence mapping<br>✓ Control assignments | Policies approved |
| **Week 8** | **Control Implementation (Phase 2)** | - Implement remaining controls<br>- Complete evidence collection<br>- Verify control effectiveness<br>- Update maturity assessments | ✓ Control implementation tracker (100%)<br>✓ Evidence checklist complete<br>✓ Maturity report<br>✓ Effectiveness verification | Phase 1 complete |
| **Week 9** | **Awareness & Training** | - Deliver security training<br>- Conduct awareness campaign<br>- Track completion<br>- Update training records | ✓ Training records (100% staff)<br>✓ Awareness materials<br>✓ Training completion report<br>✓ Role-based training | Controls implemented |
| **Week 10** | **Internal Audit** | - Conduct internal audit<br>- Document findings<br>- Identify nonconformities<br>- Initiate CAPA | ✓ Internal audit report<br>✓ Audit findings<br>✓ Nonconformity register<br>✓ CAPA initiated | Training complete |
| **Week 11** | **CAPA & Management Review** | - Implement corrective actions<br>- Verify effectiveness<br>- Conduct management review<br>- Review KPIs | ✓ CAPA completed<br>✓ Effectiveness verification<br>✓ Management review pack<br>✓ Review minutes<br>✓ KPI dashboard | Audit complete |
| **Week 12** | **Certification Readiness** | - Final evidence review<br>- Gap assessment<br>- Pre-certification check<br>- Stage-1 audit preparation | ✓ Certification readiness score >90%<br>✓ Complete document pack<br>✓ Stage-1 audit checklist<br>✓ Certification application ready | CAPA closed |

---

## 24-Week Standard Implementation Plan

| Week | Phase | Key Activities | Milestones & Deliverables | Dependencies |
|------|-------|----------------|---------------------------|--------------|
| **Week 1-2** | **Setup & Context** | - Complete onboarding wizard<br>- Establish governance<br>- Define ISMS context<br>- Identify interested parties<br>- Map regulatory requirements<br>- Appoint ISMS team | ✓ Organization setup<br>✓ Governance structure<br>✓ Context document<br>✓ Interested parties register<br>✓ Regulatory requirements log | Project kickoff |
| **Week 3-4** | **Scope & Framework** | - Define ISMS scope<br>- Create scope diagram<br>- Develop risk methodology<br>- Establish risk criteria<br>- Approve scope statement | ✓ Scope statement<br>✓ Scope diagram<br>✓ Risk methodology<br>✓ Risk criteria matrix | Context approved |
| **Week 5-6** | **Asset Management** | - Create comprehensive asset inventory<br>- Classify assets by type<br>- Classify data by sensitivity<br>- Assign asset owners<br>- Identify critical assets<br>- Develop asset management procedures | ✓ Asset register<br>✓ Asset classification matrix<br>✓ Data classification policy<br>✓ Asset ownership matrix<br>✓ Critical asset list<br>✓ Asset management procedure | Scope approved |
| **Week 7-8** | **Supplier Management** | - Inventory suppliers<br>- Assess supplier risks<br>- Review existing agreements<br>- Update SLAs if needed<br>- Document third-party dependencies | ✓ Supplier register<br>✓ Supplier risk assessments<br>✓ SLA templates<br>✓ Third-party register | Asset inventory complete |
| **Week 9-10** | **Risk Assessment** | - Conduct threat analysis<br>- Identify vulnerabilities<br>- Assess likelihood and impact<br>- Score risks<br>- Generate comprehensive risk register<br>- Create risk heat map | ✓ Risk register<br>✓ Risk heat map<br>✓ High/medium/low risk lists<br>✓ Control gap analysis<br>✓ Top 10 risks report | Asset inventory complete |
| **Week 11-12** | **Risk Treatment & SoA** | - Select treatment options<br>- Create risk treatment plans<br>- Determine Annex A applicability<br>- Document control exclusions<br>- Create Statement of Applicability<br>- Assign control owners | ✓ Risk treatment plan<br>✓ Residual risk register<br>✓ Statement of Applicability<br>✓ Control implementation tracker<br>✓ Control ownership matrix | Risk assessment complete |
| **Week 13-14** | **Policy Development** | - Customize all policies<br>- Develop procedures<br>- Establish approval workflow<br>- Approve ISMS policy<br>- Approve all domain policies | ✓ ISMS policy<br>✓ Policy pack (15+ policies)<br>✓ Procedure pack (10+ procedures)<br>✓ Policy approval records<br>✓ Document control procedure | SoA approved |
| **Week 15-16** | **Control Implementation (Phase 1)** | - Implement Organizational controls<br>- Implement People controls<br>- Collect evidence<br>- Map evidence sources<br>- Start maturity assessments | ✓ Org controls implemented<br>✓ People controls implemented<br>✓ Evidence repository (Phase 1)<br>✓ Evidence mapping<br>✓ Maturity assessment (Phase 1) | Policies approved |
| **Week 17-18** | **Control Implementation (Phase 2)** | - Implement Physical controls<br>- Implement Technological controls<br>- Complete evidence collection<br>- Verify control effectiveness<br>- Finalize maturity assessments | ✓ All controls implemented<br>✓ Evidence repository complete<br>✓ Evidence checklist complete<br>✓ Maturity report<br>✓ Effectiveness verification | Phase 1 complete |
| **Week 19-20** | **Awareness & Training** | - Develop training materials<br>- Deliver role-based training<br>- Conduct awareness campaign<br>- Run phishing simulations<br>- Track completion<br>- Update training records | ✓ Training plan<br>✓ Training materials<br>✓ Training records (100% staff)<br>✓ Awareness campaign results<br>✓ Phishing simulation report<br>✓ Role-based training records | Controls implemented |
| **Week 21** | **Incident Management Setup** | - Develop incident procedures<br>- Train incident response team<br>- Setup incident logging<br>- Test incident response process | ✓ Incident management procedure<br>✓ Incident response team<br>✓ Incident logging system<br>✓ Incident response test | Training complete |
| **Week 22** | **Internal Audit** | - Plan internal audit<br>- Create audit checklists<br>- Conduct audit<br>- Document findings<br>- Identify nonconformities<br>- Present audit report | ✓ Internal audit program<br>✓ Audit checklists<br>✓ Audit execution<br>✓ Audit findings<br>✓ Nonconformity register<br>✓ Audit report | All controls implemented |
| **Week 23** | **CAPA & Management Review** | - Develop CAPA plans<br>- Implement corrective actions<br>- Verify effectiveness<br>- Conduct management review<br>- Review all KPIs<br>- Document decisions | ✓ CAPA plans<br>✓ Corrective actions implemented<br>✓ Effectiveness verification<br>✓ Management review pack<br>✓ Management review minutes<br>✓ Action items log | Audit complete |
| **Week 24** | **Certification Readiness** | - Final evidence review<br>- Conduct gap assessment<br>- Pre-certification readiness check<br>- Address any remaining gaps<br>- Prepare Stage-1 audit package<br>- Submit certification application | ✓ Certification readiness score >95%<br>✓ Complete document pack<br>✓ Stage-1 audit checklist<br>✓ Stage-2 audit preparation<br>✓ Certification application submitted | CAPA closed |

---

# 7. CERTIFICATION READINESS CHECKLIST

## Stage-1 Audit Readiness (Document Review)

### **Clause 4: Context of the Organization** [100%]
- [ ] **4.1 Understanding the organization and its context**
  - [ ] Context document completed
  - [ ] Internal/external issues identified
  - [ ] Business drivers documented
  - [ ] Context approved by management

- [ ] **4.2 Understanding the needs and expectations of interested parties**
  - [ ] Interested parties register complete
  - [ ] Requirements captured and documented
  - [ ] Regulatory/contractual requirements identified
  - [ ] Interested parties regularly reviewed

- [ ] **4.3 Determining the scope of the ISMS**
  - [ ] Scope statement documented
  - [ ] Scope boundaries defined
  - [ ] Exclusions justified (if any)
  - [ ] Scope approved by management
  - [ ] All relevant functions/units included

- [ ] **4.4 Information security management system**
  - [ ] ISMS processes established
  - [ ] Process interactions documented
  - [ ] Process sequence determined
  - [ ] Integration of processes demonstrated

### **Clause 5: Leadership** [100%]
- [ ] **5.1 Leadership and commitment**
  - [ ] Top management commitment documented
  - [ ] ISMS policy endorsed
  - [ ] Resources allocated
  - [ ] Leadership involvement demonstrated

- [ ] **5.2 Policy**
  - [ ] ISMS policy established
  - [ ] Policy approved by top management
  - [ ] Policy communicated to all personnel
  - [ ] Policy available to interested parties
  - [ ] Policy reviewed and updated

- [ ] **5.3 Organizational roles, responsibilities and authorities**
  - [ ] Roles and responsibilities defined
  - [ ] Authority levels documented
  - [ ] Responsibilities communicated
  - [ ] Organization chart available

### **Clause 6: Planning** [100%]
- [ ] **6.1 Actions to address risks and opportunities**
  - [ ] **6.1.1 General** - Risk management process defined
  - [ ] **6.1.2 Information security risk assessment** - Risk assessment methodology, Risk assessment conducted, Risk assessment documented
  - [ ] **6.1.3 Information security risk treatment** - Risk treatment options, Risk treatment plan, Residual risk acceptance

- [ ] **6.2 Information security objectives and planning to achieve them**
  - [ ] Information security objectives established
  - [ ] Objectives are measurable
  - [ ] Objectives aligned with policy
  - [ ] Planning to achieve objectives
  - [ ] Objectives reviewed and updated

- [ ] **6.3 Planning of changes**
  - [ ] Change process established
  - [ ] Changes planned and managed

### **Clause 7: Support** [100%]
- [ ] **7.1 Resources**
  - [ ] Resources determined
  - [ ] Resources provided
  - [ ] Resources maintained

- [ ] **7.2 Competence**
  - [ ] Competence requirements defined
  - [ ] Competence evaluated
  - [ ] Training provided where needed
  - [ ] Records of competence maintained

- [ ] **7.3 Awareness**
  - [ ] Security awareness program
  - [ ] Personnel understand their contribution
  - [ ] Personnel understand consequences
  - [ ] Awareness training records

- [ ] **7.4 Communication**
  - [ ] Internal communication process
  - [ ] External communication process
  - [ ] Communication records

- [ ] **7.5 Documented information**
  - [ ] **7.5.1 General** - Documented information controlled
  - [ ] **7.5.2 Creating and updating** - Proper creation/update process
  - [ ] **7.5.3 Control of documented information** - Version control, Access control, Document register

### **Clause 8: Operation** [100%]
- [ ] **8.1 Operational planning and control**
  - [ ] Criteria for processes established
  - [ ] Processes implemented
  - [ ] Processes controlled
  - [ ] Documented information retained

- [ ] **8.2 Information security risk assessment**
  - [ ] Risk assessments conducted
  - [ ] Risk assessment documented
  - [ ] Risk assessment methodology followed

- [ ] **8.3 Information security risk treatment**
  - [ ] Risk treatment implemented
  - [ ] Risk treatment documented
  - [ ] Residual risk acceptable

### **Annex A Controls - Evidence Available**
- [ ] **A.5 Organizational (28 controls)**
  - [ ] A.5.1 Policies for information security - Policy documents available
  - [ ] A.5.2 Roles and responsibilities - Job descriptions, RACI matrix
  - [ ] A.5.3 Segregation of duties - SoD documented and enforced
  - [ ] A.5.4 Management responsibilities - Management meeting minutes
  - [ ] A.5.5 Contact with authorities - Contact list documented
  - [ ] A.5.6 Contact with special interest groups - Participation documented
  - [ ] A.5.7 Threat intelligence - Threat monitoring records
  - [ ] A.5.8 Project management - Security in projects documented
  - [ ] A.5.9 Inventory of information and other associated assets - Asset register
  - [ ] A.5.10 Acceptable use - Acceptable use policy, acknowledgments
  - [ ] A.5.11 Return of assets - Asset return process
  - [ ] A.5.12 Classification of information - Classification policy and labels
  - [ ] A.5.13 Labelling of information - Labelling evidence
  - [ ] A.5.14 Information transfer - Transfer procedures and records
  - [ ] A.5.15 Access control - Access control policy
  - [ ] A.5.16 Identity management - Identity management process
  - [ ] A.5.17 Authentication information - Password policy, MFA evidence
  - [ ] A.5.18 Access rights - Access request and approval records
  - [ ] A.5.19 Information security in supplier relationships - Supplier assessments
  - [ ] A.5.20 Addressing information security within supplier agreements - Contracts/SLAs
  - [ ] A.5.21 Managing information security in the supplier relationship - Reviews
  - [ ] A.5.22 Monitoring, review and audit of supplier services - Audit records
  - [ ] A.5.23 Managing information security in the supplier relationship - Exit process
  - [ ] A.5.24 Information security incident management planning - Incident procedure
  - [ ] A.5.25 Assessment and decision on information security events - Incident logs
  - [ ] A.5.26 Response to information security incidents - Response records
  - ] A.5.27 Learning from information security incidents - Lessons learned
  - [ ] A.5.28 Collection of evidence - Evidence collection process

- [ ] **A.7 People (10 controls)**
  - [ ] A.7.1 Screening - Background check records
  - [ ] A.7.2 Terms and conditions of employment - Contracts, NDAs
  - [ ] A.7.3 Information security awareness, education and training - Training records
  - [ ] A.7.4 Information security awareness, education and training (disciplinary) - Disciplinary process
  - [ ] A.7.5 Termination or change of employment responsibilities - Offboarding process
  - [ ] A.7.6 Removal of access rights - Access revocation records
  - [ ] A.7.7 Return of assets - Asset return records
  - [ ] A.7.8 Removal of access rights (termination) - Evidence of access removal
  - [ ] A.7.9 Confidentiality or non-disclosure agreements - NDAs on file
  - [ ] A.7.10 Remote working - Remote work policy and procedures

- [ ] **A.8 Physical (25 controls)**
  - [ ] A.8.1 Physical security perimeters - Physical security measures
  - [ ] A.8.2 Entry points - Entry controls, visitor logs
  - [ ] A.8.3 Security offices, rooms and facilities - Secure areas documented
  - [ ] A.8.4 Monitoring and logging - CCTV, access logs
  - [ ] A.8.5 Protection against external and environmental threats - Environmental controls
  - [ ] A.8.6 Working in secure areas - Secure area procedures
  - [ ] A.8.7 Clear desk and clear screen - Clear desk policy and evidence
  - [ ] A.8.8 Equipment siting and protection - Equipment security
  - [ ] A.8.9 Management of removable media - Media handling procedure
  - [ ] A.8.10 Management of removable media - Disposal of media
  - [ ] A.8.11 Management of removable media - Physical transfer of media
  - [ ] A.8.12 Support and utility infrastructure - Infrastructure maintenance
  - [ ] A.8.13 Cabling security - Cabling protection
  - [ ] A.8.14 Equipment maintenance - Maintenance records
  - [ ] A.8.15 Secure disposal or re-use of equipment - Disposal process
  - [ ] A.8.16 Unattended user equipment - Lock screen policy
  - [ ] A.8.17 Clear desk and clear screen policy - Policy enforcement
  - [ ] A.8.18 Information security policy for off-site equipment - Off-site procedure
  - [ ] A.8.19 Storage of IT equipment - Secure storage
  - [ ] A.8.20 Policy on the use of clear desk and clear screen - Policy
  - [ ] A.8.21 Security of equipment off-premises - Off-site security measures
  - [ ] A.8.22 Security of equipment off-premises (disposal) - Disposal records
  - [ ] A.8.23 Information security policy for home working - Home working policy
  - [ ] A.8.24 Security of equipment and information off-premises - Protective measures
  - [ ] A.8.25 Security of equipment and information off-premises (travel) - Travel guidance

- [ ] **A.8 Technological (34 controls)**
  - [ ] A.8.26 User endpoint devices - Device management
  - [ ] A.8.27 Privileged access rights - Privileged access records
  - [ ] A.8.28 Information access restriction - Access restrictions evidence
  - [ ] A.8.29 Secure authentication - Authentication methods documented
  - [ ] A.8.30 System access control - System access controls
  - [ ] A.8.31 Information security in supplier relationships - Supplier tech controls
  - [ ] A.8.32 Management of technical vulnerabilities - Vulnerability scans
  - [ ] A.8.33 Configuration management - Configuration records
  - [ ] A.8.34 Information deletion - Deletion procedures
  - [ ] A.8.35 Cryptography - Encryption evidence
  - [ ] A.8.36 Secure development lifecycle - SDL process
  - [ ] A.8.37 Security testing - Security test results
  - [ ] A.8.38 Change management - Change tickets and approvals
  - [ ] A.8.39 Information on vulnerabilities - Vulnerability monitoring
  - [ ] A.8.40 Information on vulnerabilities (testing) - Penetration tests
  - [ ] A.8.41 Information on vulnerabilities (deployment) - Deployment process
  - [ ] A.8.42 Information on vulnerabilities (logging) - Logging evidence
  - [ ] A.8.43 Information on vulnerabilities (monitoring) - Monitoring evidence
  - [ ] A.8.44 Information on vulnerabilities (synchronization) - Time sync
  - [ ] A.8.45 Information on vulnerabilities (privileged utilities) - Utility controls
  - [ ] A.8.46 Information on vulnerabilities (installation of software) - Installation records
  - [ ] A.8.47 Information on vulnerabilities (security testing) - Test records
  - [ ] A.8.48 Information on vulnerabilities (change management) - Change records
  - [ ] A.8.49 Information on vulnerabilities (information backup) - Backup records
  - [ ] A.8.50 Information on vulnerabilities (redundancy of information) - Redundancy evidence
  - [ ] A.8.51 Information on vulnerabilities (logging) - Log retention policy
  - [ ] A.8.52 Information on vulnerabilities (monitoring activities) - Monitoring procedures
  - [ ] A.8.53 Information on vulnerabilities (clock synchronization) - NTP evidence
  - [ ] A.8.54 Information on vulnerabilities (privileged access rights) - Privileged logs
  - [ ] A.8.55 Information on vulnerabilities (installation of software) - Software controls
  - [ ] A.8.56 Technical compliance review - Compliance reviews
  - [ ] A.8.57 Independent review of technical compliance - Independent audit
  - ] A.8.58 Information protection in event of disruption - Protection evidence
  - [ ] A.8.59 Information protection during event of disruption - Continuity plans

### **Statement of Applicability**
- [ ] SoA completed and approved
- [ ] All applicable controls listed
- [ ] Control exclusions justified
- [ ] Implementation status accurate
- [ ] Reference to Annex A controls

---

## Stage-2 Audit Readiness (Implementation Verification)

### **Implementation Effectiveness** [100%]
- [ ] Controls implemented as documented
- [ ] Evidence available for all implemented controls
- [ ] Evidence covers entire implementation period
- [ ] Evidence dates align with implementation
- [ ] Controls operating effectively

### **Performance Evaluation** [100%]

- [ ] **9.1 Monitoring, measurement, analysis and evaluation**
  - [ ] Monitoring methods defined
  - [ ] Measurements taken and recorded
  - [ ] Analysis performed
  - [ ] Evaluation results documented
  - [ ] KPIs tracked and reported

- [ ] **9.2 Internal audit**
  - [ ] Internal audit program established
  - [ ] Internal audit conducted
  - [ ] Audit documented with findings
  - [ ] Audit competence demonstrated
  - [ ] Audit results reported to management

- [ ] **9.3 Management review**
  - [ ] Management review planned
  - [ ] Review inputs prepared
  - [ ] Review conducted at planned intervals
  - [ ] Review outputs documented
  - [ ] Review includes opportunities for improvement

### **Improvement** [100%]

- [ ] **10.1 Nonconformity and corrective action**
  - [ ] Nonconformity process established
  - [ ] Nonconformities identified and addressed
  - [ ] Corrective actions documented
  - [ ] Effectiveness verified
  - [ ] Information updated

- [ ] **10.2 Continual improvement**
  - [ ] Opportunities for improvement identified
  - [ ] Improvement actions taken
  - [ ] Effectiveness of improvements evaluated
  - [ ] Objectives updated as needed

### **Additional Readiness Requirements**

#### **Evidence Completeness**
- [ ] Evidence available for all Annex A controls (93 controls)
- [ ] Evidence covers minimum 3 months of operation
- [ ] Evidence is traceable and auditable
- [ ] Evidence is properly labeled and organized
- [ ] Evidence is version-controlled

#### **Records Retention**
- [ ] Documented information retention policy
- [ ] Retention periods defined
- [ ] Records properly stored and protected
- [ ] Disposal process followed
- [ ] Archive process established

#### **Training & Competence**
- [ ] 100% staff completed security awareness training
- [ ] Role-specific training completed for relevant roles
- [ ] Training records up-to-date
- [ ] Competence assessments completed
- [ ] Training effectiveness evaluated

#### **Incident Management**
- [ ] Incident management process operational
- [ ] Incident response team trained
- [ ] Incident log maintained
- [ ] Lessons learned documented
- [ ] Incident trends analyzed

#### **Management Involvement**
- [ ] Management review conducted
- [ ] Top management participation documented
- [ ] Resources allocated adequately
- [ ] Policy reviewed and approved
- [ ] Decisions documented and communicated

#### **Supplier Management**
- [ ] All suppliers assessed
- [ ] Security requirements in contracts
- [ ] Supplier performance monitored
- [ ] Third-party risks managed
- [ ] Exit procedures defined

#### **Risk Management**
- [ ] Risk assessment current
- [ ] Risk treatment implemented
- [ ] Residual risk acceptable
- [ ] Risk monitoring in place
- [ ] Risk review scheduled

#### **Internal Audit**
- [ ] Internal audit completed
- [ ] Findings addressed
- [ ] CAPA implemented
- [ ] Effectiveness verified
- [ ] Audit cycle defined

#### **Certification Application**
- [ ] Certification body selected
- [ ] Application submitted
- [ ] Contract with certification body
- [ ] Audit dates scheduled
- [ ] Audit team credentials verified

#### **Pre-Audit Preparation**
- [ ] Document repository organized
- [ ] Evidence pack prepared
- [ ] Staff briefed for audit
- [ ] Interview preparation complete
- [ ] IT systems audit-ready

#### **Audit Support**
- [ ] Audit room/space reserved
- [ ] IT access for auditors arranged
- [ ] Subject matter experts available
- [ ] Evidence readily accessible
- [ ] Questions/response process defined

---

## Overall Readiness Score Calculation

| Category | Weight | Score | Weighted Score |
|----------|--------|-------|----------------|
| Documentation | 25% | ___/100 | ___ |
| Implementation | 30% | ___/100 | ___ |
| Evidence | 25% | ___/100 | ___ |
| Management Commitment | 10% | ___/100 | ___ |
| Process Maturity | 10% | ___/100 | ___ |
| **TOTAL** | **100%** | | ___/100 |

**Readiness Thresholds:**
- **< 70%:** Not Ready - Significant gaps remain
- **70-79%:** Conditionally Ready - Minor gaps to address
- **80-89%:** Ready - Minor improvements recommended
- **90-95%:** Well Prepared - Ready for Stage-1 audit
- **> 95%:** Excellent - Ready for Stage-2 audit

---

# APPENDIX A: Annex A Control Catalog (ISO 27002:2022)

## A.5 Organizational (28 Controls)

| Control | Title | Purpose |
|---------|-------|---------|
| 5.1 | Policies for information security | Management direction |
| 5.2 | Roles and responsibilities | Define and allocate responsibilities |
| 5.3 | Segregation of duties | Conflicting duties separated |
| 5.4 | Management responsibilities | Management sets example |
| 5.5 | Contact with authorities | Appropriate contacts maintained |
| 5.6 | Contact with special interest groups | Appropriate contacts maintained |
| 5.7 | Threat intelligence | Threat information obtained |
| 5.8 | Project management | Security integrated into projects |
| 5.9 | Inventory of information and other associated assets | Identify and inventory assets |
| 5.10 | Acceptable use | Rules for use of information |
| 5.11 | Return of assets | Assets returned upon termination |
| 5.12 | Classification of information | Classified according to protection needs |
| 5.13 | Labelling of information | Information labelled according to classification |
| 5.14 | Information transfer | Information transfer rules |
| 5.15 | Access control | Access control rules |
| 5.16 | Identity management | Identity lifecycle managed |
| 5.17 | Authentication information | Authentication information protected |
| 5.18 | Access rights | Access rights granted and reviewed |
| 5.19 | Information security in supplier relationships | Supplier relationships secured |
| 5.20 | Addressing information security within supplier agreements | Security addressed in agreements |
| 5.21 | Managing information security in the supplier relationship | Ongoing management |
| 5.22 | Monitoring, review and audit of supplier services | Supplier services monitored |
| 5.23 | Addressing information security incidents with suppliers | Incidents managed jointly |
| 5.24 | Information security incident management planning | Incident management plan |
| 5.25 | Assessment and decision on information security events | Events assessed |
| 5.26 | Response to information security incidents | Incidents responded to |
| 5.27 | Learning from information security incidents | Knowledge gained |
| 5.28 | Collection of evidence | Evidence collected and preserved |

## A.7 People (10 Controls)

| Control | Title | Purpose |
|---------|-------|---------|
| 7.1 | Screening | Background verification |
| 7.2 | Terms and conditions of employment | Terms defined |
| 7.3 | Information security awareness, education and training | Staff trained and aware |
| 7.4 | Disciplinary process | Process for disciplinary action |
| 7.5 | Termination or change of employment responsibilities | Process defined |
| 7.6 | Removal of access rights | Access removed |
| 7.7 | Return of assets | Assets returned |
| 7.8 | Deactivation of access rights | Access deactivated |
| 7.9 | Confidentiality or non-disclosure agreements | NDAs signed |
| 7.10 | Remote working | Remote work secured |

## A.8 Physical (25 Controls)

| Control | Title | Purpose |
|---------|-------|---------|
| 8.1 | Physical security perimeters | Physical protection |
| 8.2 | Entry points | Entry secured |
| 8.3 | Security offices, rooms and facilities | Secure areas protected |
| 8.4 | Monitoring and logging | Monitoring enabled |
| 8.5 | Protection against external and environmental threats | Environmental protection |
| 8.6 | Working in secure areas | Secure access control |
| 8.7 | Clear desk and clear screen | Clear desk/screen policy |
| 8.8 | Equipment siting and protection | Equipment protected |
| 8.9 | Management of removable media | Media managed |
| 8.10 | Disposal of media | Media securely disposed |
| 8.11 | Physical transfer of media | Media transfer secured |
| 8.12 | Support and utility infrastructure | Infrastructure protected |
| 8.13 | Cabling security | Cabling protected |
| 8.14 | Equipment maintenance | Equipment maintained |
| 8.15 | Secure disposal or re-use of equipment | Equipment securely disposed |
| 8.16 | Unattended user equipment | Equipment protected |
| 8.17 | Clear desk and clear screen policy | Policy enforced |
| 8.18 | Information security policy for off-site equipment | Off-site equipment secured |
| 8.19 | Storage of IT equipment | Storage secured |
| 8.20 | Policy on the use of clear desk and clear screen | Policy in place |
| 8.21 | Security of equipment off-premises | Off-premises security |
| 8.22 | Security of equipment and information off-premises (disposal) | Disposal secured |
| 8.23 | Information security policy for home working | Home working secured |
| 8.24 | Security of equipment and information off-premises | Protection measures |
| 8.25 | Security of equipment and information off-premises (travel) | Travel security |

## A.8 Technological (34 Controls)

| Control | Title | Purpose |
|---------|-------|---------|
| 8.26 | User endpoint devices | Endpoint devices secured |
| 8.27 | Privileged access rights | Privileged access controlled |
| 8.28 | Information access restriction | Access restricted |
| 8.29 | Secure authentication | Authentication secured |
| 8.30 | System access control | System access controlled |
| 8.31 | Information security in supplier relationships | Supplier tech controls |
| 8.32 | Management of technical vulnerabilities | Vulnerabilities managed |
| 8.33 | Configuration management | Configurations managed |
| 8.34 | Information deletion | Information securely deleted |
| 8.35 | Cryptography | Cryptography controlled |
| 8.36 | Secure development lifecycle | Secure development |
| 8.37 | Security testing | Security testing performed |
| 8.38 | Change management | Changes controlled |
| 8.39 | Information on vulnerabilities | Vulnerabilities monitored |
| 8.40 | Information on vulnerabilities (testing) | Testing performed |
| 8.41 | Information on vulnerabilities (deployment) | Deployment secured |
| 8.42 | Information on vulnerabilities (logging) | Logging implemented |
| 8.43 | Information on vulnerabilities (monitoring) | Monitoring implemented |
| 8.44 | Information on vulnerabilities (synchronization) | Time synchronization |
| 8.45 | Information on vulnerabilities (privileged utilities) | Privileged utilities controlled |
| 8.46 | Information on vulnerabilities (installation of software) | Software installation controlled |
| 8.47 | Information on vulnerabilities (security testing) | Security testing |
| 8.48 | Information on vulnerabilities (change management) | Change management |
| 8.49 | Information on vulnerabilities (information backup) | Backup implemented |
| 8.50 | Information on vulnerabilities (redundancy of information) | Redundancy provided |
| 8.51 | Information on vulnerabilities (logging) | Logging policy |
| 8.52 | Information on vulnerabilities (monitoring activities) | Monitoring activities |
| 8.53 | Information on vulnerabilities (clock synchronization) | Clock sync |
| 8.54 | Information on vulnerabilities (privileged access rights) | Privileged access |
| 8.55 | Information on vulnerabilities (installation of software) | Software controls |
| 8.56 | Technical compliance review | Compliance reviewed |
| 8.57 | Independent review of technical compliance | Independent review |
| 8.58 | Information protection in event of disruption | Protection during disruption |
| 8.59 | Information protection during event of disruption | Continuity plans |

---

*End of ISO 27001 Cookie-Cutter Automation Platform Blueprint*