# Student Management ER diagram

This standalone diagram covers the Student Management tables and the shared identity, academic-calendar, and department entities required to explain their declared foreign keys. PK = primary key; FK = foreign key; UK = unique key. Attributes retain the SQL column names; nullability and other constraints are summarized below where they affect cardinality.

Exports: [SVG](exports/student-management.svg) · [PNG](exports/student-management.png)

For the entity-only view, see [student-management-overview.md](student-management-overview.md).

```mermaid
erDiagram
  DEPARTMENT {
    int department_id PK
    varchar department_code UK
    varchar department_name UK
    timestamp created_at
    timestamp updated_at
  }
  PROGRAM {
    int program_id PK
    varchar program_code UK
    varchar program_name
    int department_id FK
    tinyint duration_years
    timestamp created_at
    timestamp updated_at
  }
  ACADEMIC_YEAR {
    int academic_year_id PK
    varchar year_label UK
    date start_date
    date end_date
    timestamp created_at
  }
  SEMESTER {
    int semester_id PK
    int academic_year_id FK
    enum term
    date start_date
    date end_date
    timestamp created_at
  }
  STUDENT {
    int student_id PK
    varchar enrollment_no UK
    varchar first_name
    varchar last_name
    varchar email UK
    int program_id FK
    enum status
    timestamp created_at
    timestamp updated_at
  }
  FACULTY {
    int faculty_id PK
    varchar employee_code UK
    varchar first_name
    varchar last_name
    varchar email UK
    int department_id FK
    enum status
    timestamp created_at
    timestamp updated_at
  }
  ROLE {
    int role_id PK
    varchar role_name UK
    timestamp created_at
  }
  APP_USER {
    int user_id PK
    varchar username UK
    varchar email UK
    varchar password_hash
    int role_id FK
    int student_id FK,UK
    int faculty_id FK,UK
    boolean is_active
    tinyint failed_attempts
    datetime locked_until
    datetime last_login_at
    timestamp created_at
    timestamp updated_at
  }
  STUDENT_PROFILE {
    int student_id PK,FK
    date date_of_birth
    varchar phone
    varchar address
    smallint admission_year
    timestamp created_at
    timestamp updated_at
  }
  GUARDIAN {
    int guardian_id PK
    int student_id FK
    varchar name
    enum relation
    varchar phone
    varchar email
    timestamp created_at
  }
  ADMISSION {
    int admission_id PK
    int student_id FK,UK
    date admission_date
    enum admission_type
    decimal merit_score
    timestamp created_at
  }
  STUDENT_PROFILE_AUDIT {
    int audit_id PK
    int student_id
    varchar field_name
    varchar old_value
    varchar new_value
    timestamp changed_at
  }
  COURSE {
    int course_id PK
    varchar course_code UK
    varchar course_name
    tinyint credits
    int department_id FK
    tinyint semester_no
    timestamp created_at
    timestamp updated_at
  }
  COURSE_OFFERING {
    int offering_id PK
    int course_id FK
    int semester_id FK
    smallint capacity
    timestamp created_at
  }
  ENROLLMENT {
    int enrollment_id PK
    int student_id FK
    int offering_id FK
    date enrolled_on
    enum status
    timestamp created_at
    timestamp updated_at
  }
  ATTENDANCE {
    int attendance_id PK
    int enrollment_id FK
    date class_date
    enum status
    timestamp created_at
  }

  DEPARTMENT ||--o{ PROGRAM : department_id
  DEPARTMENT ||--o{ FACULTY : department_id
  DEPARTMENT ||--o{ COURSE : department_id
  PROGRAM ||--o{ STUDENT : program_id
  ACADEMIC_YEAR ||--o{ SEMESTER : academic_year_id
  ROLE ||--o{ APP_USER : role_id
  STUDENT o|--o| APP_USER : student_id
  FACULTY o|--o| APP_USER : faculty_id
  STUDENT ||--o| STUDENT_PROFILE : student_id
  STUDENT ||--o{ GUARDIAN : student_id
  STUDENT ||--o| ADMISSION : student_id
  COURSE ||--o{ COURSE_OFFERING : course_id
  SEMESTER ||--o{ COURSE_OFFERING : semester_id
  STUDENT ||--o{ ENROLLMENT : student_id
  COURSE_OFFERING ||--o{ ENROLLMENT : offering_id
  ENROLLMENT ||--o{ ATTENDANCE : enrollment_id
```

## Relationship and constraint notes

- Each FK column on a child row is `NOT NULL`, so each child requires exactly one referenced parent. Parent rows may have no children unless uniqueness changes that cardinality.
- `STUDENT_PROFILE.student_id` is both its PK and FK; a profile requires one student, while a student may have zero or one profile in the schema.
- `ADMISSION.student_id` is `NOT NULL` and unique, so each admission belongs to exactly one student and a student has zero or one admission.
- `APP_USER.student_id` and `APP_USER.faculty_id` are nullable, unique FKs. A user may be unlinked or linked to one student or faculty member; a student/faculty member may have at most one linked user. A check constraint prohibits setting both links on the same user. Auth triggers further require the matching link for STUDENT and FACULTY roles and forbid either link for ADMIN; the schema does not enforce a link for every role value.
- `COURSE_OFFERING` has a unique `(course_id, semester_id)` pair, and `ENROLLMENT` has a unique `(student_id, offering_id)` pair. Those composite constraints do not change the one-to-many cardinalities shown.
- `ATTENDANCE` has a unique `(enrollment_id, class_date)` pair, allowing at most one attendance row per enrollment per date.
- `STUDENT_PROFILE_AUDIT.student_id` is shown as an ordinary attribute only. The update trigger writes this value, but `database/02_student/schema.sql` declares no FK for it, so the diagram intentionally has no relationship line to `STUDENT`.
- The shared entities shown are limited to dependencies of Student Management or its identity links. Views, procedures, functions, triggers, seed rows, and authentication token/audit tables are not entities in this module diagram.
