const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Branch = require('../models/Branch');
const { authenticateToken, requireBranchAccess } = require('../middleware/auth');

// @route   GET /api/dashboard/stats
// @desc    Get dashboard statistics
// @access  Private
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    let branchFilter = {};
    let branchInfo = null;

    // Determine branch filter based on user role
    if (req.user.role === 'superAdmin') {
      // SuperAdmin can see all stats or specific branch stats
      const { branchId } = req.query;
      if (branchId && branchId !== 'all' && branchId !== '') {
        try {
          // Validate ObjectId format
          const mongoose = require('mongoose');
          if (!mongoose.Types.ObjectId.isValid(branchId)) {
            return res.status(400).json({ message: 'Invalid branch ID format' });
          }

          branchFilter = { branch: branchId };
          branchInfo = await Branch.findById(branchId);
          if (!branchInfo) {
            return res.status(404).json({ message: 'Branch not found' });
          }
        } catch (error) {
          console.error('Branch validation error:', error);
          return res.status(400).json({ message: 'Invalid branch ID' });
        }
      }
    } else {
      // Other users can only see their branch stats
      if (req.user.branch && req.user.branch._id) {
        branchFilter = { branch: req.user.branch._id };
        branchInfo = req.user.branch;
      } else {
        return res.status(400).json({ message: 'User branch information not found' });
      }
    }

    // Get user statistics
    const totalUsers = await User.countDocuments({ 
      ...branchFilter, 
      isActive: true 
    });

    const usersByRole = await User.aggregate([
      { $match: { ...branchFilter, isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    // Get recent users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentUsers = await User.countDocuments({
      ...branchFilter,
      isActive: true,
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Mock financial data (replace with actual financial model when available)
    const mockFinancialData = {
      monthlyRevenue: 750000,
      monthlyExpenses: 480000,
      netProfit: 270000,
      pendingPayments: 125000,
      growthRate: 12.5
    };

    // Get course statistics
    let courseStats = null;
    const Course = require('../models/Course');
    if (req.user.role === 'superAdmin') {
      courseStats = await Course.getStatistics(req.query.branchId, req.user.role);
    } else {
      const userBranchId = req.user.branch._id;
      courseStats = await Course.getStatistics(userBranchId, req.user.role);
    }

    // Mock attendance data (replace with actual attendance model when available)
    const mockAttendanceData = {
      todayAttendance: 85.5,
      weeklyAverage: 87.2,
      monthlyAverage: 86.8,
      totalStudents: 233
    };

    // Get branch statistics if superAdmin viewing all branches
    let branchStats = null;
    if (req.user.role === 'superAdmin' && !req.query.branchId) {
      const totalBranches = await Branch.countDocuments({ isActive: true });
      const totalSystemUsers = await User.countDocuments({ isActive: true });
      
      branchStats = {
        totalBranches,
        totalSystemUsers,
        averageUsersPerBranch: totalBranches > 0 ? Math.round(totalSystemUsers / totalBranches) : 0
      };
    }

    res.json({
      branchInfo: branchInfo ? {
        id: branchInfo._id,
        name: branchInfo.name
      } : null,
      userStats: {
        total: totalUsers,
        recent: recentUsers,
        byRole: usersByRole.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      },
      courseStats,
      financialStats: mockFinancialData,
      attendanceStats: mockAttendanceData,
      branchStats,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ message: 'Server error fetching dashboard statistics' });
  }
});

// @route   GET /api/dashboard/recent-activity
// @desc    Get recent activity for dashboard
// @access  Private
router.get('/recent-activity', authenticateToken, async (req, res) => {
  try {
    let branchFilter = {};

    // Determine branch filter based on user role
    if (req.user.role !== 'superAdmin') {
      branchFilter = { branch: req.user.branch._id };
    } else {
      const { branchId } = req.query;
      if (branchId) {
        branchFilter = { branch: branchId };
      }
    }

    // Get recent user registrations
    const recentUsers = await User.find({
      ...branchFilter,
      isActive: true
    })
    .populate('branch', 'name')
    .populate('createdBy', 'fullName')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('fullName username role createdAt createdBy branch');

    // Format activities
    const activities = recentUsers.map(user => ({
      id: user._id,
      type: 'user_registration',
      message: `New ${user.role} registered: ${user.fullName}`,
      details: {
        username: user.username,
        role: user.role,
        branch: user.branch?.name,
        createdBy: user.createdBy?.fullName
      },
      timestamp: user.createdAt
    }));

    // Mock additional activities (replace with actual data when available)
    const mockActivities = [
      {
        id: 'mock_1',
        type: 'payment',
        message: 'Payment received: LKR 75,000',
        details: { amount: 75000, student: 'Kasun Perera' },
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      },
      {
        id: 'mock_2',
        type: 'attendance',
        message: 'Attendance marked for CS101 class',
        details: { course: 'CS101', present: 28, total: 30 },
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000) // 4 hours ago
      }
    ];

    // Combine and sort activities
    const allActivities = [...activities, ...mockActivities]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 15);

    res.json(allActivities);
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ message: 'Server error fetching recent activity' });
  }
});

// @route   GET /api/dashboard/charts/enrollment
// @desc    Get enrollment trend data for charts
// @access  Private
router.get('/charts/enrollment', authenticateToken, async (req, res) => {
  try {
    let branchFilter = {};

    // Determine branch filter based on user role
    if (req.user.role !== 'superAdmin') {
      branchFilter = { branch: req.user.branch._id.toString() }; // Convert to string for consistency
    } else {
      const { branchId } = req.query;
      if (branchId) {
        branchFilter = { branch: branchId };
      }
    }

    // Get enrollment data for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const enrollmentData = await User.aggregate([
      {
        $match: {
          ...branchFilter,
          isActive: true,
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Format data for charts
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = enrollmentData.map(item => ({
      month: months[item._id.month - 1],
      year: item._id.year,
      newUsers: item.count
    }));

    res.json(chartData);
  } catch (error) {
    console.error('Get enrollment chart data error:', error);
    res.status(500).json({ message: 'Server error fetching enrollment data' });
  }
});

// @route   GET /api/dashboard/charts/users-by-role
// @desc    Get user distribution by role for charts
// @access  Private
router.get('/charts/users-by-role', authenticateToken, async (req, res) => {
  try {
    let branchFilter = {};

    // Determine branch filter based on user role
    if (req.user.role !== 'superAdmin') {
      branchFilter = { branch: req.user.branch._id.toString() }; // Convert to string for consistency
    } else {
      const { branchId } = req.query;
      if (branchId) {
        branchFilter = { branch: branchId };
      }
    }

    const roleDistribution = await User.aggregate([
      { $match: { ...branchFilter, isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Format data for pie chart
    const colors = {
      admin: '#3B82F6',
      moderator: '#10B981',
      staff: '#F59E0B',
      superAdmin: '#EF4444'
    };

    const chartData = roleDistribution.map(item => ({
      name: item._id.charAt(0).toUpperCase() + item._id.slice(1),
      value: item.count,
      color: colors[item._id] || '#8B5CF6'
    }));

    res.json(chartData);
  } catch (error) {
    console.error('Get role distribution chart data error:', error);
    res.status(500).json({ message: 'Server error fetching role distribution data' });
  }
});

module.exports = router;
