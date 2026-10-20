
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// GET all attendance records
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM attendance");
    res.status(200).json(rows);
  } catch (err) {
    console.error("Get attendance error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET attendance by ID
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM attendance WHERE attendance_id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("Get attendance by ID error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// CREATE attendance record
router.post("/", async (req, res) => {
  try {
    const {
      student_id,
      course_id,
      semester_id,
      classes_conducted,
      classes_attended
    } = req.body;

    if (
      !student_id ||
      !course_id ||
      semester_id == null ||
      classes_conducted == null ||
      classes_attended == null
    ) {
      return res.status(400).json({
        message: "All attendance fields are required"
      });
    }

    const conducted = Number(classes_conducted);
    const attended = Number(classes_attended);
    const semester = Number(semester_id);

    if (
      !Number.isInteger(conducted) ||
      !Number.isInteger(attended) ||
      !Number.isInteger(semester) ||
      conducted < 0 ||
      attended < 0 ||
      attended > conducted ||
      semester < 1
    ) {
      return res.status(400).json({
        message: "Enter valid semester and attendance counts"
      });
    }

    const [result] = await db.query(
      `INSERT INTO attendance
       (student_id, course_id, semester_id, classes_conducted, classes_attended)
       VALUES (?, ?, ?, ?, ?)`,
      [student_id, course_id, semester, conducted, attended]
    );

    res.status(201).json({
      message: "Attendance record created successfully",
      attendance_id: result.insertId
    });
  } catch (err) {
    console.error("Create attendance error:", err);

    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        message: "Student, course, or semester does not exist"
      });
    }

    res.status(500).json({ message: "Could not create attendance record" });
  }
});

// UPDATE attendance record
router.put("/:id", async (req, res) => {
  try {
    const {
      student_id,
      course_id,
      semester_id,
      classes_conducted,
      classes_attended
    } = req.body;

    if (
      !student_id ||
      !course_id ||
      semester_id == null ||
      classes_conducted == null ||
      classes_attended == null
    ) {
      return res.status(400).json({
        message: "All attendance fields are required"
      });
    }

    const conducted = Number(classes_conducted);
    const attended = Number(classes_attended);
    const semester = Number(semester_id);

    if (
      !Number.isInteger(conducted) ||
      !Number.isInteger(attended) ||
      !Number.isInteger(semester) ||
      conducted < 0 ||
      attended < 0 ||
      attended > conducted ||
      semester < 1
    ) {
      return res.status(400).json({
        message: "Enter valid semester and attendance counts"
      });
    }

    const [result] = await db.query(
      `UPDATE attendance
       SET student_id = ?, course_id = ?, semester_id = ?,
           classes_conducted = ?, classes_attended = ?
       WHERE attendance_id = ?`,
      [
        student_id,
        course_id,
        semester,
        conducted,
        attended,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    res.status(200).json({
      message: "Attendance record updated successfully"
    });
  } catch (err) {
    console.error("Update attendance error:", err);
    res.status(500).json({ message: "Could not update attendance record" });
  }
});

// DELETE attendance record
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM attendance WHERE attendance_id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    res.status(200).json({
      message: "Attendance record deleted successfully"
    });
  } catch (err) {
    console.error("Delete attendance error:", err);
    res.status(500).json({ message: "Could not delete attendance record" });
  }
});

module.exports = router;
