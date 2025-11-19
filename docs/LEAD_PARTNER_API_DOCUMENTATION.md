# Lead Partner API Integration Documentation

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Request/Response Examples](#requestresponse-examples)
5. [Integration Guide](#integration-guide)
6. [Error Handling](#error-handling)
7. [Security Best Practices](#security-best-practices)

---

## Overview

The Lead Partner API allows external vendors and clients to securely submit leads to the CRM system. The API uses HMAC-SHA256 signature-based authentication to ensure secure communication.

### ⚠️ Quick Start - Security First

**Before you begin integration, understand this critical requirement:**

The API uses **HMAC-SHA256 signature authentication**. You must:
1. Generate a signature for each request using your `api_key`, `api_secret`, request body hash, and timestamp
2. Include required headers in every request
3. Ensure your IP address is whitelisted
4. Use HTTPS for all API calls

---

## Authentication

### Authentication Method

The Lead Partner API uses **HMAC-SHA256 signature-based authentication**. Each request must include specific headers and a valid signature.

### Required Headers

All authenticated requests must include:

| Header | Description | Example |
|--------|-------------|---------|
| `x-api-key` | Your API key provided during registration | `abc123def456...` |
| `x-api-secret` | Your API secret (used for signature generation, NOT sent in headers) | Used server-side only |
| `x-signature` | HMAC-SHA256 signature of the request | `a1b2c3d4e5f6...` |
| `x-timestamp` | Unix timestamp (seconds since epoch) | `1704067200` |
| `x-partner-code` | Your unique partner code | `LA_001` or `CON_001` |

### Signature Generation

The signature is generated using the following formula:

```
1. Create SHA256 hash of the request body (JSON stringified)
   bodyHash = SHA256(JSON.stringify(requestBody))

2. Create payload string
   payload = api_key + bodyHash + timestamp

3. Generate HMAC-SHA256 signature
   signature = HMAC-SHA256(api_secret, payload)
```

### Signature Generation Example

```javascript
const crypto = require('crypto');

function generateSignature(apiKey, apiSecret, requestBody, timestamp) {
  // Step 1: Hash the request body
  const bodyHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(requestBody))
    .digest('hex');
  
  // Step 2: Create payload
  const payload = apiKey + bodyHash + timestamp;
  
  // Step 3: Generate signature
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(payload)
    .digest('hex');
  
  return signature;
}

// Usage
const apiKey = 'your_api_key';
const apiSecret = 'your_api_secret';
const requestBody = { leads: [...] };
const timestamp = Math.floor(Date.now() / 1000);

const signature = generateSignature(apiKey, apiSecret, requestBody, timestamp);
```

### Security Requirements

1. **IP Whitelisting**: Your server's IP address must be whitelisted
2. **Timestamp Validation**: Timestamps must be within 3 minutes of the server time
3. **HTTPS Only**: All API calls must use HTTPS
4. **Domain Validation**: Origin domain must be in allowed domains list (if applicable)

---

## API Endpoints

### Base URL
```
/api/lead-partner
```

### 1. Upload Leads

Submit one or multiple leads to the CRM system.

**Endpoint:** `POST /api/lead-partner/upload-leads-from-lead-partner`

**Authentication:** Required (HMAC-SHA256)

**Request Headers:**
```http
x-api-key: your_api_key
x-signature: generated_signature
x-timestamp: 1704067200
x-partner-code: your_partner_code
Content-Type: application/json
```

**Request Body:**

**Single Lead:**
```json
{
  "leads": {
    "name": "John Doe",
    "phone": "9876543210",
    "email": "john.doe@example.com",
    "score": 750,
    "salary": 50000,
    "bereau_score": 720,
    "campaign": "summer_2024"
  }
}
```

**Multiple Leads (Bulk):**
```json
{
  "leads": [
    {
      "name": "John Doe",
      "phone": "9876543210",
      "email": "john.doe@example.com",
      "score": 750,
      "salary": 50000,
      "bereau_score": 720,
      "campaign": "summer_2024"
    },
    {
      "name": "Jane Smith",
      "phone": "9876543211",
      "email": "jane.smith@example.com",
      "score": 800,
      "salary": 75000,
      "bereau_score": 780,
      "campaign": "summer_2024"
    }
  ]
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Lead's full name |
| `phone` | string | Yes | 10-digit Indian mobile number |
| `email` | string | No | Lead's email address |
| `score` | number | No | Credit score |
| `salary` | number | No | Monthly salary |
| `bereau_score` | number | No | Bureau credit score |
| `campaign` | string | No | UTM campaign identifier |

**Phone Number Formats Accepted:**
- `9876543210` (10 digits)
- `+919876543210` (with country code)
- `919876543210` (with country code, no +)
- `09876543210` (with leading 0)
- `00919876543210` (with 0091 prefix)

**Success Response (201 Created):**

**All Leads Processed:**
```json
{
  "status": "SUCCESS",
  "statusCode": 201,
  "message": "Successfully processed all 2 lead(s)",
  "data": {
    "summary": {
      "totalReceived": 2,
      "successfullyProcessed": 2,
      "failed": 0
    },
    "processedLeads": [
      {
        "name": "John Doe",
        "phone": "9876543210",
        "email": "john.doe@example.com",
        "bureauScore": 720,
        "campaign": "summer_2024",
        "status": "processed"
      },
      {
        "name": "Jane Smith",
        "phone": "9876543211",
        "email": "jane.smith@example.com",
        "bureauScore": 780,
        "campaign": "summer_2024",
        "status": "processed"
      }
    ]
  }
}
```

**Partial Success:**
```json
{
  "status": "SUCCESS",
  "statusCode": 201,
  "message": "Successfully processed 1 out of 2 lead(s). 1 lead(s) could not be processed.",
  "data": {
    "summary": {
      "totalReceived": 2,
      "successfullyProcessed": 1,
      "failed": 1
    },
    "processedLeads": [
      {
        "name": "John Doe",
        "phone": "9876543210",
        "email": "john.doe@example.com",
        "status": "processed"
      }
    ],
    "failedLeads": [
      {
        "phone": "9876543211",
        "reason": "This phone number already exists in our system"
      }
    ]
  }
}
```

**All Leads Failed:**
```json
{
  "status": "SUCCESS",
  "statusCode": 200,
  "message": "None of the 2 lead(s) could be processed. Please review the validation errors.",
  "data": {
    "summary": {
      "totalReceived": 2,
      "successfullyProcessed": 0,
      "failed": 2
    },
    "failedLeads": [
      {
        "phone": "1234567890",
        "reason": "Invalid phone number. Indian mobile numbers must start with 6, 7, 8, or 9."
      },
      {
        "phone": "9876543211",
        "reason": "This phone number already exists in our system"
      }
    ]
  }
}
```

**Error Responses:**

**400 Bad Request - Missing Leads:**
```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "No leads provided. Please include at least one lead in your request."
}
```

**400 Bad Request - Missing Headers:**
```json
{
  "status": "ERROR",
  "statusCode": 400,
  "message": "Missing required headers"
}
```

**401 Unauthorized - Invalid Signature:**
```json
{
  "status": "ERROR",
  "statusCode": 401,
  "message": "Invalid signature"
}
```

**401 Unauthorized - Invalid API Key:**
```json
{
  "status": "ERROR",
  "statusCode": 401,
  "message": "Invalid API key"
}
```

**401 Unauthorized - Invalid Partner Code:**
```json
{
  "status": "ERROR",
  "statusCode": 401,
  "message": "Invalid partner code"
}
```

**401 Unauthorized - Expired Timestamp:**
```json
{
  "status": "ERROR",
  "statusCode": 401,
  "message": "Expired timestamp"
}
```

**403 Forbidden - IP Not Allowed:**
```json
{
  "status": "ERROR",
  "statusCode": 403,
  "message": "IP not allowed"
}
```

**403 Forbidden - Unauthorized Domain:**
```json
{
  "status": "ERROR",
  "statusCode": 403,
  "message": "Unauthorized domain origin"
}
```

**500 Internal Server Error:**
```json
{
  "status": "ERROR",
  "statusCode": 500,
  "message": "An unexpected error occurred while processing your request. Please try again later or contact support if the issue persists."
}
```

---

### 2. Generate Headers (Helper Endpoint)

Generate authentication headers for testing purposes. **Admin only.**

**Endpoint:** `POST /api/lead-partner/generate-headers`

**Authentication:** Required (Admin role)

**Request Body:**
```json
{
  "api_key": "your_api_key",
  "api_secret": "your_api_secret",
  "leads": {
    "name": "Test Lead",
    "phone": "9876543210",
    "email": "test@example.com"
  }
}
```

**Success Response (200 OK):**
```json
{
  "status": "SUCCESS",
  "statusCode": 200,
  "message": "Headers generated successfully",
  "data": {
    "x-api-key": "your_api_key",
    "x-timestamp": 1704067200,
    "x-signature": "generated_signature_here"
  }
}
```

---

## Integration Guide

### Step-by-Step Integration

#### 1. Get Your API Credentials

Contact your account manager to receive:
- `api_key`: Your unique API key
- `api_secret`: Your secret key (keep this secure!)
- `partner_code`: Your partner code
- IP whitelisting for your server

#### 2. Implement Signature Generation

```javascript
const crypto = require('crypto');
const axios = require('axios');

class LeadPartnerAPI {
  constructor(apiKey, apiSecret, partnerCode, baseURL) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.partnerCode = partnerCode;
    this.baseURL = baseURL || 'https://api.example.com/api/lead-partner';
  }

  generateSignature(requestBody, timestamp) {
    const bodyHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(requestBody))
      .digest('hex');
    
    const payload = this.apiKey + bodyHash + timestamp;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(payload)
      .digest('hex');
    
    return signature;
  }

  async uploadLeads(leads) {
    const timestamp = Math.floor(Date.now() / 1000);
    const requestBody = { leads };
    
    const signature = this.generateSignature(requestBody, timestamp);
    
    const headers = {
      'x-api-key': this.apiKey,
      'x-signature': signature,
      'x-timestamp': timestamp.toString(),
      'x-partner-code': this.partnerCode,
      'Content-Type': 'application/json'
    };

    try {
      const response = await axios.post(
        `${this.baseURL}/upload-leads-from-lead-partner`,
        requestBody,
        { headers }
      );
      
      return response.data;
    } catch (error) {
      console.error('API Error:', error.response?.data || error.message);
      throw error;
    }
  }
}

// Usage
const api = new LeadPartnerAPI(
  'your_api_key',
  'your_api_secret',
  'your_partner_code',
  'https://api.example.com/api/lead-partner'
);

// Single lead
const result = await api.uploadLeads({
  name: 'John Doe',
  phone: '9876543210',
  email: 'john@example.com',
  score: 750,
  salary: 50000
});

// Multiple leads
const bulkResult = await api.uploadLeads([
  {
    name: 'John Doe',
    phone: '9876543210',
    email: 'john@example.com',
    score: 750,
    salary: 50000
  },
  {
    name: 'Jane Smith',
    phone: '9876543211',
    email: 'jane@example.com',
    score: 800,
    salary: 75000
  }
]);
```

#### 3. Python Integration Example

```python
import hashlib
import hmac
import json
import time
import requests

class LeadPartnerAPI:
    def __init__(self, api_key, api_secret, partner_code, base_url):
        self.api_key = api_key
        self.api_secret = api_secret
        self.partner_code = partner_code
        self.base_url = base_url or 'https://api.example.com/api/lead-partner'
    
    def generate_signature(self, request_body, timestamp):
        # Step 1: Hash the request body
        body_hash = hashlib.sha256(
            json.dumps(request_body, separators=(',', ':')).encode()
        ).hexdigest()
        
        # Step 2: Create payload
        payload = self.api_key + body_hash + str(timestamp)
        
        # Step 3: Generate signature
        signature = hmac.new(
            self.api_secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()
        
        return signature
    
    def upload_leads(self, leads):
        timestamp = int(time.time())
        request_body = {'leads': leads}
        
        signature = self.generate_signature(request_body, timestamp)
        
        headers = {
            'x-api-key': self.api_key,
            'x-signature': signature,
            'x-timestamp': str(timestamp),
            'x-partner-code': self.partner_code,
            'Content-Type': 'application/json'
        }
        
        response = requests.post(
            f'{self.base_url}/upload-leads-from-lead-partner',
            json=request_body,
            headers=headers
        )
        
        return response.json()

# Usage
api = LeadPartnerAPI(
    'your_api_key',
    'your_api_secret',
    'your_partner_code'
)

result = api.upload_leads({
    'name': 'John Doe',
    'phone': '9876543210',
    'email': 'john@example.com',
    'score': 750,
    'salary': 50000
})
```

---

## Error Handling

### Common Error Scenarios

#### 1. Invalid Phone Number

**Error:**
```json
{
  "phone": "1234567890",
  "reason": "Invalid phone number. Indian mobile numbers must start with 6, 7, 8, or 9."
}
```

**Solution:** Ensure phone numbers are valid 10-digit Indian mobile numbers starting with 6, 7, 8, or 9.

#### 2. Duplicate Phone Number

**Error:**
```json
{
  "phone": "9876543210",
  "reason": "This phone number already exists in our system"
}
```

**Solution:** Check if the lead already exists before submitting, or handle this gracefully in your application.

#### 3. Missing Required Fields

**Error:**
```json
{
  "phone": "N/A",
  "reason": "Missing required field(s): name, phone"
}
```

**Solution:** Ensure all required fields (`name` and `phone`) are included in every lead.

#### 4. Authentication Errors

**Common Issues:**
- **Invalid signature**: Check that you're using the correct `api_secret` and generating the signature correctly
- **Expired timestamp**: Ensure your server's clock is synchronized (within 3 minutes)
- **Invalid API key**: Verify your `api_key` is correct
- **IP not allowed**: Contact support to whitelist your server's IP address

### Error Response Format

All error responses follow this structure:

```json
{
  "status": "ERROR",
  "statusCode": 400|401|403|404|500,
  "message": "Human-readable error message",
  "error": {
    "code": "ERROR_CODE",
    "message": "Detailed error message",
    "details": null
  }
}
```

---

## Security Best Practices

### 1. Protect Your API Credentials

- **Never** commit `api_secret` to version control
- Store credentials in environment variables or secure vaults
- Rotate credentials periodically
- Use different credentials for development and production

### 2. Request Security

- Always use HTTPS for API calls
- Validate and sanitize all input data before sending
- Implement request retry logic with exponential backoff
- Log all API requests for audit purposes

### 3. Signature Security

- Generate signatures server-side only
- Never expose `api_secret` in client-side code
- Regenerate signatures for each request (don't reuse)
- Validate timestamp freshness (within 3 minutes)

### 4. Data Validation

- Validate phone numbers before sending
- Ensure email addresses are properly formatted
- Sanitize all string inputs
- Validate numeric ranges (scores, salaries)

### 5. Error Handling

- Implement proper error handling and logging
- Don't expose sensitive information in error messages
- Implement retry logic for transient failures
- Monitor API response times and success rates

### 6. Rate Limiting

- Implement client-side rate limiting
- Respect server response codes
- Implement exponential backoff for retries
- Monitor your API usage

---

## Phone Number Validation

### Accepted Formats

The API accepts Indian mobile numbers in various formats:

| Format | Example | Description |
|--------|---------|-------------|
| 10 digits | `9876543210` | Standard format |
| With +91 | `+919876543210` | International format |
| With 91 | `919876543210` | Country code without + |
| With 0 | `09876543210` | With leading zero |
| With 0091 | `00919876543210` | Alternative country code |

### Validation Rules

1. Must be exactly 10 digits (after normalization)
2. Must start with 6, 7, 8, or 9
3. Cannot contain letters or special characters (except +, -, spaces)
4. Landline numbers (starting with 0 or 2) are not accepted

### Common Validation Errors

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "Phone number must have 10 digits" | Too few digits | Ensure number has 10 digits |
| "Invalid phone number. Indian mobile numbers must start with 6, 7, 8, or 9" | Invalid starting digit | Use valid mobile number |
| "Phone number cannot contain letters" | Contains alphabetic characters | Remove letters |
| "Landline numbers are not accepted" | Starts with 0 or 2 | Use mobile number |

---

## Testing

### Test Credentials

For testing, use the provided test credentials:
- Test API Key: Provided by your account manager
- Test API Secret: Provided by your account manager
- Test Partner Code: Provided by your account manager

### Test Scenarios

1. **Single Lead Submission**
   - Submit one valid lead
   - Verify success response
   - Check lead appears in system

2. **Bulk Lead Submission**
   - Submit multiple leads
   - Verify partial success handling
   - Check failed leads are reported

3. **Validation Testing**
   - Submit invalid phone numbers
   - Submit missing required fields
   - Verify error messages

4. **Authentication Testing**
   - Test with invalid signature
   - Test with expired timestamp
   - Test with invalid API key

---

## Support

### Contact Information

For API support, please contact:
- **Email**: support@example.com
- **Phone**: +91-XXXXXXXXXX
- **Business Hours**: Monday-Friday, 9 AM - 6 PM IST

### Common Questions

**Q: How do I get my API credentials?**
A: Contact your account manager or support team.

**Q: What if my IP address changes?**
A: Contact support to update your whitelisted IP addresses.

**Q: How do I handle duplicate leads?**
A: The API automatically detects duplicates. Check the `failedLeads` array in the response.

**Q: Can I submit leads in bulk?**
A: Yes, send an array of leads in the `leads` field.

**Q: What is the rate limit?**
A: Contact support for rate limit information specific to your account.

---

## Changelog

### Version 1.0.0 (Current)
- Initial API release
- HMAC-SHA256 authentication
- Single and bulk lead submission
- Phone number validation
- IP and domain whitelisting

---

**Last Updated:** January 2024

**API Version:** 1.0.0

