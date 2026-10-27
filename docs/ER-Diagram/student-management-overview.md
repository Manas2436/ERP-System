# Student Management overview ERD

This entity-only overview presents the Student Management records and shared academic structure. It uses the same declared foreign-key relationships as the detailed ERD. Crow's-foot markers show minimum and maximum cardinality.

Exports: [SVG](exports/student-management-overview.svg) · [PNG](exports/student-management-overview.png)

```mermaid
erDiagram
  DEPARTMENT ||--o{ PROGRAM : contains
  DEPARTMENT ||--o{ COURSE : offers
  PROGRAM ||--o{ STUDENT : includes
  ACADEMIC_YEAR ||--o{ SEMESTER : contains
  STUDENT ||--o| STUDENT_PROFILE : has
  STUDENT ||--o{ GUARDIAN : has
  STUDENT ||--o| ADMISSION : records
  COURSE ||--o{ COURSE_OFFERING : offered_as
  SEMESTER ||--o{ COURSE_OFFERING : schedules
  STUDENT ||--o{ ENROLLMENT : enrolls
  COURSE_OFFERING ||--o{ ENROLLMENT : includes
  ENROLLMENT ||--o{ ATTENDANCE : records
  STUDENT_PROFILE_AUDIT
```

`STUDENT_PROFILE_AUDIT` is shown as an isolated entity because its `student_id` column has no declared foreign key to `STUDENT`. Its audit association is not enforced by the database.
