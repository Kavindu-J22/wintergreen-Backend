const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Branch = require('../models/Branch');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Attendance = require('../models/Attendance');
const { authenticateToken } = require('../middleware/auth');
const XLSX = require('xlsx');

// Helper function to determine branch filter based on user role
const getBranchFilter = (req) => {
  const mongoose = require('mongoose');
  let branchFilter = {};

  if (req.user.role === 'superAdmin') {
    // SuperAdmin can see all stats or specific branch stats
    const { branchId } = req.query;
    if (branchId && branchId !== 'all' && branchId !== '') {
      // Validate ObjectId format
      if (mongoose.Types.ObjectId.isValid(branchId)) {
        branchFilter = { branch: branchId };
      } else {
        console.warn('Invalid branch ID format in getBranchFilter:', branchId);
      }
    }
  } else {
    // Other users can only see their branch stats
    if (req.user.branch && req.user.branch._id) {
      branchFilter = { branch: req.user.branch._id };
    }
  }

  return branchFilter;
};

// Helper function to get date range filters
const getDateRangeFilter = (req) => {
  const { startDate, endDate } = req.query;
  let dateFilter = {};

  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) {
      dateFilter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.createdAt.$lte = new Date(endDate);
    }
  }

  return dateFilter;
};

// @route   GET /api/reports/comprehensive
// @desc    Get comprehensive report data
// @access  Private
router.get('/comprehensive', authenticateToken, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req);
    const dateFilter = getDateRangeFilter(req);
    
    // Get all statistics in parallel
    const [
      userStats,
      studentStats,
      courseStats,
      transactionStats,
      budgetStats
    ] = await Promise.all([
      // User statistics
      User.aggregate([
        { $match: { ...branchFilter, isActive: true, ...dateFilter } },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            byRole: {
              $push: {
                role: '$role',
                count: 1
              }
            }
          }
        }
      ]),
      
      // Student statistics
      req.user.role === 'superAdmin'
        ? Student.getStatistics(
            (req.query.branchId && req.query.branchId !== 'all' && req.query.branchId !== '') ? req.query.branchId : null,
            req.user.role
          )
        : Student.getStatistics(req.user.branch._id, req.user.role),

      // Course statistics
      req.user.role === 'superAdmin'
        ? Course.getStatistics(
            (req.query.branchId && req.query.branchId !== 'all' && req.query.branchId !== '') ? req.query.branchId : null,
            req.user.role
          )
        : Course.getStatistics(req.user.branch._id, req.user.role),

      // Transaction statistics
      req.user.role === 'superAdmin'
        ? Transaction.getStatistics(
            (req.query.branchId && req.query.branchId !== 'all' && req.query.branchId !== '') ? req.query.branchId : null,
            req.user.role,
            { startDate: req.query.startDate, endDate: req.query.endDate }
          )
        : Transaction.getStatistics(req.user.branch._id, req.user.role, { startDate: req.query.startDate, endDate: req.query.endDate }),

      // Budget statistics
      req.user.role === 'superAdmin'
        ? Budget.getStatistics(
            (req.query.branchId && req.query.branchId !== 'all' && req.query.branchId !== '') ? req.query.branchId : null,
            req.user.role,
            { period: req.query.period }
          )
        : Budget.getStatistics(req.user.branch._id, req.user.role, { period: req.query.period })
    ]);

    // Process user role distribution
    const roleDistribution = {};
    if (userStats.length > 0 && userStats[0].byRole) {
      userStats[0].byRole.forEach(item => {
        roleDistribution[item.role] = (roleDistribution[item.role] || 0) + 1;
      });
    }

    // Get branch info if applicable
    let branchInfo = null;
    if (req.user.role === 'superAdmin' && req.query.branchId && req.query.branchId !== 'all' && req.query.branchId !== '') {
      try {
        const mongoose = require('mongoose');
        if (mongoose.Types.ObjectId.isValid(req.query.branchId)) {
          branchInfo = await Branch.findById(req.query.branchId);
        }
      } catch (error) {
        console.error('Error finding branch:', error);
      }
    } else if (req.user.role !== 'superAdmin') {
      branchInfo = req.user.branch;
    }

    const comprehensiveReport = {
      branchInfo: branchInfo ? {
        id: branchInfo._id,
        name: branchInfo.name
      } : null,
      userStats: {
        total: userStats.length > 0 ? userStats[0].totalUsers : 0,
        byRole: roleDistribution
      },
      studentStats: studentStats || {
        totalStudents: 0,
        activeStudents: 0,
        graduatedStudents: 0,
        averageGPA: 0
      },
      courseStats: courseStats || {
        totalCourses: 0,
        activeCourses: 0,
        totalEnrolled: 0,
        totalRevenue: 0,
        averagePrice: 0,
        totalCapacity: 0
      },
      transactionStats: transactionStats || {
        totalTransactions: 0,
        totalIncome: 0,
        totalExpenses: 0,
        pendingIncome: 0,
        pendingExpenses: 0,
        pendingTransactions: 0,
        netProfit: 0
      },
      budgetStats: budgetStats || {
        totalBudgets: 0,
        totalAllocated: 0,
        totalSpent: 0,
        activeBudgets: 0,
        exceededBudgets: 0,
        totalRemaining: 0,
        overallUtilization: 0
      },
      generatedAt: new Date().toISOString(),
      filters: {
        branchId: req.query.branchId || null,
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null,
        period: req.query.period || null
      }
    };

    res.json(comprehensiveReport);
  } catch (error) {
    console.error('Get comprehensive report error:', error);
    res.status(500).json({ message: 'Server error fetching comprehensive report' });
  }
});

// @route   GET /api/reports/student-performance
// @desc    Get student performance report
// @access  Private
router.get('/student-performance', authenticateToken, async (req, res) => {
  try {
    const branchId = req.user.role === 'superAdmin' ? req.query.branchId : req.user.branch._id.toString();
    
    const [studentStats, courseStats] = await Promise.all([
      Student.getStatistics(branchId, req.user.role),
      Course.getStatistics(branchId, req.user.role)
    ]);

    const report = {
      totalStudents: studentStats.totalStudents || 0,
      activeStudents: studentStats.activeStudents || 0,
      graduatedStudents: studentStats.graduatedStudents || 0,
      averageGPA: studentStats.averageGPA || 0,
      totalCourses: courseStats.totalCourses || 0,
      activeCourses: courseStats.activeCourses || 0,
      totalEnrolled: courseStats.totalEnrolled || 0,
      averageEnrollmentPerCourse: courseStats.totalCourses > 0 ? Math.round(courseStats.totalEnrolled / courseStats.totalCourses) : 0,
      generatedAt: new Date().toISOString()
    };

    res.json(report);
  } catch (error) {
    console.error('Get student performance report error:', error);
    res.status(500).json({ message: 'Server error fetching student performance report' });
  }
});

// @route   GET /api/reports/financial-summary
// @desc    Get financial summary report
// @access  Private
router.get('/financial-summary', authenticateToken, async (req, res) => {
  try {
    const branchId = req.user.role === 'superAdmin' ? req.query.branchId : req.user.branch._id.toString();
    
    const [transactionStats, budgetStats] = await Promise.all([
      Transaction.getStatistics(branchId, req.user.role, { 
        startDate: req.query.startDate, 
        endDate: req.query.endDate 
      }),
      Budget.getStatistics(branchId, req.user.role, { 
        period: req.query.period 
      })
    ]);

    const report = {
      totalIncome: transactionStats.totalIncome || 0,
      totalExpenses: transactionStats.totalExpenses || 0,
      netProfit: transactionStats.netProfit || 0,
      pendingIncome: transactionStats.pendingIncome || 0,
      pendingExpenses: transactionStats.pendingExpenses || 0,
      totalBudgets: budgetStats.totalBudgets || 0,
      totalAllocated: budgetStats.totalAllocated || 0,
      totalSpent: budgetStats.totalSpent || 0,
      budgetUtilization: budgetStats.overallUtilization || 0,
      generatedAt: new Date().toISOString()
    };

    res.json(report);
  } catch (error) {
    console.error('Get financial summary report error:', error);
    res.status(500).json({ message: 'Server error fetching financial summary report' });
  }
});

// @route   GET /api/reports/attendance-summary
// @desc    Get attendance summary report
// @access  Private
router.get('/attendance-summary', authenticateToken, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req);
    
    // Get attendance statistics (mock data for now - replace with actual attendance model)
    const attendanceStats = {
      todayAttendance: 85.5,
      weeklyAverage: 87.2,
      monthlyAverage: 86.8,
      totalStudents: 233,
      attendanceTrend: 87.2 > 86.8 ? 'improving' : 'declining',
      generatedAt: new Date().toISOString()
    };

    res.json(attendanceStats);
  } catch (error) {
    console.error('Get attendance summary report error:', error);
    res.status(500).json({ message: 'Server error fetching attendance summary report' });
  }
});

// @route   GET /api/reports/export
// @desc    Export report data to Excel
// @access  Private
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { type, format } = req.query;
    const branchId = req.user.role === 'superAdmin' ? req.query.branchId : req.user.branch._id.toString();

    let reportData = {};
    let filename = 'report';

    switch (type) {
      case 'comprehensive':
        // Get comprehensive report data
        const [studentStats, courseStats, transactionStats, budgetStats] = await Promise.all([
          Student.getStatistics(branchId, req.user.role),
          Course.getStatistics(branchId, req.user.role),
          Transaction.getStatistics(branchId, req.user.role, {
            startDate: req.query.startDate,
            endDate: req.query.endDate
          }),
          Budget.getStatistics(branchId, req.user.role, { period: req.query.period })
        ]);

        reportData = {
          'Student Statistics': [
            { Metric: 'Total Students', Value: studentStats.totalStudents || 0 },
            { Metric: 'Active Students', Value: studentStats.activeStudents || 0 },
            { Metric: 'Graduated Students', Value: studentStats.graduatedStudents || 0 },
            { Metric: 'Average GPA', Value: studentStats.averageGPA || 0 }
          ],
          'Course Statistics': [
            { Metric: 'Total Courses', Value: courseStats.totalCourses || 0 },
            { Metric: 'Active Courses', Value: courseStats.activeCourses || 0 },
            { Metric: 'Total Enrolled', Value: courseStats.totalEnrolled || 0 },
            { Metric: 'Total Revenue', Value: courseStats.totalRevenue || 0 }
          ],
          'Financial Statistics': [
            { Metric: 'Total Income', Value: transactionStats.totalIncome || 0 },
            { Metric: 'Total Expenses', Value: transactionStats.totalExpenses || 0 },
            { Metric: 'Net Profit', Value: transactionStats.netProfit || 0 },
            { Metric: 'Pending Income', Value: transactionStats.pendingIncome || 0 }
          ],
          'Budget Statistics': [
            { Metric: 'Total Budgets', Value: budgetStats.totalBudgets || 0 },
            { Metric: 'Total Allocated', Value: budgetStats.totalAllocated || 0 },
            { Metric: 'Total Spent', Value: budgetStats.totalSpent || 0 },
            { Metric: 'Budget Utilization %', Value: budgetStats.overallUtilization || 0 }
          ]
        };
        filename = 'comprehensive_report';
        break;

      case 'students':
        const studentData = await Student.getStatistics(branchId, req.user.role);
        reportData = {
          'Student Report': [
            { Metric: 'Total Students', Value: studentData.totalStudents || 0 },
            { Metric: 'Active Students', Value: studentData.activeStudents || 0 },
            { Metric: 'Graduated Students', Value: studentData.graduatedStudents || 0 },
            { Metric: 'Average GPA', Value: studentData.averageGPA || 0 }
          ]
        };
        filename = 'student_report';
        break;

      case 'courses':
        const courseData = await Course.getStatistics(branchId, req.user.role);
        reportData = {
          'Course Report': [
            { Metric: 'Total Courses', Value: courseData.totalCourses || 0 },
            { Metric: 'Active Courses', Value: courseData.activeCourses || 0 },
            { Metric: 'Total Enrolled', Value: courseData.totalEnrolled || 0 },
            { Metric: 'Total Revenue', Value: courseData.totalRevenue || 0 },
            { Metric: 'Average Price', Value: courseData.averagePrice || 0 },
            { Metric: 'Total Capacity', Value: courseData.totalCapacity || 0 }
          ]
        };
        filename = 'course_report';
        break;

      case 'financial':
        const [transData, budgetData] = await Promise.all([
          Transaction.getStatistics(branchId, req.user.role, {
            startDate: req.query.startDate,
            endDate: req.query.endDate
          }),
          Budget.getStatistics(branchId, req.user.role, { period: req.query.period })
        ]);

        reportData = {
          'Financial Report': [
            { Metric: 'Total Income', Value: transData.totalIncome || 0 },
            { Metric: 'Total Expenses', Value: transData.totalExpenses || 0 },
            { Metric: 'Net Profit', Value: transData.netProfit || 0 },
            { Metric: 'Pending Income', Value: transData.pendingIncome || 0 },
            { Metric: 'Pending Expenses', Value: transData.pendingExpenses || 0 },
            { Metric: 'Total Budgets', Value: budgetData.totalBudgets || 0 },
            { Metric: 'Budget Utilization %', Value: budgetData.overallUtilization || 0 }
          ]
        };
        filename = 'financial_report';
        break;

      case 'attendance':
        // Mock attendance data - replace with actual attendance statistics
        reportData = {
          'Attendance Report': [
            { Metric: 'Today Attendance %', Value: 85.5 },
            { Metric: 'Weekly Average %', Value: 87.2 },
            { Metric: 'Monthly Average %', Value: 86.8 },
            { Metric: 'Total Students', Value: 233 }
          ]
        };
        filename = 'attendance_report';
        break;

      default:
        return res.status(400).json({ message: 'Invalid report type' });
    }

    if (format === 'excel') {
      // Create Excel workbook
      const workbook = XLSX.utils.book_new();

      Object.keys(reportData).forEach(sheetName => {
        const worksheet = XLSX.utils.json_to_sheet(reportData[sheetName]);

        // Auto-size columns
        const colWidths = Object.keys(reportData[sheetName][0] || {}).map(key => ({
          wch: Math.max(key.length, ...reportData[sheetName].map(row => String(row[key] || '').length)) + 2
        }));
        worksheet['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      });

      // Generate Excel buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}_${new Date().toISOString().split('T')[0]}.xlsx"`);

      // Send the Excel file
      res.send(excelBuffer);
    } else {
      // Return JSON data
      res.json(reportData);
    }
  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({ message: 'Server error exporting report' });
  }
});

module.exports = router;
