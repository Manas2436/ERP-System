
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// GET all results
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM exam_result");

    res.json({
      status: "success",
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Get results error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch results"
    });
  }
});

// GET result by ID
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM exam_result WHERE result_id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Result not found"
      });
    }

    res.json({
      status: "success",
      data: rows[0]
    });
  } catch (error) {
    console.error("Get result error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch result"
    });
  }
});

// POST create result
router.post("/", async (req, res) => {
  try {
    const { registration_id, marks_obtained, max_marks, grade_point } = req.body;

    if (
      registration_id == null ||
      marks_obtained == null ||
      max_marks == null
    ) {
      return res.status(400).json({
        status: "error",
        message: "registration_id, marks_obtained and max_marks are required"
      });
    }

    const marks = Number(marks_obtained);
    const maximum = Number(max_marks);
    const grade = grade_point == null ? null : Number(grade_point);

    if (
      !Number.isFinite(marks) ||
      !Number.isFinite(maximum) ||
      maximum <= 0 ||
      marks < 0 ||
      marks > maximum ||
      (grade != null && (!Number.isFinite(grade) || grade < 0))
    ) {
      return res.status(400).json({
        status: "error",
        message: "Enter valid marks, max_marks and grade_point"
      });
    }

    const [result] = await db.query(
      `INSERT INTO exam_result
       (registration_id, marks_obtained, max_marks, grade_point)
       VALUES (?, ?, ?, ?)`,
      [registration_id, marks, maximum, grade]
    );

    res.status(201).json({
      status: "success",
      message: "Result created successfully",
      result_id: result.insertId
    });
  } catch (error) {
    console.error("Create result error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        status: "error",
        message: "A result already exists for this registration"
      });
    }

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        status: "error",
        message: "Registration not found"
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to create result"
    });
  }
});

 // PUT update result
router.put("/:id", async (req, res) => {
  try {
    const { registration_id, marks_obtained, max_marks, grade_point } = req.body;

    if (
      registration_id == null ||
      marks_obtained == null ||
      max_marks == null
    ) {
      return res.status(400).json({
        status: "error",
        message: "registration_id, marks_obtained and max_marks are required"
      });
    }

    const marks = Number(marks_obtained);
    const maximum = Number(max_marks);
    const grade = grade_point == null ? null : Number(grade_point);

    if (
      !Number.isFinite(marks) ||
      !Number.isFinite(maximum) ||
      maximum <= 0 ||
      marks < 0 ||
      marks > maximum ||
      (grade !== null && (!Number.isFinite(grade) || grade < 0))
    ) {
      return res.status(400).json({
        status: "error",
        message: "Enter valid marks, max_marks and grade_point"
      });
    }

    const [result] = await db.query(
      `UPDATE exam_result
       SET registration_id = ?, marks_obtained = ?,
           max_marks = ?, grade_point = ?
       WHERE result_id = ?`,
      [registration_id, marks, maximum, grade, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Result not found"
      });
    }

    res.json({
      status: "success",
      message: "Result updated successfully"
    });
  } catch (error) {
    console.error("Update result error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        status: "error",
        message: "A result already exists for this registration"
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to update result"
    });
  }
});


 // DELETE result
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM exam_result WHERE result_id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Result not found"
      });
    }

    res.json({
      status: "success",
      message: "Result deleted successfully"
    });
  } catch (error) {
    console.error("Delete result error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to delete result"
    });
  }
});


router.post("/", async (req, res) => {
  try {
    const {
      registration_id,
      marks_obtained,
      max_marks,
      grade_point
    } = req.body;

    if (
      registration_id == null ||
      marks_obtained == null ||
      max_marks == null
    ) {
      return res.status(400).json({
        status: "error",
        message: "registration_id, marks_obtained and max_marks are required"
      });
    }

    const marks = Number(marks_obtained);
    const maximum = Number(max_marks);
    const grade =
      grade_point == null ? null : Number(grade_point);

    if (
      !Number.isFinite(marks) ||
      !Number.isFinite(maximum) ||
      maximum <= 0 ||
      marks < 0 ||
      marks > maximum ||
      (grade !== null &&
        (!Number.isFinite(grade) || grade < 0))
    ) {
      return res.status(400).json({
        status: "error",
        message: "Enter valid marks, max_marks and grade_point"
      });
    }

    const [result] = await db.query(
      `INSERT INTO exam_result
       (registration_id, marks_obtained, max_marks, grade_point)
       VALUES (?, ?, ?, ?)`,
      [registration_id, marks, maximum, grade]
    );

    res.status(201).json({
      status: "success",
      message: "Result created successfully",
      result_id: result.insertId
    });
  } catch (error) {
    console.error("Create result error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        status: "error",
        message: "A result already exists for this registration"
      });
    }

    if (
      error.code === "ER_NO_REFERENCED_ROW_2" ||
      error.code === "ER_NO_REFERENCED_ROW"
    ) {
      return res.status(400).json({
        status: "error",
        message: "Registration not found"
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to create result"
    });
  }
});

module.exports = router;
