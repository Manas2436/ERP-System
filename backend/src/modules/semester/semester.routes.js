
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// GET all semesters
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM semester");
    res.status(200).json(rows);
  } catch (err) {
    console.error("Get semesters error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET semester by ID
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM semester WHERE semester_id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Semester not found" });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("Get semester by ID error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// CREATE semester
router.post("/", async (req, res) => {
  try {
    const { semester_number, academic_year } = req.body;

    if (
      semester_number == null ||
      !Number.isInteger(Number(semester_number)) ||
      Number(semester_number) < 1 ||
      !academic_year ||
      !/^\d{4}-\d{4}$/.test(academic_year)
    ) {
      return res.status(400).json({
        message: "Provide a valid semester_number and academic_year (YYYY-YYYY)"
      });
    }

    const [result] = await db.query(
      "INSERT INTO semester (semester_number, academic_year) VALUES (?, ?)",
      [Number(semester_number), academic_year]
    );

    res.status(201).json({
      message: "Semester created successfully",
      semester_id: result.insertId
    });
  } catch (err) {
    console.error("Create semester error:", err);
    res.status(500).json({ message: "Could not create semester" });
  }
});

// UPDATE semester
router.put("/:id", async (req, res) => {
  try {
    const { semester_number, academic_year } = req.body;

    if (
      semester_number == null ||
      !Number.isInteger(Number(semester_number)) ||
      Number(semester_number) < 1 ||
      !academic_year ||
      !/^\d{4}-\d{4}$/.test(academic_year)
    ) {
      return res.status(400).json({
        message: "Provide a valid semester_number and academic_year (YYYY-YYYY)"
      });
    }

    const [result] = await db.query(
      `UPDATE semester
       SET semester_number = ?, academic_year = ?
       WHERE semester_id = ?`,
      [Number(semester_number), academic_year, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Semester not found" });
    }

    res.status(200).json({ message: "Semester updated successfully" });
  } catch (err) {
    console.error("Update semester error:", err);
    res.status(500).json({ message: "Could not update semester" });
  }
});

// DELETE semester
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM semester WHERE semester_id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Semester not found" });
    }

    res.status(200).json({ message: "Semester deleted successfully" });
  } catch (err) {
    console.error("Delete semester error:", err);

    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message: "Cannot delete this semester because other records reference it"
      });
    }

    res.status(500).json({ message: "Could not delete semester" });
  }
});

module.exports = router;
