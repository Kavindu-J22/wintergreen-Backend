const express = require('express');
const mongoose = require('mongoose');
const { body } = require('express-validator');
const router = express.Router();
const User = require('../models/User');
const Branch = require('../models/Branch');
const { validationRules, handleValidationErrors } = require('../utils/validation');
const { 
  authenticateToken, 
  requireSuperAdmin, 
  requireRole,
  requireBranchAdmin,
  validateBranchOwnership 
} = require('../middleware/auth');

// @route   GET /api/users/branch-users
// @desc    Get branch users (for branch-specific user management)
// @access  Private (Admin, Moderator, Staff)
router.get('/branch-users', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = '' } = req.query;

    // Build query based on user role
    let query = { isActive: true };

    if (req.user.role === 'superAdmin') {
      // SuperAdmin can see all users
    } else if (req.user.role === 'admin') {
      // Admin can see users in their branch, but not superAdmin users
      query.branch = req.user.branch._id;
      query.role = { $ne: 'superAdmin' };
    } else {
      // Moderators and staff can only see users in their branch, but not superAdmin users
      query.branch = req.user.branch._id;
      query.role = { $ne: 'superAdmin' };
    }

    // Add search filter
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Add role filter (but preserve the superAdmin exclusion for non-superAdmin users)
    if (role) {
      if (req.user.role === 'superAdmin') {
        query.role = role;
      } else {
        // For non-superAdmin users, combine role filter with superAdmin exclusion
        query.role = { $and: [{ $ne: 'superAdmin' }, { $eq: role }] };
      }
    }

    const users = await User.find(query)
      .populate('branch', 'name')
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    // Transform users to use 'id' instead of '_id'
    const transformedUsers = users.map(user => ({
      id: user._id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      role: user.role,
      branch: user.branch ? {
        id: user.branch._id,
        name: user.branch.name
      } : null,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));

    res.json({
      users: transformedUsers,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching branch users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users
// @desc    Get all users (SuperAdmin) or branch users (Admin)
// @access  Private (SuperAdmin, Admin)
router.get('/', authenticateToken, requireRole('superAdmin', 'admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = '', branchId = '' } = req.query;
    const skip = (page - 1) * limit;

    // Build search query
    let searchQuery = {};

    // Text search
    if (search) {
      searchQuery.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { nicOrPassport: { $regex: search, $options: 'i' } }
      ];
    }

    // Role filter
    if (role) {
      searchQuery.role = role;
    }

    // Branch access control
    if (req.user.role === 'superAdmin') {
      // SuperAdmin can see all users or filter by branch
      if (branchId) {
        searchQuery.branch = branchId;
      }
    } else if (req.user.role === 'admin') {
      // Admin can only see users from their branch
      searchQuery.branch = req.user.branch._id;
    }

    // Get users with pagination
    const users = await User.find(searchQuery)
      .populate('branch', 'name')
      .populate('createdBy', 'fullName username')
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(searchQuery);

    // Transform users to use 'id' instead of '_id'
    const transformedUsers = users.map(user => ({
      id: user._id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      role: user.role,
      branch: user.branch ? {
        id: user.branch._id,
        name: user.branch.name
      } : null,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));

    res.json({
      users: transformedUsers,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error fetching users' });
  }
});

// @route   GET /api/users/branch/:branchId
// @desc    Get users by branch
// @access  Private (SuperAdmin, Branch Admin/Moderator/Staff)
router.get('/branch/:branchId', authenticateToken, [
  ...validationRules.branchId,
  handleValidationErrors
], async (req, res) => {
  try {
    const { branchId } = req.params;

    // Check access permissions
    if (req.user.role !== 'superAdmin' && req.user.branch._id.toString() !== branchId) {
      return res.status(403).json({ message: 'Access denied to this branch' });
    }

    const users = await User.findByBranch(branchId);

    res.json(users);
  } catch (error) {
    console.error('Get branch users error:', error);
    res.status(500).json({ message: 'Server error fetching branch users' });
  }
});

// @route   GET /api/users/:id
// @desc    Get single user
// @access  Private (SuperAdmin, Admin)
router.get('/:id', authenticateToken, requireRole('superAdmin', 'admin'), [
  ...validationRules.userId,
  handleValidationErrors
], async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('branch', 'name')
      .populate('createdBy', 'fullName username')
      .select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check access permissions for admin
    if (req.user.role === 'admin' && user.branch._id.toString() !== req.user.branch._id.toString()) {
      return res.status(403).json({ message: 'Access denied to this user' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error fetching user' });
  }
});

// @route   POST /api/users
// @desc    Create new user
// @access  Private (SuperAdmin, Admin)
router.post('/', authenticateToken, requireRole('superAdmin', 'admin'), [
  ...validationRules.userRegistration,
  handleValidationErrors
], async (req, res) => {
  try {
    const { fullName, nicOrPassport, contactNumber, email, username, password, role, branch } = req.body;

    // Validate branch access for non-superAdmin users
    if (req.user.role !== 'superAdmin') {
      if (!branch || branch !== req.user.branch._id.toString()) {
        return res.status(400).json({ message: 'Invalid branch selection' });
      }
      
      // Admin cannot create other admins
      if (role === 'admin') {
        return res.status(403).json({ message: 'Cannot create admin users' });
      }
    }

    // Check if branch exists and is active
    if (branch) {
      const branchDoc = await Branch.findById(branch);
      if (!branchDoc || !branchDoc.isActive) {
        return res.status(400).json({ message: 'Invalid or inactive branch' });
      }
    }

    // Check for existing username, email, or NIC/Passport
    const existingUser = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: email.toLowerCase() },
        { nicOrPassport }
      ]
    });

    if (existingUser) {
      if (existingUser.username === username.toLowerCase()) {
        return res.status(400).json({ message: 'Username already exists' });
      }
      if (existingUser.email === email.toLowerCase()) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      if (existingUser.nicOrPassport === nicOrPassport) {
        return res.status(400).json({ message: 'NIC or Passport already exists' });
      }
    }

    // Create new user
    const user = new User({
      fullName: fullName.trim(),
      nicOrPassport: nicOrPassport.trim(),
      contactNumber: contactNumber.trim(),
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      password,
      role,
      branch: branch || null,
      createdBy: req.user._id
    });

    await user.save();

    // Populate fields for response
    await user.populate('branch', 'name');
    await user.populate('createdBy', 'fullName username');

    res.status(201).json({
      message: 'User created successfully',
      user: {
        ...user.toJSON(),
        password: undefined
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error creating user' });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private (SuperAdmin, Admin)
router.put('/:id', authenticateToken, requireRole('superAdmin', 'admin'), [
  ...validationRules.userId,
  ...validationRules.userUpdate,
  handleValidationErrors
], async (req, res) => {
  try {
    const { fullName, nicOrPassport, contactNumber, email, role, isActive } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check access permissions
    if (req.user.role === 'admin') {
      // Admin can only update users in their branch
      if (user.branch.toString() !== req.user.branch._id.toString()) {
        return res.status(403).json({ message: 'Access denied to this user' });
      }

      // Admin cannot update other admins (except themselves)
      if (user.role === 'admin' && user._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Cannot update other admin users' });
      }

      // Admin cannot update superAdmin users
      if (user.role === 'superAdmin') {
        return res.status(403).json({ message: 'Cannot update super admin users' });
      }

      // Admin cannot change role to admin or superAdmin
      if (role === 'admin' || role === 'superAdmin') {
        return res.status(403).json({ message: 'Cannot set role to admin or superAdmin' });
      }
    }
    // SuperAdmin has no restrictions - can update any user and set any role

    // Check for existing email or NIC/Passport (excluding current user)
    if (email || nicOrPassport) {
      const existingUser = await User.findOne({
        $and: [
          { _id: { $ne: req.params.id } },
          {
            $or: [
              ...(email ? [{ email: email.toLowerCase() }] : []),
              ...(nicOrPassport ? [{ nicOrPassport }] : [])
            ]
          }
        ]
      });

      if (existingUser) {
        if (existingUser.email === email?.toLowerCase()) {
          return res.status(400).json({ message: 'Email already exists' });
        }
        if (existingUser.nicOrPassport === nicOrPassport) {
          return res.status(400).json({ message: 'NIC or Passport already exists' });
        }
      }
    }

    // Update fields
    if (fullName) user.fullName = fullName.trim();
    if (nicOrPassport) user.nicOrPassport = nicOrPassport.trim();
    if (contactNumber) user.contactNumber = contactNumber.trim();
    if (email) user.email = email.toLowerCase();
    if (role) user.role = role;
    if (typeof isActive === 'boolean') user.isActive = isActive;

    await user.save();

    // Populate fields for response
    await user.populate('branch', 'name');
    await user.populate('createdBy', 'fullName username');

    res.json({
      message: 'User updated successfully',
      user: {
        ...user.toJSON(),
        password: undefined
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error updating user' });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user
// @access  Private (SuperAdmin, Admin)
router.delete('/:id', authenticateToken, requireRole('superAdmin', 'admin'), [
  ...validationRules.userId,
  handleValidationErrors
], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check access permissions for admin
    if (req.user.role === 'admin') {
      // Admin can only delete users in their branch
      if (user.branch.toString() !== req.user.branch._id.toString()) {
        return res.status(403).json({ message: 'Access denied to this user' });
      }

      // Admin cannot delete other admins
      if (user.role === 'admin') {
        return res.status(403).json({ message: 'Cannot delete admin users' });
      }
    }

    // Prevent self-deletion
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    // Soft delete by setting isActive to false
    user.isActive = false;
    await user.save();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error deleting user' });
  }
});

// @route   POST /api/users/:id/restore
// @desc    Restore deleted user
// @access  Private (SuperAdmin, Admin)
router.post('/:id/restore', authenticateToken, requireRole('superAdmin', 'admin'), [
  ...validationRules.userId,
  handleValidationErrors
], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check access permissions for admin
    if (req.user.role === 'admin' && user.branch.toString() !== req.user.branch._id.toString()) {
      return res.status(403).json({ message: 'Access denied to this user' });
    }

    if (user.isActive) {
      return res.status(400).json({ message: 'User is already active' });
    }

    user.isActive = true;
    await user.save();

    res.json({ message: 'User restored successfully' });
  } catch (error) {
    console.error('Restore user error:', error);
    res.status(500).json({ message: 'Server error restoring user' });
  }
});

// @route   PUT /api/users/:id/role
// @desc    Update user role (Branch Admin only)
// @access  Private (Admin)
router.put('/:id/role', authenticateToken, requireRole('admin'), [
  ...validationRules.userId,
  body('role')
    .isIn(['moderator', 'staff'])
    .withMessage('Role must be moderator or staff'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { role } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Admin can only update users in their branch
    if (user.branch.toString() !== req.user.branch._id.toString()) {
      return res.status(403).json({ message: 'Access denied to this user' });
    }

    // Admin cannot change other admin roles
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Cannot change admin role' });
    }

    // Prevent self-role change
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot change your own role' });
    }

    user.role = role;
    await user.save();

    await user.populate('branch', 'name');

    res.json({
      message: 'User role updated successfully',
      user: {
        ...user.toJSON(),
        password: undefined
      }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ message: 'Server error updating user role' });
  }
});

// @route   GET /api/users/branch/:branchId/stats
// @desc    Get branch user statistics
// @access  Private (SuperAdmin, Branch users)
router.get('/branch/:branchId/stats', authenticateToken, [
  ...validationRules.branchId,
  handleValidationErrors
], async (req, res) => {
  try {
    const { branchId } = req.params;

    // Check access permissions
    if (req.user.role !== 'superAdmin' && req.user.branch._id.toString() !== branchId) {
      return res.status(403).json({ message: 'Access denied to this branch' });
    }

    // Get user statistics for the branch
    const totalUsers = await User.countDocuments({
      branch: branchId,
      isActive: true
    });

    const usersByRole = await User.aggregate([
      { $match: { branch: mongoose.Types.ObjectId(branchId), isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    const recentUsers = await User.countDocuments({
      branch: branchId,
      isActive: true,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    res.json({
      totalUsers,
      recentUsers,
      usersByRole: usersByRole.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Get branch user stats error:', error);
    res.status(500).json({ message: 'Server error fetching branch user statistics' });
  }
});

module.exports = router;
