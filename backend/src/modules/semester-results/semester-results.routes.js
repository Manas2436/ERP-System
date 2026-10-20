
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// GET all semester results
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM semester_result ORDER BY semester_result_id"
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error("Get semester results error:", error);
    res.status(500).json({ message: "Failed to fetch semester results" });
  }
});

// GET semester result by ID
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM semester_result WHERE semester_result_id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Semester result not found" });
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Get semester result error:", error);
    res.status(500).json({ message: "Failed to fetch semester result" });
  }
});

// POST create semester result
router.post("/", async (req, res) => {
  try {
    const {
      student_id,
      semester_id,
      total_credits,
      total_credit_points,
      sgpa
    } = req.body;

    if (
      !student_id ||
      semester_id == null ||
      total_credits == null ||
      total_credit_points == null ||
      sgpa == null
    ) {
      return res.status(400).json({
        message: "Please provide all required fields"
      });
    }

    const [result] = await db.query(
      `INSERT INTO semester_result
       (student_id, semester_id, total_credits, total_credit_points, sgpa)
       VALUES (?, ?, ?, ?, ?)`,
      [student_id, semester_id, total_credits, total_credit_points, sgpa]
    );

    res.status(201).json({
      message: "Semester result created successfully",
      semester_result_id: result.insertId
    });
  } catch (error) {
    console.error("Create semester result error:", error);
    res.status(500).json({ message: "Failed to create semester result" });
  }
});

// PUT update semester result by ID
router.put("/:id", async (req, res) => {
  try {
    const {
      student_id,
      semester_id,
      total_credits,
      total_credit_points,
      sgpa
    } = req.body;

    if (
      !student_id ||
      semester_id == null ||
      total_credits == null ||
      total_credit_points == null ||
      sgpa == null
    ) {
      return res.status(400).json({
        message: "Please provide all required fields"
      });
    }

    const [result] = await db.query(
      `UPDATE semester_result
       SET student_id = ?,
           semester_id = ?,
           total_credits = ?,
           total_credit_points = ?,
           sgpa = ?
       WHERE semester_result_id = ?`,
      [
        student_id,
        semester_id,
        total_credits,
        total_credit_points,
        sgpa,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Semester result not found" });
    }

    res.status(200).json({
      message: "Semester result updated successfully"
    });
  } catch (error) {
    console.error("Update semester result error:", error);
    res.status(500).json({ message: "Failed to update semester result" });
  }
});

// DELETE semester result by ID
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM semester_result WHERE semester_result_id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Semester result not found" });
    }

    res.status(200).json({
      message: "Semester result deleted successfully"
    });
  } catch (error) {
    console.error("Delete semester result error:", error);
    res.status(500).json({ message: "Failed to delete semester result" });
  }
});

module.exports = router;
