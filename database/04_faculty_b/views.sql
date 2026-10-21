CREATE OR REPLACE VIEW vw_leave_balance AS SELECT f.faculty_id,f.employee_code,lt.type_name,lb.balance_year,lb.days_remaining FROM leave_balance lb JOIN faculty f ON f.faculty_id=lb.faculty_id JOIN leave_type lt ON lt.leave_type_id=lb.leave_type_id;
CREATE OR REPLACE VIEW vw_payroll_summary AS SELECT p.*,ROUND(p.net_pay,2) take_home FROM payroll p;
