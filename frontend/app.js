
const $ = (selector) => document.querySelector(selector);
const content = $("#page-content");

const titles = {
  dashboard: "Dashboard",
  students: "Students",
  schedules: "Exam schedules",
  attendance: "Attendance",
  registrations: "Registrations",
  results: "Exam results",
  semester: "Semester & CGPA"
};

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

async function api(url, options = {}) {
  const response = await fetch(`http://localhost:5000${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options

  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data.data ?? data;
}

function notify(message, error = false) {
  const notice = $("#notice");

  if (!notice) return;

  notice.textContent = message;
  notice.className = "notice" + (error ? " error" : "");

  window.scrollTo({ top: 0, behavior: "smooth" });

  setTimeout(() => notice.classList.add("hidden"), 6500);
}

function table(headers, rows) {
  if (!rows.length) {
    return `<div class="empty">No records found yet.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
  `;
}

function tr(values) {
  return `<tr>${values.map(value => `<td>${value}</td>`).join("")}</tr>`;
}

function pill(status) {
  const value = String(status ?? "");
  const className = /fail|not eligible|reject/i.test(value)
    ? "red"
    : /pending/i.test(value)
      ? "gray"
      : "";

  return `<span class="pill ${className}">${esc(value)}</span>`;
}

async function render(page = "dashboard") {
  document.querySelectorAll(".nav").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  $("#page-title").textContent = titles[page] || "Dashboard";

  try {
    if (page === "dashboard") await dashboard();
    if (page === "students") await students();
    if (page === "schedules") await schedules();
    if (page === "attendance") await attendance();
    if (page === "registrations") await registrations();
    if (page === "results") await results();
    if (page === "semester") await semester();
  } catch (error) {
    content.innerHTML = `
      <div class="panel">
        <h2>Could not load this section</h2>
        <p class="muted">${esc(error.message)}</p>
        <p class="muted">
          Check the database connection and backend server, then try again.
        </p>
        <button class="btn" onclick="render('${page}')">Try again</button>
      </div>
    `;
  }
}

async function health() {
  try {
    const data = await api("/api/health");
    $("#connection-text").textContent = `Connected · ${data.db}`;
  } catch {
    $("#connection-text").textContent = "Database connection error";
    $("#connection-text").style.color = "#bf3e52";
  }
}

/* DASHBOARD */


async function dashboard() {
  const [students, courses, schedules, registrations] = await Promise.all([
    api("/api/students"),
    api("/api/courses"),
    api("/api/exam-schedules"),
    api("/api/exam-registrations")
  ]);

  content.innerHTML = `
    <div class="stats">
      <div class="stat">
        <div class="stat-top">Total students</div>
        <strong>${students.length}</strong>
        <small>Student records</small>
      </div>

      <div class="stat">
        <div class="stat-top">Courses</div>
        <strong>${courses.length}</strong>
        <small>Courses in the database</small>
      </div>

      <div class="stat">
        <div class="stat-top">Exam schedules</div>
        <strong>${schedules.length}</strong>
        <small>Scheduled examinations</small>
      </div>

      <div class="stat">
        <div class="stat-top">Registrations</div>
        <strong>${registrations.length}</strong>
        <small>Exam registrations</small>
      </div>
    </div>

    <div class="panel">
      <div class="panel-heading">
        <h2>Exam registration status</h2>
        <button class="btn secondary small"
          onclick="render('registrations')">View all</button>
      </div>

      ${table(
        ["Registration ID", "Student ID", "Schedule ID", "Registered on", "Status"],
        registrations.slice(0, 6).map(record =>
          tr([
            esc(record.registration_id),
            esc(record.student_id),
            esc(record.schedule_id),
            esc(String(record.registration_date || "").slice(0, 10)),
            pill(record.status || "Unknown")
          ])
        )
      )}
    </div>

    <div class="panel">
      <div class="panel-heading">
        <h2>Examination timetable</h2>
        <button class="btn secondary small"
          onclick="render('schedules')">View all</button>
      </div>

      ${table(
        ["Schedule ID", "Exam ID", "Course ID", "Date", "Start", "End", "Room"],
        schedules.slice(0, 8).map(schedule =>
          tr([
            esc(schedule.schedule_id),
            esc(schedule.exam_id),
            esc(schedule.course_id),
            esc(String(schedule.exam_date).slice(0, 10)),
            esc(String(schedule.start_time).slice(0, 5)),
            esc(String(schedule.end_time).slice(0, 5)),
            esc(schedule.room_no)
          ])
        )
      )}
    </div>
  `;
}


/* STUDENT DIRECTORY */

async function students() {
  const rows = await api("/api/students");

  content.innerHTML = `
    <div class="panel">
      <div class="section-head">
        <h2>Student directory</h2>
        <input id="search" class="search" placeholder="Search students..." />
      </div>
      <div id="student-table">
        
${table(
  ["Student ID", "Student Name", "Program"],
  rows.map(student =>
    tr([
      esc(student.student_id),
      esc(student.student_name),
      esc(student.program)
    ])
  )
)}

      </div>
    </div>
  `;

  $("#search").addEventListener("input", event => {
    const query = event.target.value.toLowerCase();

    const filtered = rows.filter(student =>
      JSON.stringify(student).toLowerCase().includes(query)
    );

    $("#student-table").innerHTML = table(
      ["ID", "Student name", "Email", "Department", "Semester"],
      filtered.map(student =>
        tr([
          esc(student.student_id),
          `<strong>${esc(student.student_name)}</strong>`,
          esc(student.email),
          esc(student.department),
          esc(student.current_semester)
        ])
      )
    );
  });
}

/* EXAM TIMETABLE */


async function schedules() {
  const rows = await api("/api/exam-schedules");

  content.innerHTML = `
    <div class="panel">
      <div class="panel-heading">
        <h2>Examination timetable</h2>
        <span class="muted">${rows.length} schedule(s)</span>
      </div>

      ${table(
        ["Schedule ID", "Exam ID", "Course ID", "Date", "Start", "End", "Room"],
        rows.map(schedule =>
          tr([
            esc(schedule.schedule_id),
            esc(schedule.exam_id),
            esc(schedule.course_id),
            esc(String(schedule.exam_date).slice(0, 10)),
            esc(String(schedule.start_time).slice(0, 5)),
            esc(String(schedule.end_time).slice(0, 5)),
            esc(schedule.room_no)
          ])
        )
      )}
    </div>
  `;
}

/* ATTENDANCE */


async function attendance() {
  const rows = await api("/api/attendance");

  content.innerHTML = `
    <div class="panel">
      <div class="panel-heading">
        <h2>Attendance eligibility</h2>
        <span class="muted">Minimum required: 75%</span>
      </div>

      ${table(
        ["Student ID", "Course ID", "Attended", "Total classes", "Attendance", "Eligibility"],
        rows.map(record => {
          const attended = Number(record.classes_attended || 0);
          const total = Number(record.classes_conducted || 0);
          const percentage = total > 0 ? (attended / total) * 100 : 0;

          return tr([
            esc(record.student_id),
            esc(record.course_id),
            esc(attended),
            esc(total),
            `${percentage.toFixed(2)}%`,
            pill(percentage >= 75 ? "Eligible" : "Not eligible")
          ]);
        })
      )}
    </div>
  `;
}


/* EXAM REGISTRATION STATUS: READ ONLY */


async function registrations() {
  const rows = await api("/api/exam-registrations");

  content.innerHTML = `
    <div class="panel">
      <div class="panel-heading">
        <h2>My Exam Registrations</h2>
        <span class="muted">${rows.length} record(s)</span>
      </div>

      <p class="muted">
        View the registration status of examinations recorded in the database.
      </p>

      ${table(
        ["Registration ID", "Student ID", "Schedule ID", "Registered On", "Status"],
        rows.map(record =>
          tr([
            esc(record.registration_id),
            esc(record.student_id),
            esc(record.schedule_id),
            esc(String(record.registration_date).slice(0, 10)),
            pill(record.status)
          ])
        )
      )}
    </div>
  `;
}


/* PUBLISHED EXAM RESULTS: READ ONLY */


async function results() {
  const rows = await api("/api/results");

  content.innerHTML = `
    <div class="panel">
      <div class="panel-heading">
        <h2>My Examination Results</h2>
        <span class="muted">${rows.length} result(s)</span>
      </div>

      <p class="muted">
        View published examination marks and grade points.
      </p>

      ${table(
        ["Result ID", "Registration ID", "Marks", "Maximum Marks", "Grade Point"],
        rows.map(record =>
          tr([
            esc(record.result_id),
            esc(record.registration_id),
            esc(record.marks_obtained),
            esc(record.max_marks),
            esc(record.grade_point)
          ])
        )
      )}
    </div>
  `;
}


/* SEMESTER PERFORMANCE: READ ONLY */


async function semester() {
  const rows = await api("/api/semester-results");

  const totalCredits = rows.reduce(
    (sum, record) => sum + Number(record.total_credits || 0),
    0
  );

  const totalCreditPoints = rows.reduce(
    (sum, record) => sum + Number(record.total_credit_points || 0),
    0
  );

  const cgpa = totalCredits > 0
    ? totalCreditPoints / totalCredits
    : 0;

  content.innerHTML = `
    <div class="panel">
      <div class="panel-heading">
        <h2>Semester Performance</h2>
        <span class="muted">${rows.length} record(s)</span>
      </div>

      <p class="muted">
        View semester credits, SGPA and calculated CGPA.
      </p>

      <div class="panel">
        <h3>Overall CGPA: ${cgpa.toFixed(2)}</h3>
        <p class="muted">
          CGPA = Total credit points / Total credits
        </p>
      </div>

      ${table(
        ["Student ID", "Semester ID", "Credits", "SGPA", "Credit Points"],
        rows.map(record =>
          tr([
            esc(record.student_id),
            esc(record.semester_id),
            esc(record.total_credits),
            esc(Number(record.sgpa).toFixed(2)),
            esc(record.total_credit_points)
          ])
        )
      )}
    </div>
  `;
}


/* NAVIGATION */

document.querySelectorAll(".nav").forEach(button => {
  button.addEventListener("click", () => render(button.dataset.page));
});

health();
render("dashboard");
