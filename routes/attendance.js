const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Branch = require('../models/Branch');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validationRules, handleValidationErrors } = require('../utils/validation');
const ExcelJS = require('exceljs');

// @route   GET /api/attendance
// @desc    Get attendance records with filtering
// @access  Private (All authenticated users)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      courseId,
      branchId,
      studentId,
      date,
      dateFrom,
      dateTo,
      status,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Build filters based on user role
    const filters = {
      courseId,
      branchId,
      studentId,
      date,
      dateFrom,
      dateTo,
      status,
      userRole: req.user.role,
      userBranchId: req.user.branch?._id
    };

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    if (sortBy !== 'createdAt') {
      sort.createdAt = -1; // Secondary sort
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort
    };

    // Get attendance records
    const attendanceRecords = await Attendance.getFilteredAttendance(filters, options);

    // Get total count for pagination
    let countQuery = { isActive: true };
    if (filters.courseId) countQuery.course = filters.courseId;
    if (filters.studentId) countQuery.student = filters.studentId;
    if (filters.status) countQuery.status = filters.status;
    
    if (filters.date) {
      countQuery.date = new Date(filters.date);
    } else if (filters.dateFrom || filters.dateTo) {
      countQuery.date = {};
      if (filters.dateFrom) countQuery.date.$gte = new Date(filters.dateFrom);
      if (filters.dateTo) countQuery.date.$lte = new Date(filters.dateTo);
    }

    // Apply branch filtering - use user's currently logged branch
    if (req.user.branch) {
      countQuery.branch = req.user.branch._id;
    }

    const totalRecords = await Attendance.countDocuments(countQuery);
    const totalPages = Math.ceil(totalRecords / options.limit);

    res.json({
      attendanceRecords,
      pagination: {
        currentPage: options.page,
        totalPages,
        totalRecords,
        hasNext: options.page < totalPages,
        hasPrev: options.page > 1
      }
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ message: 'Server error fetching attendance records' });
  }
});

// @route   GET /api/attendance/students/:courseId
// @desc    Get students enrolled in a course for attendance marking
// @access  Private (All authenticated users)
router.get('/students/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { date, branchId } = req.query;

    // Verify course exists and user has access
    const course = await Course.findById(courseId);
    if (!course || !course.isActive) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user has access to this course
    if (req.user.branch && course.branch !== 'all' && course.branch.toString() !== req.user.branch._id.toString()) {
      return res.status(403).json({ message: 'Access denied to this course' });
    }

    // Build student query
    let studentQuery = {
      course: courseId,
      isActive: true,
      status: 'Active'
    };

    // Apply branch filtering - use user's currently logged branch
    if (req.user.branch) {
      studentQuery.branch = req.user.branch._id;
    }

    // Get enrolled students
    const students = await Student.find(studentQuery)
      .populate('course', 'title')
      .populate('branch', 'name')
      .sort({ fullName: 1 });

    // If date is provided, get existing attendance records
    let attendanceRecords = [];
    if (date) {
      attendanceRecords = await Attendance.find({
        course: courseId,
        date: new Date(date),
        isActive: true
      }).populate('student', '_id');
    }

    // Map students with their attendance status
    const studentsWithAttendance = students.map(student => {
      const attendance = attendanceRecords.find(
        record => record.student._id.toString() === student._id.toString()
      );

      return {
        _id: student._id,
        studentId: student.studentId,
        fullName: student.fullName,
        email: student.email,
        course: student.course,
        branch: student.branch,
        attendance: attendance ? {
          status: attendance.status,
          timeIn: attendance.timeIn,
          notes: attendance.notes
        } : null,
        savedAttendance: attendance ? {
          status: attendance.status,
          timeIn: attendance.timeIn,
          notes: attendance.notes
        } : null
      };
    });

    res.json({
      course: {
        _id: course._id,
        title: course.title
      },
      students: studentsWithAttendance,
      totalStudents: studentsWithAttendance.length
    });
  } catch (error) {
    console.error('Get course students error:', error);
    res.status(500).json({ message: 'Server error fetching course students' });
  }
});

// @route   POST /api/attendance
// @desc    Mark attendance for a student
// @access  Private (SuperAdmin, Admin, Moderator)
router.post('/', authenticateToken, requireRole('superAdmin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { student, course, date, status, timeIn, notes } = req.body;

    // Validate required fields
    if (!student || !course || !date || !status) {
      return res.status(400).json({ message: 'Student, course, date, and status are required' });
    }

    // Validate status
    if (!['Present', 'Absent', 'Late', 'Excused'].includes(status)) {
      return res.status(400).json({ message: 'Invalid attendance status' });
    }

    // Get student and course details
    const studentDoc = await Student.findById(student).populate('branch', '_id name');
    const courseDoc = await Course.findById(course);

    if (!studentDoc || !studentDoc.isActive) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!courseDoc || !courseDoc.isActive) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check access permissions
    if (req.user.role !== 'superAdmin') {
      if (studentDoc.branch._id.toString() !== req.user.branch._id.toString()) {
        return res.status(403).json({ message: 'Access denied to this student' });
      }
    }

    // Check if attendance already exists
    const existingAttendance = await Attendance.findOne({
      student,
      course,
      date: new Date(date)
    });

    if (existingAttendance) {
      // Update existing attendance
      existingAttendance.status = status;
      existingAttendance.timeIn = timeIn;
      existingAttendance.notes = notes;
      existingAttendance.lastModifiedBy = req.user._id;
      
      await existingAttendance.save();
      
      await existingAttendance.populate([
        { path: 'student', select: 'studentId fullName email' },
        { path: 'course', select: 'title' },
        { path: 'branch', select: 'name' },
        { path: 'markedBy', select: 'fullName username' },
        { path: 'lastModifiedBy', select: 'fullName username' }
      ]);

      return res.json({
        message: 'Attendance updated successfully',
        attendance: existingAttendance
      });
    } else {
      // Create new attendance record
      const attendance = new Attendance({
        student,
        course,
        branch: studentDoc.branch._id,
        date: new Date(date),
        status,
        timeIn,
        notes,
        markedBy: req.user._id
      });

      await attendance.save();
      
      await attendance.populate([
        { path: 'student', select: 'studentId fullName email' },
        { path: 'course', select: 'title' },
        { path: 'branch', select: 'name' },
        { path: 'markedBy', select: 'fullName username' }
      ]);

      return res.status(201).json({
        message: 'Attendance marked successfully',
        attendance
      });
    }
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ message: 'Server error marking attendance' });
  }
});

// @route   POST /api/attendance/bulk
// @desc    Bulk mark attendance for multiple students
// @access  Private (SuperAdmin, Admin, Moderator)
router.post('/bulk', authenticateToken, requireRole('superAdmin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { attendanceRecords } = req.body;

    if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
      return res.status(400).json({ message: 'Attendance records array is required' });
    }

    // Validate each record
    for (const record of attendanceRecords) {
      if (!record.student || !record.course || !record.date || !record.status) {
        return res.status(400).json({ message: 'Each record must have student, course, date, and status' });
      }
      
      if (!['Present', 'Absent', 'Late', 'Excused'].includes(record.status)) {
        return res.status(400).json({ message: 'Invalid attendance status in one or more records' });
      }
    }

    // Get all students to validate branch access
    const studentIds = [...new Set(attendanceRecords.map(r => r.student))];
    const students = await Student.find({ _id: { $in: studentIds } }).populate('branch', '_id');

    // Check access permissions for non-superAdmin users
    if (req.user.role !== 'superAdmin') {
      const unauthorizedStudents = students.filter(
        student => student.branch._id.toString() !== req.user.branch._id.toString()
      );
      
      if (unauthorizedStudents.length > 0) {
        return res.status(403).json({ message: 'Access denied to some students' });
      }
    }

    // Add branch information to attendance records
    const recordsWithBranch = attendanceRecords.map(record => {
      const student = students.find(s => s._id.toString() === record.student);
      return {
        ...record,
        branch: student.branch._id
      };
    });

    // Bulk upsert attendance records
    const result = await Attendance.bulkUpsertAttendance(recordsWithBranch, req.user._id);

    res.json({
      message: 'Bulk attendance operation completed successfully',
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
      matchedCount: result.matchedCount
    });
  } catch (error) {
    console.error('Bulk attendance error:', error);
    res.status(500).json({ message: 'Server error processing bulk attendance' });
  }
});

// @route   PUT /api/attendance/:id
// @desc    Update attendance record
// @access  Private (SuperAdmin, Admin, Moderator)
router.put('/:id', authenticateToken, requireRole('superAdmin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { status, timeIn, notes } = req.body;

    const attendance = await Attendance.findById(req.params.id)
      .populate('student', 'branch')
      .populate('branch', '_id name');

    if (!attendance || !attendance.isActive) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // Check if user can modify this attendance record
    if (!attendance.canModify(req.user.role, req.user.branch?._id)) {
      return res.status(403).json({ message: 'Access denied to modify this attendance record' });
    }

    // Update fields
    if (status) {
      if (!['Present', 'Absent', 'Late', 'Excused'].includes(status)) {
        return res.status(400).json({ message: 'Invalid attendance status' });
      }
      attendance.status = status;
    }

    if (timeIn !== undefined) attendance.timeIn = timeIn;
    if (notes !== undefined) attendance.notes = notes;
    attendance.lastModifiedBy = req.user._id;

    await attendance.save();

    await attendance.populate([
      { path: 'student', select: 'studentId fullName email' },
      { path: 'course', select: 'title' },
      { path: 'branch', select: 'name' },
      { path: 'markedBy', select: 'fullName username' },
      { path: 'lastModifiedBy', select: 'fullName username' }
    ]);

    res.json({
      message: 'Attendance updated successfully',
      attendance
    });
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({ message: 'Server error updating attendance' });
  }
});

// @route   DELETE /api/attendance/:id
// @desc    Delete attendance record (soft delete)
// @access  Private (SuperAdmin, Admin)
router.delete('/:id', authenticateToken, requireRole('superAdmin', 'admin'), async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('student', 'branch');

    if (!attendance || !attendance.isActive) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // Check access permissions for non-superAdmin users
    if (req.user.role !== 'superAdmin') {
      if (attendance.branch.toString() !== req.user.branch._id.toString()) {
        return res.status(403).json({ message: 'Access denied to delete this attendance record' });
      }
    }

    // Soft delete
    attendance.isActive = false;
    attendance.lastModifiedBy = req.user._id;
    await attendance.save();

    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    console.error('Delete attendance error:', error);
    res.status(500).json({ message: 'Server error deleting attendance' });
  }
});

// @route   GET /api/attendance/stats/:courseId
// @desc    Get attendance statistics for a course
// @access  Private (All authenticated users)
router.get('/stats/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { date, branchId } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    // Verify course exists and user has access
    const course = await Course.findById(courseId);
    if (!course || !course.isActive) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Use the user's currently logged branch for all users (including superAdmin)
    let targetBranchId = req.user.branch ? req.user.branch._id : null;

    // Check if user has access to this course
    if (targetBranchId && course.branch !== 'all' && course.branch.toString() !== targetBranchId.toString()) {
      return res.status(403).json({ message: 'Access denied to this course' });
    }

    // Get attendance statistics
    const stats = await Attendance.getAttendanceStats(courseId, date, targetBranchId);

    // Get total enrolled students for the course
    let studentQuery = { course: courseId, isActive: true, status: 'Active' };
    if (targetBranchId) {
      studentQuery.branch = targetBranchId;
    }
    const totalEnrolled = await Student.countDocuments(studentQuery);

    res.json({
      course: {
        _id: course._id,
        title: course.title
      },
      date,
      stats: {
        ...stats,
        totalEnrolled,
        notMarked: totalEnrolled - stats.total
      }
    });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ message: 'Server error fetching attendance statistics' });
  }
});

// @route   GET /api/attendance/export
// @desc    Export attendance records to Excel
// @access  Private (All authenticated users)
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const {
      courseId,
      branchId,
      dateFrom,
      dateTo,
      status,
      format = 'xlsx'
    } = req.query;

    if (!courseId) {
      return res.status(400).json({ message: 'Course ID is required for export' });
    }

    // Build filters
    const filters = {
      courseId,
      branchId,
      dateFrom,
      dateTo,
      status,
      userRole: req.user.role,
      userBranchId: req.user.branch?._id
    };

    // Get all attendance records (no pagination for export)
    const attendanceRecords = await Attendance.getFilteredAttendance(filters, { limit: 10000 });

    if (attendanceRecords.length === 0) {
      return res.status(404).json({ message: 'No attendance records found for export' });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Report');

    // Set up headers
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Student ID', key: 'studentId', width: 15 },
      { header: 'Student Name', key: 'studentName', width: 25 },
      { header: 'Course', key: 'course', width: 20 },
      { header: 'Branch', key: 'branch', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Time In', key: 'timeIn', width: 10 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Marked By', key: 'markedBy', width: 20 }
    ];

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    attendanceRecords.forEach(record => {
      worksheet.addRow({
        date: record.formattedDate,
        studentId: record.student.studentId,
        studentName: record.student.fullName,
        course: record.course.title,
        branch: record.branch.name,
        status: record.status,
        timeIn: record.formattedTime,
        notes: record.notes || '',
        markedBy: record.markedBy.fullName
      });
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = Math.max(column.width, 10);
    });

    // Set response headers
    const filename = `attendance_report_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export attendance error:', error);
    res.status(500).json({ message: 'Server error exporting attendance records' });
  }
});

module.exports = router;
