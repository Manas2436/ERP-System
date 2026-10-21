INSERT INTO leave_type(leave_type_id,type_name,annual_days) VALUES(1,'Annual',20),(2,'Sick',10);
INSERT INTO leave_balance(faculty_id,leave_type_id,balance_year,days_remaining) SELECT faculty_id,1,2026,20 FROM faculty WHERE faculty_id<=4;
INSERT INTO leave_balance(faculty_id,leave_type_id,balance_year,days_remaining) SELECT faculty_id,2,2026,10 FROM faculty WHERE faculty_id<=4;
INSERT INTO salary_structure(faculty_id,basic_pay,effective_from) SELECT faculty_id,50000+faculty_id*1000,'2026-01-01' FROM faculty WHERE faculty_id<=4;
INSERT INTO leave_request(faculty_id,leave_type_id,start_date,end_date,days_requested) VALUES(1,1,'2026-10-22','2026-10-23',2);
