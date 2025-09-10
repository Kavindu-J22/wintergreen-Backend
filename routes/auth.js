const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const User = require('../models/User');
const Branch = require('../models/Branch');
const { generateToken } = require('../utils/jwt');
const { validationRules, handleValidationErrors } = require('../utils/validation');
const { authenticateToken } = require('../middleware/auth');

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', validationRules.login, handleValidationErrors, async (req, res) => {
  try {
    const { username, password, branchId } = req.body;

    // Find user by username
    const user = await User.findOne({
      username: username.toLowerCase(),
      isActive: true
    }).populate('branch', 'name isActive');

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Handle branch validation based on user role
    if (user.role === 'superAdmin') {
      // SuperAdmin can login to any branch or without specifying a branch
      let selectedBranch = null;
      
      if (branchId) {
        selectedBranch = await Branch.findById(branchId);
        if (!selectedBranch || !selectedBranch.isActive) {
          return res.status(400).json({ message: 'Invalid or inactive branch' });
        }
      }

      // Update last login
      await user.updateLastLogin();

      // Generate token
      const token = generateToken(user._id, user.role, selectedBranch?._id);

      return res.json({
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          username: user.username,
          email: user.email,
          role: user.role,
          branch: selectedBranch ? {
            id: selectedBranch._id,
            name: selectedBranch.name
          } : null
        }
      });
    } else {
      // Other users must login to their assigned branch
      if (!user.branch || !user.branch.isActive) {
        return res.status(401).json({ message: 'User branch is inactive' });
      }

      if (!branchId) {
        return res.status(400).json({ message: 'Branch selection is required' });
      }

      if (user.branch._id.toString() !== branchId) {
        return res.status(401).json({ message: 'Access denied to this branch' });
      }

      // Update last login
      await user.updateLastLogin();

      // Generate token
      const token = generateToken(user._id, user.role, user.branch._id);

      return res.json({
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          username: user.username,
          email: user.email,
          role: user.role,
          branch: {
            id: user.branch._id,
            name: user.branch.name
          }
        }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// @route   GET /api/auth/branches
// @desc    Get available branches for a user
// @access  Public
router.get('/branches', async (req, res) => {
  try {
    const { username } = req.query;

    if (!username || username.trim().length < 3) {
      return res.json([]);
    }

    // Find user by username
    const user = await User.findOne({ 
      username: username.toLowerCase(),
      isActive: true 
    }).populate('branch', 'name isActive');

    if (!user) {
      return res.json([]);
    }

    if (user.role === 'superAdmin') {
      // SuperAdmin can access all active branches
      const branches = await Branch.findActive();
      return res.json(branches.map(branch => ({
        id: branch._id,
        name: branch.name
      })));
    } else {
      // Other users can only access their assigned branch
      if (user.branch && user.branch.isActive) {
        return res.json([{
          id: user.branch._id,
          name: user.branch.name
        }]);
      } else {
        return res.json([]);
      }
    }
  } catch (error) {
    console.error('Branches fetch error:', error);
    res.status(500).json({ message: 'Server error fetching branches' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        fullName: req.user.fullName,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        branch: req.user.branch ? {
          id: req.user.branch._id,
          name: req.user.branch.name
        } : null,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({ message: 'Server error fetching user info' });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // In a JWT implementation, logout is typically handled client-side
    // by removing the token. Here we just confirm the logout.
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', authenticateToken, [
  validationRules.login[1], // password validation
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { password, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    // Verify current password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error changing password' });
  }
});

module.exports = router;
