
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./src/config/db");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "ERP System Backend is running!",
    status: "success"
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK" });
});

// Database connection test
app.get("/api/db-test", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DATABASE() AS db_name"
    );

    res.json({
      status: "success",
      message: "MySQL connected!",
      database: rows[0].db_name
    });
  } catch (error) {
    console.error("Database error:", error.message);
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

const studentRoutes = require("./src/modules/student/student.routes");
app.use("/api/students", studentRoutes);

const examRoutes = require("./src/modules/examination/exam.routes");
app.use("/api/exams", examRoutes);

const resultRoutes = require("./src/modules/results/result.routes");
app.use("/api/results", resultRoutes);

const courseRoutes = require("./src/modules/course/course.routes");
app.use("/api/courses", courseRoutes);

const attendanceRoutes = require("./src/modules/attendance/attendance.routes");
app.use("/api/attendance", attendanceRoutes);

const semesterRoutes = require("./src/modules/semester/semester.routes");
app.use("/api/semesters", semesterRoutes);

const examRegistrationRoutes = require("./src/modules/exam-registration/exam-registration.routes");
app.use("/api/exam-registrations", examRegistrationRoutes);

const examScheduleRoutes = require("./src/modules/exam-schedule/exam-schedule.routes");
app.use("/api/exam-schedules", examScheduleRoutes);

const semesterResultsRoutes = require(
  "./src/modules/semester-results/semester-results.routes"
);
app.use("/api/semester-results", semesterResultsRoutes);

app.listen(PORT, () => {
  console.log(`ERP backend running at http://localhost:${PORT}`);
});
