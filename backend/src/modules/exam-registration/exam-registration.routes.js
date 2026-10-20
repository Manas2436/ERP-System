
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// GET all exam registrations
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM exam_registration ORDER BY registration_id"
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("Get registrations error:", err);
    res.status(500).json({ message: "Could not fetch registrations" });
  }
});

// GET registration by ID
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM exam_registration WHERE registration_id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Registration not found" });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("Get registration error:", err);
    res.status(500).json({ message: "Could not fetch registration" });
  }
});

// CREATE registration
router.post("/", async (req, res) => {
  try {
    const { student_id, schedule_id, registration_date, status } = req.body;

    if (!student_id || schedule_id == null || !registration_date) {
      return res.status(400).json({
        message: "student_id, schedule_id, and registration_date are required"
      });
    }

    const registrationStatus = status || "REGISTERED";

    const [result] = await db.query(
      `INSERT INTO exam_registration
       (student_id, schedule_id, registration_date, status)
       VALUES (?, ?, ?, ?)`,
      [student_id, schedule_id, registration_date, registrationStatus]
    );

    res.status(201).json({
      message: "Registration created successfully",
      registration_id: result.insertId
    });
  } catch (err) {
    console.error("Create registration error:", err);
    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        message: "The student_id or schedule_id does not exist"
      });
    }
    res.status(500).json({ message: "Could not create registration" });
  }
});

// UPDATE registration
router.put("/:id", async (req, res) => {
  try {
    const { student_id, schedule_id, registration_date, status } = req.body;

    if (!student_id || schedule_id == null || !registration_date || !status) {
      return res.status(400).json({
        message: "student_id, schedule_id, registration_date, and status are required"
      });
    }

    const [result] = await db.query(
      `UPDATE exam_registration
       SET student_id = ?, schedule_id = ?, registration_date = ?, status = ?
       WHERE registration_id = ?`,
      [
        student_id,
        schedule_id,
        registration_date,
        status,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Registration not found" });
    }

    res.status(200).json({ message: "Registration updated successfully" });
  } catch (err) {
    console.error("Update registration error:", err);
    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        message: "The student_id or schedule_id does not exist"
      });
    }
    res.status(500).json({ message: "Could not update registration" });
  }
});

// DELETE registration
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM exam_registration WHERE registration_id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Registration not found" });
    }

    res.status(200).json({ message: "Registration deleted successfully" });
  } catch (err) {
    console.error("Delete registration error:", err);
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message: "Cannot delete this registration because another record references it"
      });
    }
    res.status(500).json({ message: "Could not delete registration" });
  }
});

module.exports = router;
