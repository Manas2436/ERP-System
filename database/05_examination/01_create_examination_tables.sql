
USE examination_erp;

CREATE TABLE Student (
    student_id VARCHAR(10) PRIMARY KEY,
    student_name VARCHAR(100) NOT NULL,
    program VARCHAR(50) NOT NULL
);

CREATE TABLE Semester (
    semester_id INT PRIMARY KEY AUTO_INCREMENT,
    semester_number INT NOT NULL,
    academic_year VARCHAR(9) NOT NULL,
    UNIQUE (semester_number, academic_year),
    CHECK (semester_number BETWEEN 1 AND 12)
);

CREATE TABLE Course (
    course_id VARCHAR(10) PRIMARY KEY,
    course_code VARCHAR(15) NOT NULL UNIQUE,
    course_name VARCHAR(100) NOT NULL,
    credits DECIMAL(3,1) NOT NULL,
    CHECK (credits > 0)
);
