const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// GET all exam schedules
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM exam_schedule ORDER BY schedule_id"
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("Get exam schedules error:", err);
    res.status(500).json({ message: "Could not fetch exam schedules" });
  }
});

// GET exam schedule by ID
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM exam_schedule WHERE schedule_id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Exam schedule not found" });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("Get exam schedule error:", err);
    res.status(500).json({ message: "Could not fetch exam schedule" });
  }
});

// CREATE exam schedule
router.post("/", async (req, res) => {
  try {
    const {
      exam_id,
      course_id,
      exam_date,
      start_time,
      end_time,
      room_no
    } = req.body;

    if (
      !exam_id ||
      !course_id ||
      !exam_date ||
      !start_time ||
      !end_time ||
      !room_no
    ) {
      return res.status(400).json({
        message: "All exam schedule fields are required"
      });
    }

    const [result] = await db.query(
      `INSERT INTO exam_schedule
       (exam_id, course_id, exam_date, start_time, end_time, room_no)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [exam_id, course_id, exam_date, start_time, end_time, room_no]
    );

    res.status(201).json({
      message: "Exam schedule created successfully",
      schedule_id: result.insertId
    });
  } catch (err) {
    console.error("Create exam schedule error:", err);

    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        message: "The exam_id or course_id does not exist"
      });
    }

    res.status(500).json({ message: "Could not create exam schedule" });
  }
});

// UPDATE exam schedule
router.put("/:id", async (req, res) => {
  try {
    const {
      exam_id,
      course_id,
      exam_date,
      start_time,
      end_time,
      room_no
    } = req.body;

    if (
      !exam_id ||
      !course_id ||
      !exam_date ||
      !start_time ||
      !end_time ||
      !room_no
    ) {
      return res.status(400).json({
        message: "All exam schedule fields are required"
      });
    }

    const [result] = await db.query(
      `UPDATE exam_schedule
       SET exam_id = ?, course_id = ?, exam_date = ?,
           start_time = ?, end_time = ?, room_no = ?
       WHERE schedule_id = ?`,
      [
        exam_id,
        course_id,
        exam_date,
        start_time,
        end_time,
        room_no,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Exam schedule not found" });
    }

    res.status(200).json({
      message: "Exam schedule updated successfully"
    });
  } catch (err) {
    console.error("Update exam schedule error:", err);

    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        message: "The exam_id or course_id does not exist"
      });
    }

    res.status(500).json({ message: "Could not update exam schedule" });
  }
});

// DELETE exam schedule
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM exam_schedule WHERE schedule_id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Exam schedule not found" });
    }

    res.status(200).json({
      message: "Exam schedule deleted successfully"
    });
  } catch (err) {
    console.error("Delete exam schedule error:", err);

    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message: "Cannot delete this schedule because another record references it"
      });
    }

    res.status(500).json({ message: "Could not delete exam schedule" });
  }
});

module.exports = router;