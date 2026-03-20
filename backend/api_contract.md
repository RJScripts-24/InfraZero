# InfraZero API Contract (v1.0.0)

This document defines the API contract required by the InfraZero frontend to support its current features. The frontend is built with React, Vite, and @xyflow/react.

## Base Configuration

- **Base URL**: `https://api.infrazero.dev/v1`
- **Content-Type**: `application/json`
- **Authentication**: Bearer Token in `Authorization` header.

---

## 1. Authentication

### Google Login
`POST /auth/google`
- **Description**: Authenticate using Google OAuth token.
- **Request Body**: `{ "token": "string" }`
- **Response (200)**: `{ "user": { "id": "string", "name": "string", "avatar": "string" }, "token": "string" }`

### GitHub Login
`POST /auth/github`
- **Description**: Authenticate using GitHub OAuth code.
- **Request Body**: `{ "code": "string" }`
- **Response (200)**: `{ "user": { "id": "string", "name": "string", "avatar": "string" }, "token": "string" }`

### Guest Access
`POST /auth/guest`
- **Description**: Create an ephemeral guest session.
- **Response (200)**: `{ "user": { "id": "guest_id", "name": "Guest User", "tier": "Research" }, "token": "string" }`

---

## 2. Projects

### List Projects
`GET /projects`
- **Response (200)**: 
  ```json
  [
    {
      "id": "uuid",
      "title": "Project Name",
      "status": "Draft | Graded | Failure",
      "statusColor": "hex_code",
      "lastEdited": "ISO-8601 string",
      "isCollaborative": true,
      "grade": "A- | B+ | F"
    }
  ]
  ```

### Get Project Details
`GET /projects/{id}`
- **Response (200)**:
  ```json
  {
    "id": "uuid",
    "title": "Project Name",
    "nodes": [
      {
        "id": "node_id",
        "type": "custom",
        "position": { "x": 100, "y": 200 },
        "data": {
          "label": "API Gateway",
          "type": "Load Balancer",
          "isActive": true,
          "processingPower": "500ms",
          "failureRate": "0.01%"
        }
      }
    ],
    "edges": [
      {
        "id": "edge_id",
        "source": "node_1",
        "target": "node_2",
        "sourceHandle": "bottom",
        "targetHandle": "top",
        "animated": false
      }
    ]
  }
  ```

### Create Project
`POST /projects`
- **Request Body**: `{ "title": "string" }`
- **Response (201)**: `{ "id": "uuid", "title": "string" }`

### Update Project
`PUT /projects/{id}`
- **Request Body**: Project object (partial or full `nodes` and `edges`).
- **Response (200)**: `{ "success": true }`

### Delete Project
`DELETE /projects/{id}`
- **Response (204)**: No content.

---

## 3. Collaboration

### Generate Invite Link
`POST /projects/{id}/invite`
- **Response (200)**: `{ "inviteLink": "https://infrazero.dev/invite/project-id-hash" }`

---

## 4. Simulation & AI

### Run Simulation
`POST /projects/{id}/simulate`
- **Description**: Starts a deterministic chaos simulation for the architecture.
- **Response (202)**: `{ "simulationId": "uuid" }`

### Get Simulation Logs
`GET /simulations/{id}/logs`
- **Description**: Fetch or stream logs for a simulation.
- **Format**: Array of objects `{ "timestamp": "string", "level": "INFO|WARN|ERROR", "message": "string" }`

### AI Architecture Generation
`POST /ai/generate`
- **Description**: Generate a suggested topology from a text prompt.
- **Request Body**: `{ "prompt": "string" }`
- **Response (200)**: `{ "nodes": [...], "edges": [...] }`

---

## 5. Reports

### Get Simulation Report
`GET /projects/{id}/reports/{reportId}`
- **Response (200)**:
  ```json
  {
    "simulationId": "string",
    "grade": "B+",
    "status": "STABLE — PASS",
    "metrics": {
      "totalRequests": 10000,
      "failedRequests": 142,
      "peakLatency": 323
    },
    "recommendations": ["string"],
    "latencyData": [{ "time": 0, "latency": 45 }]
  }
  ```
