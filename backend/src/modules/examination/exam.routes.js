
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// GET all examinations
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM exam");

    res.status(200).json({
      status: "success",
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Get exams error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch examinations"
    });
  }
});

// GET examination by ID
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM exam WHERE exam_id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Examination not found"
      });
    }

    res.status(200).json({
      status: "success",
      data: rows[0]
    });
  } catch (error) {
    console.error("Get exam error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch examination"
    });
  }
});


 // POST create examination
router.post("/", async (req, res) => {
  try {
    const { exam_id, exam_name, exam_type, semester_id, status } = req.body;

    if (!exam_id || !exam_name || !exam_type || semester_id == null) {
      return res.status(400).json({
        status: "error",
        message: "exam_id, exam_name, exam_type and semester_id are required"
      });
    }

    await db.query(
      `INSERT INTO exam (exam_id, exam_name, exam_type, semester_id, status)
       VALUES (?, ?, ?, ?, ?)`,
      [exam_id, exam_name, exam_type, semester_id, status || "PLANNED"]
    );

    res.status(201).json({
      status: "success",
      message: "Examination created successfully"
    });
  } catch (error) {
    console.error("Create exam error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        status: "error",
        message: "This exam_id already exists"
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to create examination"
    });
  }
});


 // PUT update examination
router.put("/:id", async (req, res) => {
  try {
    const { exam_name, exam_type, semester_id, status } = req.body;

    if (!exam_name || !exam_type || semester_id == null) {
      return res.status(400).json({
        status: "error",
        message: "exam_name, exam_type and semester_id are required"
      });
    }

    const [result] = await db.query(
      `UPDATE exam
       SET exam_name = ?, exam_type = ?, semester_id = ?, status = ?
       WHERE exam_id = ?`,
      [
        exam_name,
        exam_type,
        semester_id,
        status || "PLANNED",
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Examination not found"
      });
    }

    res.json({
      status: "success",
      message: "Examination updated successfully"
    });
  } catch (error) {
    console.error("Update exam error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to update examination"
    });
  }
});


 // DELETE examination
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM exam WHERE exam_id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Examination not found"
      });
    }

    res.json({
      status: "success",
      message: "Examination deleted successfully"
    });
  } catch (error) {
    console.error("Delete exam error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to delete examination"
    });
  }
});

module.exports = router;
