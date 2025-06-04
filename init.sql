CREATE TABLE leave_requests (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(7) NOT NULL,
    employee_name VARCHAR(50) NOT NULL,
    leave_type VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    certificate_path VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    request_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_employee_id CHECK (employee_id ~ '^ATS0[0-9]{3}$' AND employee_id != 'ATS0000'),
    CONSTRAINT valid_leave_type CHECK (leave_type IN ('Annual Leave', 'Sick Leave', 'Personal Leave', 'Maternity Leave', 'Paternity Leave')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'))
);


CREATE INDEX idx_employee_id ON leave_requests(employee_id);
CREATE INDEX idx_status ON leave_requests(status);
CREATE INDEX idx_request_date ON leave_requests(request_date);
