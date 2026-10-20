const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// Get all students
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM student");
    res.json({
      status: "success",
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});


router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM student WHERE student_id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Student not found"
      });
    }

    res.json({
      status: "success",
      data: rows[0]
    });
  } catch (error) {
    console.error("Student API error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch student"
    });
  }
});


router.post("/", async (req, res) => {
  try {
    const { student_id, student_name, program } = req.body;

    if (!student_id || !student_name || !program) {
      return res.status(400).json({
        status: "error",
        message: "student_id, student_name and program are required"
      });
    }

    await db.query(
      "INSERT INTO student (student_id, student_name, program) VALUES (?, ?, ?)",
      [student_id, student_name, program]
    );

    res.status(201).json({
      status: "success",
      message: "Student created successfully"
    });
  
  } catch (error) {
    console.error("Create student error:", error.message);

    // Duplicate student ID
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        status: "error",
        message: "Student ID already exists"
      });
    }

    // Foreign key constraint error, if applicable
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        status: "error",
        message: "Referenced record does not exist"
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to create student"
    });
  }
});

// Update student
router.put("/:id", async (req, res) => {
  try {
    const { student_name, program } = req.body;

    if (!student_name || !program) {
      return res.status(400).json({
        status: "error",
        message: "student_name and program are required"
      });
    }

    const [result] = await db.query(
      "UPDATE student SET student_name = ?, program = ? WHERE student_id = ?",
      [student_name, program, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Student not found"
      });
    }

    res.json({
      status: "success",
      message: "Student updated successfully"
    });
  } catch (error) {
    console.error("Update student error:", error.message);
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});


router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM student WHERE student_id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Student not found"
      });
    }

    res.json({
      status: "success",
      message: "Student deleted successfully"
    });
  } catch (error) {
    console.error("Delete student error:", error.message);

    res.status(500).json({
      status: "error",
      message: "Failed to delete student"
    });
  }
});

module.exports = router;