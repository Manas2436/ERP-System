
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// GET all courses
router.get("/", async (req, res) => {
  try {
    const [courses] = await db.query(
      "SELECT * FROM course"
    );

    res.status(200).json({
      status: "success",
      count: courses.length,
      data: courses
    });
  } catch (error) {
    console.error("Get courses error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch courses"
    });
  }
});

// GET course by ID
router.get("/:id", async (req, res) => {
  try {
    const [courses] = await db.query(
      "SELECT * FROM course WHERE course_id = ?",
      [req.params.id]
    );

    if (courses.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Course not found"
      });
    }

    res.status(200).json({
      status: "success",
      data: courses[0]
    });
  } catch (error) {
    console.error("Get course error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch course"
    });
  }
});

// CREATE course
router.post("/", async (req, res) => {
  try {
    const { course_id, course_code, course_name, credits } = req.body;

    if (
      !course_id ||
      !course_code ||
      !course_name ||
      credits === undefined ||
      credits === null ||
      credits === ""
    ) {
      return res.status(400).json({
        status: "error",
        message: "course_id, course_code, course_name and credits are required"
      });
    }

    const creditValue = Number(credits);

    if (!Number.isFinite(creditValue) || creditValue < 0 || creditValue > 999.9) {
      return res.status(400).json({
        status: "error",
        message: "credits must be a valid non-negative number"
      });
    }

    const [result] = await db.query(
      `INSERT INTO course (course_id, course_code, course_name, credits)
       VALUES (?, ?, ?, ?)`,
      [course_id, course_code, course_name, creditValue]
    );

    res.status(201).json({
      status: "success",
      message: "Course created successfully",
      course_id
    });
  } catch (error) {
    console.error("Create course error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        status: "error",
        message: "Course ID or course code already exists"
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to create course"
    });
  }
});

// UPDATE course
router.put("/:id", async (req, res) => {
  try {
    const { course_code, course_name, credits } = req.body;

    if (
      !course_code ||
      !course_name ||
      credits === undefined ||
      credits === null ||
      credits === ""
    ) {
      return res.status(400).json({
        status: "error",
        message: "course_code, course_name and credits are required"
      });
    }

    const creditValue = Number(credits);

    if (!Number.isFinite(creditValue) || creditValue < 0 || creditValue > 999.9) {
      return res.status(400).json({
        status: "error",
        message: "credits must be a valid non-negative number"
      });
    }

    const [result] = await db.query(
      `UPDATE course
       SET course_code = ?, course_name = ?, credits = ?
       WHERE course_id = ?`,
      [course_code, course_name, creditValue, req.params.id]
    );

    if (result.affectedRows === 0) {
      const [existing] = await db.query(
        "SELECT course_id FROM course WHERE course_id = ?",
        [req.params.id]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Course not found"
        });
      }
    }

    res.status(200).json({
      status: "success",
      message: "Course updated successfully"
    });
  } catch (error) {
    console.error("Update course error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        status: "error",
        message: "Course code already exists"
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to update course"
    });
  }
});

// DELETE course
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM course WHERE course_id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Course not found"
      });
    }

    res.status(200).json({
      status: "success",
      message: "Course deleted successfully"
    });
  } catch (error) {
    console.error("Delete course error:", error.message);

    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        status: "error",
        message: "Cannot delete this course because other records reference it"
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to delete course"
    });
  }
});

module.exports = router;
