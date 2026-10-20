
USE examination_erp;

CREATE TABLE IF NOT EXISTS Exam_Schedule (
    schedule_id INT PRIMARY KEY AUTO_INCREMENT,
    exam_id VARCHAR(10) NOT NULL,
    course_id VARCHAR(10) NOT NULL,
    exam_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room_no VARCHAR(20) NOT NULL,

    FOREIGN KEY (exam_id)
        REFERENCES Exam(exam_id),

    FOREIGN KEY (course_id)
        REFERENCES Course(course_id),

    UNIQUE (exam_id, course_id),

    CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS Attendance (
    attendance_id INT PRIMARY KEY AUTO_INCREMENT,
    student_id VARCHAR(10) NOT NULL,
    course_id VARCHAR(10) NOT NULL,
    semester_id INT NOT NULL,
    classes_conducted INT NOT NULL,
    classes_attended INT NOT NULL,

    FOREIGN KEY (student_id)
        REFERENCES Student(student_id),

    FOREIGN KEY (course_id)
        REFERENCES Course(course_id),

    FOREIGN KEY (semester_id)
        REFERENCES Semester(semester_id),

    UNIQUE (student_id, course_id, semester_id),

    CHECK (classes_conducted >= 0),
    CHECK (classes_attended >= 0),
    CHECK (classes_attended <= classes_conducted)
);
