
USE examination_erp;

-- 1. Insert semesters
INSERT INTO Semester
    (semester_number, academic_year)
VALUES
    (1, '2026-2027'),
    (2, '2026-2027');

-- 2. Insert students
INSERT INTO Student
    (student_id, student_name, program)
VALUES
    ('S101', 'Aarav Sharma', 'BTech CSE'),
    ('S102', 'Priya Patil', 'BTech CSE'),
    ('S103', 'Rahul Deshmukh', 'BTech CSE');

-- 3. Insert courses
INSERT INTO Course
    (course_id, course_code, course_name, credits)
VALUES
    ('C101', 'CS301', 'Database Management Systems', 4),
    ('C102', 'CS302', 'Operating Systems', 3),
    ('C103', 'CS303', 'Computer Networks', 3);
