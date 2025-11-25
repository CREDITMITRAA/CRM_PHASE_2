# Rule Engine API Documentation

This document provides comprehensive API documentation for the Rule Engine module based on the current implementation.

## Base URL
```
/api/rule-engine
```

## Authentication
All endpoints require authentication. Include the authentication token in the request headers:
```
Authorization: Bearer <your_token>
```

**Allowed Roles:**
- `ADMIN`
- `OPERATIONS_TEAM`
- `MANAGER`
- `EMPLOYEE`

---

## Overview

The Rule Engine module evaluates leads against score card criteria to determine if they meet the minimum requirements for processing. The engine checks mandatory fields and validates salary requirements based on company category.

### Score Card Criteria

The rule engine evaluates leads based on the following criteria:

1. **Mandatory Fields Check:**
   - `company` - Company name
   - `city` - City name
   - `salary` - Salary amount
   - `company_category` - Company category (Super CAT, CAT A, CAT B, CAT C, CAT D)
   - `income_type` - Type of income
   - `pan` - PAN number

2. **Salary Requirements by Company Category:**
   - **Super CAT, CAT A, CAT B:** Salary must be above ₹25,000
   - **CAT C:** Salary must be above ₹50,000
   - **CAT D:** Salary must be above ₹75,000

---

## 1. Run Rule Engine

Evaluates a lead against the score card criteria and updates the lead status accordingly.

### Endpoint
```
POST /api/rule-engine/run
```

### Request Body
```json
{
  "leadId": 123,
  "userId": 5
}
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `leadId` | integer | Yes | ID of the lead to evaluate |
| `userId` | integer | Yes | ID of the user running the rule engine |

### Request Example
```http
POST /api/rule-engine/run
Authorization: Bearer <token>
Content-Type: application/json

{
  "leadId": 123,
  "userId": 5
}
```

### Success Response (200 OK) - Criteria Met

When the lead meets all score card criteria:

```json
{
  "status": "SUCCESS",
  "statusCode": 200,
  "message": "Meets score card criteria",
  "data": {
    "lead": {
      "id": 123,
      "name": "John Doe",
      "phone": "9876543210",
      "email": "john.doe@example.com",
      "company": "ABC Corporation",
      "city": "Mumbai",
      "salary": 35000,
      "company_category": "CAT A",
      "income_type": "Salaried",
      "pan": "ABCDE1234F",
      "lead_status": "Active",
      "sub_status": null,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "meetsCriteria": true
  }
}
```

### Error Response (400 Bad Request) - Criteria Not Met

When the lead does not meet the score card criteria:

```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "Auto-rejected: Salary (20000) is below minimum requirement of 25,000 for CAT A",
  "data": {
    "lead": {
      "id": 123,
      "name": "John Doe",
      "phone": "9876543210",
      "email": "john.doe@example.com",
      "company": "ABC Corporation",
      "city": "Mumbai",
      "salary": 20000,
      "company_category": "CAT A",
      "income_type": "Salaried",
      "pan": "ABCDE1234F",
      "lead_status": "Not met criteria",
      "last_updated_status": "Not met criteria",
      "sub_status": "Salary (20000) is below minimum requirement of 25,000 for CAT A",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    },
    "failureReason": "Salary (20000) is below minimum requirement of 25,000 for CAT A",
    "meetsCriteria": false
  }
}
```

**Note:** When criteria are not met, the lead status is automatically updated to "Not met criteria" and a corresponding activity log is created.

### Error Responses

#### 400 Bad Request - Missing Required Fields
```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "Missing required fields !"
}
```

#### 400 Bad Request - Lead Not Found
```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "Lead not found !"
}
```

#### 400 Bad Request - Missing Mandatory Fields
```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "Missing mandatory fields - company, salary, pan",
  "data": {
    "lead": {
      "id": 123,
      "name": "John Doe",
      "phone": "9876543210",
      "company": null,
      "salary": null,
      "pan": null
    },
    "missingFields": ["company", "salary", "pan"]
  }
}
```

#### 500 Internal Server Error
```json
{
  "status": "ERROR",
  "statusCode": 500,
  "message": "Failed to run rule engine !",
  "error": {
    "code": "UNKNOWN_ERROR",
    "message": "Database connection error",
    "details": null
  }
}
```

---

## Data Models

### Lead Object (Partial)
```typescript
interface Lead {
  id: number;
  name: string;
  phone: string;
  email?: string;
  company: string;
  city: string;
  salary: number;
  company_category: "Super CAT" | "CAT A" | "CAT B" | "CAT C" | "CAT D";
  income_type: string;
  pan: string;
  lead_status: string;
  last_updated_status?: string;
  sub_status?: string;
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
}
```

### Run Rule Engine Request
```typescript
interface RunRuleEngineRequest {
  leadId: number;
  userId: number;
}
```

### Run Rule Engine Success Response
```typescript
interface RunRuleEngineSuccessResponse {
  lead: Lead;
  meetsCriteria: true;
}
```

### Run Rule Engine Failure Response
```typescript
interface RunRuleEngineFailureResponse {
  lead: Lead;
  failureReason: string;
  meetsCriteria: false;
}
```

### Missing Mandatory Fields Response
```typescript
interface MissingMandatoryFieldsResponse {
  lead: Lead;
  missingFields: string[];
}
```

---

## Validation Rules

### Request Validation

1. **Required Fields:**
   - `leadId` (integer, required) - Must be a valid lead ID
   - `userId` (integer, required) - Must be a valid user ID

2. **Lead Validation:**
   - Lead must exist in the system
   - Lead must have all mandatory fields populated

### Mandatory Fields for Rule Engine

The following fields must be present and non-empty for the rule engine to run:

- `company` - Company name
- `city` - City name
- `salary` - Salary amount (must be a valid number)
- `company_category` - Must be one of: "Super CAT", "CAT A", "CAT B", "CAT C", "CAT D"
- `income_type` - Type of income
- `pan` - PAN number

### Score Card Criteria

The rule engine evaluates leads based on company category and salary:

| Company Category | Minimum Salary Requirement |
|-----------------|---------------------------|
| Super CAT | > ₹25,000 |
| CAT A | > ₹25,000 |
| CAT B | > ₹25,000 |
| CAT C | > ₹50,000 |
| CAT D | > ₹75,000 |

**Note:** If the company category doesn't match any known categories, the lead will fail the score card criteria.

---

## Frontend Integration Examples

### JavaScript/TypeScript (Fetch API)
```javascript
// Run rule engine for a lead
async function runRuleEngine(leadId, userId) {
  try {
    const response = await fetch('/api/rule-engine/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        leadId: leadId,
        userId: userId
      })
    });
    
    const data = await response.json();
    
    if (data.status === 'SUCCESS') {
      if (data.data.meetsCriteria) {
        console.log('Lead meets criteria:', data.data.lead);
        return { success: true, meetsCriteria: true, lead: data.data.lead };
      } else {
        console.log('Lead does not meet criteria:', data.data.failureReason);
        return { 
          success: true, 
          meetsCriteria: false, 
          lead: data.data.lead,
          failureReason: data.data.failureReason
        };
      }
    } else {
      // Handle missing mandatory fields
      if (data.data && data.data.missingFields) {
        throw new Error(`Missing fields: ${data.data.missingFields.join(', ')}`);
      }
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Error running rule engine:', error);
    throw error;
  }
}

// Usage example
try {
  const result = await runRuleEngine(123, 5);
  if (result.meetsCriteria) {
    console.log('Lead approved!');
  } else {
    console.log('Lead rejected:', result.failureReason);
  }
} catch (error) {
  console.error('Failed to run rule engine:', error.message);
}
```

### Axios Example
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api/rule-engine',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Run rule engine
const runRuleEngine = async (leadId, userId) => {
  try {
    const response = await api.post('/run', {
      leadId: leadId,
      userId: userId
    });
    
    if (response.data.status === 'SUCCESS') {
      return {
        meetsCriteria: response.data.data.meetsCriteria,
        lead: response.data.data.lead,
        failureReason: response.data.data.failureReason || null
      };
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    if (error.response) {
      // Server responded with error
      const errorData = error.response.data;
      
      // Check for missing mandatory fields
      if (errorData.data && errorData.data.missingFields) {
        throw new Error(
          `Missing mandatory fields: ${errorData.data.missingFields.join(', ')}`
        );
      }
      
      throw new Error(errorData.message);
    } else {
      // Request failed
      console.error('Request error:', error.message);
      throw error;
    }
  }
};

// Usage
try {
  const result = await runRuleEngine(123, 5);
  
  if (result.meetsCriteria) {
    console.log('✅ Lead meets criteria');
    // Update UI to show success
  } else {
    console.log('❌ Lead rejected:', result.failureReason);
    // Update UI to show rejection reason
  }
} catch (error) {
  console.error('Failed to run rule engine:', error.message);
  // Show error message to user
}
```

### React Hook Example
```javascript
import { useState } from 'react';
import axios from 'axios';

function useRuleEngine() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const runRuleEngine = async (leadId, userId) => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await axios.post('/api/rule-engine/run', {
        leadId: leadId,
        userId: userId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.status === 'SUCCESS') {
        const engineResult = {
          meetsCriteria: response.data.data.meetsCriteria,
          lead: response.data.data.lead,
          failureReason: response.data.data.failureReason || null
        };
        setResult(engineResult);
        return engineResult;
      } else {
        // Handle missing mandatory fields
        if (response.data.data && response.data.data.missingFields) {
          const errorMsg = `Missing mandatory fields: ${response.data.data.missingFields.join(', ')}`;
          setError(errorMsg);
          throw new Error(errorMsg);
        }
        throw new Error(response.data.message);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return { runRuleEngine, loading, error, result };
}

// Usage in component
function LeadEvaluationForm({ leadId, userId }) {
  const { runRuleEngine, loading, error, result } = useRuleEngine();

  const handleEvaluate = async () => {
    try {
      const evaluation = await runRuleEngine(leadId, userId);
      
      if (evaluation.meetsCriteria) {
        // Show success message
        alert('Lead meets all criteria!');
      } else {
        // Show rejection reason
        alert(`Lead rejected: ${evaluation.failureReason}`);
      }
    } catch (err) {
      // Error is already set in the hook
      console.error('Evaluation failed:', err.message);
    }
  };

  return (
    <div>
      <button 
        onClick={handleEvaluate} 
        disabled={loading}
      >
        {loading ? 'Evaluating...' : 'Run Rule Engine'}
      </button>
      
      {error && (
        <div className="error">
          {error}
        </div>
      )}
      
      {result && (
        <div className={result.meetsCriteria ? 'success' : 'warning'}>
          {result.meetsCriteria 
            ? '✅ Lead meets criteria' 
            : `❌ ${result.failureReason}`
          }
        </div>
      )}
    </div>
  );
}
```

### React Component with Full Error Handling
```javascript
import { useState } from 'react';
import axios from 'axios';

function RuleEngineEvaluator({ leadId, userId, onEvaluationComplete }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [evaluationResult, setEvaluationResult] = useState(null);

  const evaluateLead = async () => {
    setLoading(true);
    setError(null);
    setMissingFields([]);
    setEvaluationResult(null);

    try {
      const response = await axios.post('/api/rule-engine/run', {
        leadId,
        userId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const { status, data, message } = response.data;

      if (status === 'SUCCESS') {
        const result = {
          meetsCriteria: data.meetsCriteria,
          lead: data.lead,
          failureReason: data.failureReason || null
        };
        setEvaluationResult(result);
        onEvaluationComplete?.(result);
      } else if (status === 'ERROR') {
        // Check for missing mandatory fields
        if (data && data.missingFields) {
          setMissingFields(data.missingFields);
          setError(`Please fill in the following fields: ${data.missingFields.join(', ')}`);
        } else {
          setError(message);
        }
      }
    } catch (err) {
      const errorData = err.response?.data;
      
      if (errorData) {
        if (errorData.data && errorData.data.missingFields) {
          setMissingFields(errorData.data.missingFields);
          setError(`Missing mandatory fields: ${errorData.data.missingFields.join(', ')}`);
        } else {
          setError(errorData.message || 'Failed to evaluate lead');
        }
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rule-engine-evaluator">
      <button 
        onClick={evaluateLead} 
        disabled={loading || !leadId || !userId}
        className="evaluate-button"
      >
        {loading ? 'Evaluating...' : 'Evaluate Lead'}
      </button>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
          {missingFields.length > 0 && (
            <ul className="missing-fields-list">
              {missingFields.map((field, index) => (
                <li key={index}>{field}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {evaluationResult && (
        <div className={`evaluation-result ${evaluationResult.meetsCriteria ? 'success' : 'failure'}`}>
          {evaluationResult.meetsCriteria ? (
            <div>
              <h3>✅ Lead Approved</h3>
              <p>Lead meets all score card criteria.</p>
              <p><strong>Status:</strong> {evaluationResult.lead.lead_status}</p>
            </div>
          ) : (
            <div>
              <h3>❌ Lead Rejected</h3>
              <p><strong>Reason:</strong> {evaluationResult.failureReason}</p>
              <p><strong>Status:</strong> {evaluationResult.lead.lead_status}</p>
              <p><strong>Sub Status:</strong> {evaluationResult.lead.sub_status}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RuleEngineEvaluator;
```

---

## Status Codes

| Code | Description |
|------|-------------|
| 200 | OK - Rule engine executed successfully (criteria met or not met) |
| 400 | Bad Request - Invalid input data, missing fields, or criteria not met |
| 500 | Internal Server Error - Server error |

---

## Response Format

All responses follow a consistent format:

### Success Response Structure
```json
{
  "status": "SUCCESS",
  "statusCode": 200,
  "message": "Meets score card criteria",
  "data": {
    "lead": { /* lead object */ },
    "meetsCriteria": true
  }
}
```

### Error Response Structure (Criteria Not Met)
```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "Auto-rejected: [failure reason]",
  "data": {
    "lead": { /* lead object */ },
    "failureReason": "[detailed reason]",
    "meetsCriteria": false
  }
}
```

### Error Response Structure (Missing Fields)
```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "Missing mandatory fields - [field1], [field2]",
  "data": {
    "lead": { /* lead object */ },
    "missingFields": ["field1", "field2"]
  }
}
```

### Error Response Structure (Server Error)
```json
{
  "status": "ERROR",
  "statusCode": 500,
  "message": "Failed to run rule engine !",
  "error": {
    "code": "UNKNOWN_ERROR",
    "message": "Detailed error message",
    "details": null
  }
}
```

---

## Business Logic Flow

1. **Request Validation:**
   - Validate that `leadId` and `userId` are provided
   - If missing, return 400 error

2. **Lead Retrieval:**
   - Fetch lead by `leadId`
   - If lead not found, return 400 error

3. **Mandatory Fields Check:**
   - Check for required fields: `company`, `city`, `salary`, `company_category`, `income_type`, `pan`
   - If any field is missing, return 400 error with list of missing fields

4. **Score Card Evaluation:**
   - Evaluate salary against company category requirements
   - If criteria not met:
     - Update lead status to "Not met criteria"
     - Set `sub_status` to failure reason
     - Create activity log
     - Return 400 error with failure details
   - If criteria met:
     - Return 200 success with lead data

5. **Transaction Management:**
   - All operations are wrapped in a database transaction
   - If any error occurs, transaction is rolled back
   - On success, transaction is committed

---

## Notes

1. **Transaction Safety:**
   - All operations use database transactions
   - If any part of the evaluation fails, all changes are rolled back
   - This ensures data consistency

2. **Automatic Status Update:**
   - When a lead fails the score card criteria, the lead status is automatically updated to "Not met criteria"
   - A corresponding activity log is created to track the status change
   - The previous status is preserved in the activity log

3. **Mandatory Fields:**
   - The rule engine cannot run if any mandatory field is missing
   - Missing fields are returned in the error response for easy frontend validation

4. **Company Category:**
   - Valid categories: "Super CAT", "CAT A", "CAT B", "CAT C", "CAT D"
   - Unknown categories will cause the lead to fail the score card criteria

5. **Salary Validation:**
   - Salary must be a valid number
   - Salary comparison is strict (must be greater than, not equal to)

---

## Implementation Details

### Controller
- **File:** `controllers/RuleEngineController.js`
- **Function:** `runRuleEngine(req, res)`

### Service
- **File:** `services/RuleEngineServices.js`
- **Functions:**
  - `getMissingMandatoryFields(lead)` - Returns array of missing mandatory fields
  - `runFirstLevelScoreCardCriteria(lead)` - Returns boolean indicating if lead meets criteria
  - `getScoreCardFailureReason(lead)` - Returns detailed failure reason

### Routes
- **File:** `routes/RuleEngineRoutes.js`
- **Endpoint:** `POST /api/rule-engine/run`
- **Authentication:** Required (ADMIN, OPERATIONS_TEAM, MANAGER, EMPLOYEE)

### Dependencies
- **LeadServices:** `services/leadServices.js` - For fetching lead data
- **ActivityLogServices:** `services/ActivityLogServices.js` - For creating activity logs

---

## Support

For issues or questions regarding the Rule Engine API, please contact the development team.

**Last Updated:** January 2024

