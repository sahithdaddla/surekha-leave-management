const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3600;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
    user: 'postgres',
    host: 'postgres',
    database: 'leave_management',
    password: 'admin123',
    port: 5432,
});

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Ensure uploads directory exists
const fs = require('fs');
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Helper function to validate employee ID
function validateEmployeeId(employeeId) {
    const regex = /^ATS0[0-9]{3}$/;
    return regex.test(employeeId) && employeeId.slice(-3) !== '000';
}

// Helper function to validate employee name
function validateEmployeeName(name) {
    const letterCount = name.replace(/[^a-zA-Z]/g, '').length;
    const containsOnlyLettersAndSingleSpaces = /^[a-zA-Z]+( [a-zA-Z]+)*$/.test(name);
    return letterCount >= 5 && letterCount <= 30 && containsOnlyLettersAndSingleSpaces;
}

// Helper function to validate reason
function validateReason(reason) {
    const charCountExcludingSpaces = reason.replace(/\s/g, '').length;
    const containsValidChars = /^[a-zA-Z][a-zA-Z0-9\s!@#$%^&*()_+\-=\[\]{}\\|;:'",.<>?/~`]*$/.test(reason);
    const noConsecutiveSpecialOrDigits = !/([0-9!@#$%^&*()_+\-=\[\]{}\\|;:'",.<>?/~`])\1/.test(reason);
    const noMultipleSpaces = !/\s{2,}/.test(reason);
    return charCountExcludingSpaces > 0 && charCountExcludingSpaces <= 400 && containsValidChars && noConsecutiveSpecialOrDigits && noMultipleSpaces;
}

// Helper function to validate dates
function validateDates(leaveType, startDate, endDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tenDaysAgo = new Date(today);
    tenDaysAgo.setDate(today.getDate() - 10);
    const twentyDaysLater = new Date(today);
    twentyDaysLater.setDate(today.getDate() + 20);
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(today.getDate() + 30);
    const sixMonthsLater = new Date(today);
    sixMonthsLater.setMonth(today.getMonth() + 6);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    if (start > end) return { valid: false, message: 'End date cannot be earlier than start date' };

    if (leaveType === 'Annual Leave') {
        if (start < today) return { valid: false, message: 'Annual leave start date cannot be in the past' };
        if (start > thirtyDaysLater || end > thirtyDaysLater) return { valid: false, message: 'Annual leave cannot be more than 30 days in the future' };
        if (diffDays > 30) return { valid: false, message: 'Annual leave cannot exceed 30 days' };
    } else if (leaveType === 'Sick Leave') {
        if (start < tenDaysAgo) return { valid: false, message: 'Sick leave start date cannot be more than 10 days in the past' };
        if (start > twentyDaysLater || end > twentyDaysLater) return { valid: false, message: 'Sick leave cannot be more than 20 days in the future' };
        if (diffDays > 30) return { valid: false, message: 'Sick leave cannot exceed 1 month' };
    } else if (leaveType === 'Maternity Leave') {
        if (start < tenDaysAgo) return { valid: false, message: 'Date cannot be more than 10 days in the past' };
        if (start > sixMonthsLater || end > sixMonthsLater) return { valid: false, message: 'Date cannot be more than six months in the future' };
        if (diffDays > 180) return { valid: false, message: 'Maternity leave cannot exceed 6 months' };
    } else if (leaveType === 'Paternity Leave') {
        if (start < tenDaysAgo) return { valid: false, message: 'Date cannot be more than 10 days in the past' };
        if (start > thirtyDaysLater || end > thirtyDaysLater) return { valid: false, message: 'Paternity leave cannot be more than 30 days in the future' };
        if (diffDays > 30) return { valid: false, message: 'Paternity leave cannot exceed 30 days' };
    } else {
        if (start < tenDaysAgo) return { valid: false, message: 'Date cannot be more than 10 days in the past' };
        if (start > sixMonthsLater || end > sixMonthsLater) return { valid: false, message: 'Date cannot be more than six months in the future' };
    }

    return { valid: true };
}

// Submit leave request
app.post('/api/leave-request', upload.single('certificate'), async (req, res) => {
    try {
        const { employeeId, employeeName, leaveType, startDate, endDate, reason } = req.body;
        const certificate = req.file ? req.file.path : null;

        // Validate inputs
        if (!validateEmployeeId(employeeId)) {
            return res.status(400).json({ error: 'Invalid employee ID. Must be ATS0 followed by 3 digits (not all zeros)' });
        }
        if (!validateEmployeeName(employeeName)) {
            return res.status(400).json({ error: 'Invalid employee name. Must contain 5-30 letters, only alphabets with single spaces' });
        }
        if (!['Annual Leave', 'Sick Leave', 'Personal Leave', 'Maternity Leave', 'Paternity Leave'].includes(leaveType)) {
            return res.status(400).json({ error: 'Invalid leave type' });
        }
        if (!validateReason(reason)) {
            return res.status(400).json({ error: 'Invalid reason. Must start with a letter, max 400 chars (excluding spaces), no consecutive special chars or multiple spaces' });
        }
        const dateValidation = validateDates(leaveType, startDate, endDate);
        if (!dateValidation.valid) {
            return res.status(400).json({ error: dateValidation.message });
        }
        if (leaveType === 'Sick Leave') {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            if (diffDays > 7 && !certificate) {
                return res.status(400).json({ error: 'Medical certificate required for sick leave exceeding 7 days' });
            }
        }

        // Check for existing request today
        const today = new Date().toISOString().split('T')[0];
        const existingRequest = await pool.query(
            'SELECT * FROM leave_requests WHERE employee_id = $1 AND DATE(request_date) = $2',
            [employeeId, today]
        );
        if (existingRequest.rows.length > 0) {
            return res.status(400).json({ error: 'You have already submitted a leave request today' });
        }

        // Insert new request
        const result = await pool.query(
            `INSERT INTO leave_requests (employee_id, employee_name, leave_type, start_date, end_date, reason, certificate_path, status, request_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [employeeId, employeeName, leaveType, startDate, endDate, reason, certificate, 'pending', new Date()]
        );

        res.status(201).json({ message: 'Leave request submitted successfully', id: result.rows[0].id });
    } catch (error) {
        console.error('Error submitting leave request:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all leave requests
app.get('/api/leave-requests', async (req, res) => {
    try {
        const { search, status } = req.query;
        let query = 'SELECT * FROM leave_requests';
        let values = [];
        let conditions = [];

        if (search) {
            conditions.push('(employee_name ILIKE $1 OR employee_id ILIKE $1)');
            values.push(`%${search}%`);
        }
        if (status) {
            conditions.push('status = $' + (values.length + 1));
            values.push(status);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching leave requests:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update request status
app.patch('/api/leave-request/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const result = await pool.query(
            'UPDATE leave_requests SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Request not found' });
        }

        res.json({ message: `Leave request ${status} successfully`, request: result.rows[0] });
    } catch (error) {
        console.error('Error updating request status:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete request
app.delete('/api/leave-request/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'SELECT certificate_path FROM leave_requests WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Request not found' });
        }

        const certificatePath = result.rows[0].certificate_path;
        if (certificatePath && fs.existsSync(certificatePath)) {
            fs.unlinkSync(certificatePath);
        }

        await pool.query('DELETE FROM leave_requests WHERE id = $1', [id]);
        res.json({ message: 'Leave request deleted successfully' });
    } catch (error) {
        console.error('Error deleting request:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Clear all records
app.delete('/api/leave-requests', async (req, res) => {
    try {
        const result = await pool.query('SELECT certificate_path FROM leave_requests WHERE certificate_path IS NOT NULL');
        result.rows.forEach(row => {
            if (fs.existsSync(row.certificate_path)) {
                fs.unlinkSync(row.certificate_path);
            }
        });

        await pool.query('DELETE FROM leave_requests');
        res.json({ message: 'All leave requests cleared successfully' });
    } catch (error) {
        console.error('Error clearing requests:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Serve certificate files
app.get('/api/certificate/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT certificate_path FROM leave_requests WHERE id = $1', [id]);

        if (result.rows.length === 0 || !result.rows[0].certificate_path) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        const filePath = result.rows[0].certificate_path;
        if (fs.existsSync(filePath)) {
            res.sendFile(path.resolve(filePath));
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        console.error('Error retrieving certificate:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});