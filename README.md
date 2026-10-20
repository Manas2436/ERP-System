# ERP-System

**University ERP System — DBMS PBL Group Project**

## Project Overview

The University ERP System is a database management system project designed to manage university examination-related activities through a backend API.

## Modules

- Student Management
- Examination Management
- Course Management
- Attendance Management
- Semester Management
- Exam Registration
- Exam Scheduling
- Examination Results
- Semester Results

## Technologies Used

- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **API Testing:** Postman
- **Development Environment:** Visual Studio Code

## Project Structure

```text
ERP-System/
├── backend/
│   ├── src/
│   ├── database/
│   ├── server.js
│   ├── package.json
│   └── ERP Backend APIs.json
├── database/
├── docs/
├── frontend/
├── .gitignore
└── README.md
```

## Setup and Execution

1. Install Node.js and MySQL.
2. Configure the database connection using the backend environment variables.
3. Create and configure the `examination_erp` database.
4. Open a terminal in the `backend` folder.
5. Install dependencies:

   ```bash
   npm install
   ```

6. Start the backend using the project's configured start command.
7. Test the API endpoints using Postman.

## API Testing

The exported Postman collection is available at:

`backend/ERP Backend APIs.json`

Import this file into Postman to access the saved API requests.

## Project Type

Database Management Systems (DBMS) — Problem-Based Learning (PBL) Group Project.
