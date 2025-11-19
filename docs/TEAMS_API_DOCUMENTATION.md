# Teams Module API Documentation

This document provides comprehensive API documentation for the Teams module based on the current implementation.

## Base URL
```
/api/teams
```

## Authentication
All endpoints require authentication. Include the authentication token in the request headers:
```
Authorization: Bearer <your_token>
```

---

## Overview

The Teams module allows creation and management of teams with team owners and members. Teams are used to organize users in a hierarchical structure.

### Current Implementation Status
⚠️ **Note:** The Teams module is currently in development. Only the team creation endpoint is fully implemented.

---

## 1. Create Team

Creates a new team with a team owner and members.

### Endpoint
```
POST /api/teams/add-team
```

### Request Body
```json
{
  "teamName": "Sales Team Alpha",
  "teamOwnerId": 5,
  "createdBy": 1,
  "teamMemberIds": [10, 11, 12]
}
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `teamName` | string | Yes | Name of the team |
| `teamOwnerId` | integer | Yes | User ID of the team owner |
| `createdBy` | integer | Yes | User ID of the person creating the team |
| `teamMemberIds` | array of integers | Yes | Array of user IDs to be added as team members (must have at least one member) |

### Request Example
```http
POST /api/teams/add-team
Authorization: Bearer <token>
Content-Type: application/json

{
  "teamName": "Sales Team Alpha",
  "teamOwnerId": 5,
  "createdBy": 1,
  "teamMemberIds": [10, 11, 12]
}
```

### Success Response (201 Created)
```json
{
  "status": "SUCCESS",
  "statusCode": 201,
  "message": "Team created successfully !",
  "data": {
    "team": {
      "id": 1,
      "name": "Sales Team Alpha",
      "team_owner_id": 5,
      "created_by": 1,
      "status": "active",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "teamMembers": [
      {
        "id": 1,
        "team_id": 1,
        "user_id": 10,
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      },
      {
        "id": 2,
        "team_id": 1,
        "user_id": 11,
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      },
      {
        "id": 3,
        "team_id": 1,
        "user_id": 12,
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "membersCount": 3
  }
}
```

### Error Responses

#### 400 Bad Request - Missing Required Fields
```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "Missing required fields !"
}
```

#### 400 Bad Request - Invalid Team Member IDs Format
```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "Team member ids must be in an array !"
}
```

#### 400 Bad Request - No Team Members
```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "At least one team member is needed to create team !"
}
```

#### 400 Bad Request - Invalid User IDs
```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "Invalid user IDs: 999, 1000"
}
```

#### 404 Not Found - Users Not Found
```json
{
  "status": "ERROR",
  "statusCode": 404,
  "message": "One or more users not found: 999, 1000"
}
```

#### 500 Internal Server Error
```json
{
  "status": "ERROR",
  "statusCode": 500,
  "message": "Failed to create team !",
  "error": {
    "code": "UNKNOWN_ERROR",
    "message": "Database connection error",
    "details": null
  }
}
```

---

## Data Models

### Team Object
```typescript
interface Team {
  id: number;
  name: string;
  team_owner_id: number;
  created_by: number;
  status: "active" | "inactive";
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
}
```

### Team Member Object
```typescript
interface TeamMember {
  id: number;
  team_id: number;
  user_id: number;
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
}
```

### Create Team Response Data
```typescript
interface CreateTeamResponse {
  team: Team;
  teamMembers: TeamMember[];
  membersCount: number;
}
```

---

## Validation Rules

### Team Creation Rules

1. **Required Fields:**
   - `teamName` (string, required) - Team name
   - `teamOwnerId` (integer, required) - ID of the team owner
   - `createdBy` (integer, required) - ID of the user creating the team
   - `teamMemberIds` (array of integers, required, min 1) - Array of team member user IDs

2. **Business Rules:**
   - `teamMemberIds` must be an array
   - `teamMemberIds` must contain at least one member
   - All user IDs (teamOwnerId, createdBy, and all teamMemberIds) must exist in the system
   - All user IDs must be valid positive integers
   - The system uses database transactions to ensure data consistency

3. **Database Constraints:**
   - Team creation is wrapped in a transaction
   - If any validation fails, the entire transaction is rolled back
   - Team members are created in bulk after team creation

---

## Frontend Integration Examples

### JavaScript/TypeScript (Fetch API)
```javascript
// Create team
async function createTeam(teamData) {
  try {
    const response = await fetch('/api/teams/add-team', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        teamName: teamData.name,
        teamOwnerId: teamData.ownerId,
        createdBy: teamData.createdBy,
        teamMemberIds: teamData.memberIds
      })
    });
    
    const data = await response.json();
    
    if (data.status === 'SUCCESS') {
      console.log('Team created:', data.data);
      return data.data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Error creating team:', error);
    throw error;
  }
}

// Usage example
const newTeam = await createTeam({
  name: 'Sales Team Alpha',
  ownerId: 5,
  createdBy: 1,
  memberIds: [10, 11, 12]
});
```

### Axios Example
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api/teams',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Create team
const createTeam = async (teamData) => {
  try {
    const response = await api.post('/add-team', {
      teamName: teamData.name,
      teamOwnerId: teamData.ownerId,
      createdBy: teamData.createdBy,
      teamMemberIds: teamData.memberIds
    });
    
    if (response.data.status === 'SUCCESS') {
      return response.data.data;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    if (error.response) {
      // Server responded with error
      console.error('Error response:', error.response.data);
      throw new Error(error.response.data.message);
    } else {
      // Request failed
      console.error('Request error:', error.message);
      throw error;
    }
  }
};

// Usage
try {
  const team = await createTeam({
    name: 'Marketing Team',
    ownerId: 7,
    createdBy: 1,
    memberIds: [13, 14, 15]
  });
  console.log('Team created successfully:', team);
} catch (error) {
  console.error('Failed to create team:', error.message);
}
```

### React Hook Example
```javascript
import { useState } from 'react';
import axios from 'axios';

function useCreateTeam() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createTeam = async (teamData) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.post('/api/teams/add-team', {
        teamName: teamData.name,
        teamOwnerId: teamData.ownerId,
        createdBy: teamData.createdBy,
        teamMemberIds: teamData.memberIds
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.status === 'SUCCESS') {
        return response.data.data;
      } else {
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

  return { createTeam, loading, error };
}

// Usage in component
function CreateTeamForm() {
  const { createTeam, loading, error } = useCreateTeam();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await createTeam({
        name: 'New Team',
        ownerId: 5,
        createdBy: 1,
        memberIds: [10, 11]
      });
      console.log('Team created:', result);
    } catch (err) {
      console.error('Error:', err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Team'}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
```

---

## Status Codes

| Code | Description |
|------|-------------|
| 201 | Created - Team created successfully |
| 400 | Bad Request - Invalid input data or validation failed |
| 404 | Not Found - One or more users not found |
| 500 | Internal Server Error - Server error |

---

## Response Format

All responses follow a consistent format:

### Success Response Structure
```json
{
  "status": "SUCCESS",
  "statusCode": 200|201,
  "message": "Success message",
  "data": { /* response data */ }
}
```

### Error Response Structure
```json
{
  "status": "ERROR",
  "statusCode": 400|404|500,
  "message": "Error message",
  "error": {
    "code": "ERROR_CODE",
    "message": "Detailed error message",
    "details": null
  }
}
```

---

## Notes

1. **Transaction Safety:**
   - Team creation uses database transactions
   - If any part of the creation fails, all changes are rolled back
   - This ensures data consistency

2. **User Validation:**
   - All user IDs are validated before team creation
   - The system checks that all users exist and are active
   - Invalid user IDs will result in a 404 error

3. **Team Status:**
   - New teams are created with `status: "active"` by default
   - Status can be "active" or "inactive"

4. **Future Endpoints:**
   - Get all teams (planned)
   - Update team (planned)
   - Delete team (planned)
   - Get team by ID (planned)
   - Get teams by owner (planned)

---

## Implementation Details

### Controller
- **File:** `controllers/TeamController.js`
- **Function:** `createTeam(req, res)`

### Service
- **File:** `services/TeamServices.js`
- **Functions:**
  - `createTeam(teamData, transaction)`
  - `addTeamMembers(teamId, teamMemberIds, transaction)`

### Models
- **Team Model:** `models/Team.js`
- **TeamMember Model:** `models/TeamMember.js`

### Routes
- **File:** `routes/teamRoutes.js`
- **Endpoint:** `POST /api/teams/add-team`

---

## Support

For issues or questions regarding the Teams API, please contact the development team.

**Last Updated:** January 2024

