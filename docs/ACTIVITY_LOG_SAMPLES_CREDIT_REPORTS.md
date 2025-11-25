# Activity Log Samples for Credit Report Rule Engine Failures

This document shows how activity logs are stored when credit report rule engines (CRIF, CIBIL, EXPERIAN) fail.

## Activity Log Structure

When a credit report fails and the lead status is updated to "Not met criteria", an activity log entry is created with the following structure:

```javascript
{
  id: <auto_increment>,
  activity_type: "LEAD_STATUS_UPDATE",
  activity_desc: "Lead status updated from {previousStatus} to Not met criteria - {reportType} - {failureReason}",
  note: "Auto-rejected ({reportType}): {failureReason}",
  created_by: <userId>,
  lead_id: <leadId>,
  lead_name: "<leadName>",
  status: "active",
  createdAt: "<timestamp>",
  updatedAt: "<timestamp>"
}
```

---

## Sample Activity Log Entries

### Example 1: CIBIL Report Failure - Age Criteria Failed

**Scenario:**
- Previous Status: "Not Contacted"
- Report Type: "CIBIL"
- Failure Reason: "Rejected: Age is 47 years (must be between 21 and 55 years)"
- Lead Name: "John Doe"
- User ID: 3
- Lead ID: 2103

**Activity Log Entry:**
```json
{
  "id": 12345,
  "activity_type": "LEAD_STATUS_UPDATE",
  "activity_desc": "Lead status updated from Not Contacted to Not met criteria - CIBIL - Rejected: Age is 47 years (must be between 21 and 55 years)",
  "note": "Auto-rejected (CIBIL): Rejected: Age is 47 years (must be between 21 and 55 years)",
  "created_by": 3,
  "lead_id": 2103,
  "lead_name": "John Doe",
  "status": "active",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

---

### Example 2: CRIF Report Failure - 90+ DPDs Count Failed

**Scenario:**
- Previous Status: "Follow Up"
- Report Type: "CRIF"
- Failure Reason: "Rejected: 90+ DPDs count is 12 (>= 10)"
- Lead Name: "Jane Smith"
- User ID: 3
- Lead ID: 2104

**Activity Log Entry:**
```json
{
  "id": 12346,
  "activity_type": "LEAD_STATUS_UPDATE",
  "activity_desc": "Lead status updated from Follow Up to Not met criteria - CRIF - Rejected: 90+ DPDs count is 12 (>= 10)",
  "note": "Auto-rejected (CRIF): Rejected: 90+ DPDs count is 12 (>= 10)",
  "created_by": 3,
  "lead_id": 2104,
  "lead_name": "Jane Smith",
  "status": "active",
  "createdAt": "2025-01-15T11:15:00.000Z",
  "updatedAt": "2025-01-15T11:15:00.000Z"
}
```

---

### Example 3: EXPERIAN Report Failure - Multiple Criteria Failed

**Scenario:**
- Previous Status: "Ineligible"
- Report Type: "EXPERIAN"
- Failure Reasons: 
  - "Rejected: 0-12 months duration has 30+ DPDs count of 8 (> 6)"
  - "Rejected: Combined 0-3 months and 0-6 months duration has DPDs total of 2 (>= 1)"
- Lead Name: "Bob Johnson"
- User ID: 3
- Lead ID: 2105

**Activity Log Entry:**
```json
{
  "id": 12347,
  "activity_type": "LEAD_STATUS_UPDATE",
  "activity_desc": "Lead status updated from Ineligible to Not met criteria - EXPERIAN - Rejected: 0-12 months duration has 30+ DPDs count of 8 (> 6); Rejected: Combined 0-3 months and 0-6 months duration has DPDs total of 2 (>= 1)",
  "note": "Auto-rejected (EXPERIAN): Rejected: 0-12 months duration has 30+ DPDs count of 8 (> 6); Rejected: Combined 0-3 months and 0-6 months duration has DPDs total of 2 (>= 1)",
  "created_by": 3,
  "lead_id": 2105,
  "lead_name": "Bob Johnson",
  "status": "active",
  "createdAt": "2025-01-15T12:00:00.000Z",
  "updatedAt": "2025-01-15T12:00:00.000Z"
}
```

---

### Example 4: CIBIL Report Failure - All Criteria Failed

**Scenario:**
- Previous Status: "Not Contacted"
- Report Type: "CIBIL"
- Failure Reasons:
  - "Rejected: Age is 47 years (must be between 21 and 55 years)"
  - "Rejected: 90+ DPDs count is 30 (>= 10)"
  - "Rejected: 0-12 months duration has 30+ DPDs count of 14 (> 6)"
  - "Rejected: Combined 0-3 months and 0-6 months duration has DPDs total of 13 (>= 1)"
- Lead Name: "Alice Williams"
- User ID: 3
- Lead ID: 2106

**Activity Log Entry:**
```json
{
  "id": 12348,
  "activity_type": "LEAD_STATUS_UPDATE",
  "activity_desc": "Lead status updated from Not Contacted to Not met criteria - CIBIL - Rejected: Age is 47 years (must be between 21 and 55 years); Rejected: 90+ DPDs count is 30 (>= 10); Rejected: 0-12 months duration has 30+ DPDs count of 14 (> 6); Rejected: Combined 0-3 months and 0-6 months duration has DPDs total of 13 (>= 1)",
  "note": "Auto-rejected (CIBIL): Rejected: Age is 47 years (must be between 21 and 55 years); Rejected: 90+ DPDs count is 30 (>= 10); Rejected: 0-12 months duration has 30+ DPDs count of 14 (> 6); Rejected: Combined 0-3 months and 0-6 months duration has DPDs total of 13 (>= 1)",
  "created_by": 3,
  "lead_id": 2106,
  "lead_name": "Alice Williams",
  "status": "active",
  "createdAt": "2025-01-15T13:30:00.000Z",
  "updatedAt": "2025-01-15T13:30:00.000Z"
}
```

---

## Key Points

1. **Activity Description Format:**
   ```
   Lead status updated from {previousStatus} to Not met criteria - {reportType} - {failureReason}
   ```

2. **Note Field Format:**
   ```
   Auto-rejected ({reportType}): {failureReason}
   ```

3. **Multiple Failure Reasons:**
   - When multiple criteria fail, all reasons are joined with `; ` (semicolon and space)
   - Example: `"Rejected: Reason 1; Rejected: Reason 2; Rejected: Reason 3"`

4. **Previous Status:**
   - The `previousStatus` is extracted from the most recent activity log entry
   - If no previous activity log exists, it defaults to "Not Contacted"

5. **When Activity Log is Created:**
   - Only when ALL credit reports fail (no approved credit reports exist)
   - AND SCORE_CARD has passed (if SCORE_CARD failed, it's handled separately)
   - If other approved credit reports exist, no activity log is created (status unchanged)

---

## Database Query Examples

### Get all activity logs for a lead:
```sql
SELECT * FROM ActivityLogs 
WHERE lead_id = 2103 
AND activity_type = 'LEAD_STATUS_UPDATE'
ORDER BY createdAt DESC;
```

### Get credit report rejection activity logs:
```sql
SELECT * FROM ActivityLogs 
WHERE lead_id = 2103 
AND activity_type = 'LEAD_STATUS_UPDATE'
AND activity_desc LIKE '%CIBIL%'
ORDER BY createdAt DESC;
```

### Get all "Not met criteria" activity logs:
```sql
SELECT * FROM ActivityLogs 
WHERE activity_type = 'LEAD_STATUS_UPDATE'
AND activity_desc LIKE '%Not met criteria%'
ORDER BY createdAt DESC;
```

---

## Comparison: SCORE_CARD vs Credit Report Activity Logs

### SCORE_CARD Failure:
```json
{
  "activity_desc": "Lead status updated from Not Contacted to Not met criteria - Salary (20000) is below minimum requirement of 50,000 for CAT C",
  "note": "Auto-rejected: Salary (20000) is below minimum requirement of 50,000 for CAT C"
}
```

### Credit Report Failure (CIBIL):
```json
{
  "activity_desc": "Lead status updated from Not Contacted to Not met criteria - CIBIL - Rejected: 90+ DPDs count is 12 (>= 10)",
  "note": "Auto-rejected (CIBIL): Rejected: 90+ DPDs count is 12 (>= 10)"
}
```

**Key Difference:**
- SCORE_CARD: `sub_status` contains the failure reason directly
- Credit Reports: `sub_status` contains `"{reportType} - {failureReason}"`

---

## Notes

- Activity logs are created within a database transaction
- If the transaction fails, the activity log is rolled back
- The `note` field contains the same information as `activity_desc` but in a slightly different format
- All timestamps are in UTC format

