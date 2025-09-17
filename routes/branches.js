const express = require('express');
const router = express.Router();
const Branch = require('../models/Branch');
const User = require('../models/User');
const { validationRules, handleValidationErrors } = require('../utils/validation');
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth');

// @route   GET /api/branches
// @desc    Get branches (SuperAdmin: all branches, Others: their branch only)
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (page - 1) * limit;

    // Build search query based on user role
    let searchQuery = {};

    if (req.user.role === 'superAdmin') {
      // SuperAdmin can see all branches
      searchQuery = search ? {
        name: { $regex: search, $options: 'i' }
      } : {};
    } else {
      // Other users can only see their own branch
      searchQuery = {
        _id: req.user.branch._id
      };
      if (search) {
        searchQuery.name = { $regex: search, $options: 'i' };
      }
    }

    // Get branches with pagination
    const branches = await Branch.find(searchQuery)
      .populate('createdBy', 'fullName username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Branch.countDocuments(searchQuery);

    // Get user count for each branch
    const branchesWithUserCount = await Promise.all(
      branches.map(async (branch) => {
        const userCount = await branch.getActiveUsersCount();
        return {
          _id: branch._id,
          id: branch._id, // Keep both for compatibility
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
          isActive: branch.isActive,
          userCount,
          createdAt: branch.createdAt,
          updatedAt: branch.updatedAt,
          createdBy: branch.createdBy
        };
      })
    );

    res.json({
      branches: branchesWithUserCount,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({ message: 'Server error fetching branches' });
  }
});

// @route   GET /api/branches/active
// @desc    Get all active branches
// @access  Private
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role === 'superAdmin') {
      // SuperAdmin can see all active branches
      const branches = await Branch.findActive();
      return res.json(branches.map(branch => ({
        _id: branch._id,
        id: branch._id, // Keep both for compatibility
        name: branch.name
      })));
    } else {
      // Other users can only see their assigned branch
      if (user.branch) {
        return res.json([{
          _id: user.branch._id,
          id: user.branch._id, // Keep both for compatibility
          name: user.branch.name
        }]);
      } else {
        return res.json([]);
      }
    }
  } catch (error) {
    console.error('Get active branches error:', error);
    res.status(500).json({ message: 'Server error fetching active branches' });
  }
});

// @route   GET /api/branches/:id
// @desc    Get single branch
// @access  Private (SuperAdmin only)
router.get('/:id', authenticateToken, requireSuperAdmin, validationRules.mongoId, handleValidationErrors, async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id)
      .populate('createdBy', 'fullName username');

    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }

    // Get user count
    const userCount = await branch.getActiveUsersCount();

    res.json({
      ...branch.toJSON(),
      userCount
    });
  } catch (error) {
    console.error('Get branch error:', error);
    res.status(500).json({ message: 'Server error fetching branch' });
  }
});

// @route   POST /api/branches
// @desc    Create new branch
// @access  Private (SuperAdmin only)
router.post('/', authenticateToken, requireSuperAdmin, validationRules.branchCreate, handleValidationErrors, async (req, res) => {
  try {
    const { name } = req.body;

    // Check if branch name already exists
    const existingBranch = await Branch.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingBranch) {
      return res.status(400).json({ message: 'Branch name already exists' });
    }

    // Create new branch
    const branch = new Branch({
      name: name.trim(),
      createdBy: req.user._id
    });

    await branch.save();

    // Populate createdBy field for response
    await branch.populate('createdBy', 'fullName username');

    res.status(201).json({
      message: 'Branch created successfully',
      branch: {
        ...branch.toJSON(),
        userCount: 0
      }
    });
  } catch (error) {
    console.error('Create branch error:', error);
    res.status(500).json({ message: 'Server error creating branch' });
  }
});

// @route   PUT /api/branches/:id
// @desc    Update branch
// @access  Private (SuperAdmin only)
router.put('/:id', authenticateToken, requireSuperAdmin, [
  ...validationRules.mongoId,
  ...validationRules.branchUpdate
], handleValidationErrors, async (req, res) => {
  try {
    const { name, isActive } = req.body;

    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }

    // Check if new name already exists (excluding current branch)
    if (name && name !== branch.name) {
      const existingBranch = await Branch.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id }
      });

      if (existingBranch) {
        return res.status(400).json({ message: 'Branch name already exists' });
      }
    }

    // Update fields
    if (name) branch.name = name.trim();
    if (typeof isActive === 'boolean') branch.isActive = isActive;

    await branch.save();

    // Populate createdBy field for response
    await branch.populate('createdBy', 'fullName username');

    // Get user count
    const userCount = await branch.getActiveUsersCount();

    res.json({
      message: 'Branch updated successfully',
      branch: {
        ...branch.toJSON(),
        userCount
      }
    });
  } catch (error) {
    console.error('Update branch error:', error);
    res.status(500).json({ message: 'Server error updating branch' });
  }
});

// @route   PATCH /api/branches/:id/toggle-status
// @desc    Toggle branch active status
// @access  Private (SuperAdmin only)
router.patch('/:id/toggle-status', authenticateToken, requireSuperAdmin, validationRules.mongoId, handleValidationErrors, async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }

    branch.isActive = !branch.isActive;
    await branch.save();

    res.json({
      message: `Branch ${branch.isActive ? 'activated' : 'deactivated'} successfully`,
      branch: {
        id: branch._id,
        name: branch.name,
        isActive: branch.isActive,
        userCount: await branch.getActiveUsersCount(),
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt
      }
    });
  } catch (error) {
    console.error('Toggle branch status error:', error);
    res.status(500).json({ message: 'Server error toggling branch status' });
  }
});

// @route   DELETE /api/branches/:id
// @desc    Delete branch
// @access  Private (SuperAdmin only)
router.delete('/:id', authenticateToken, requireSuperAdmin, validationRules.mongoId, handleValidationErrors, async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }

    // Check if branch has active users
    const userCount = await User.countDocuments({ 
      branch: req.params.id, 
      isActive: true 
    });

    if (userCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete branch. It has ${userCount} active user(s). Please deactivate or transfer users first.`
      });
    }

    // Soft delete by setting isActive to false
    branch.isActive = false;
    await branch.save();

    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('Delete branch error:', error);
    res.status(500).json({ message: 'Server error deleting branch' });
  }
});

// @route   POST /api/branches/:id/restore
// @desc    Restore deleted branch
// @access  Private (SuperAdmin only)
router.post('/:id/restore', authenticateToken, requireSuperAdmin, validationRules.mongoId, handleValidationErrors, async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }

    if (branch.isActive) {
      return res.status(400).json({ message: 'Branch is already active' });
    }

    branch.isActive = true;
    await branch.save();

    res.json({ message: 'Branch restored successfully' });
  } catch (error) {
    console.error('Restore branch error:', error);
    res.status(500).json({ message: 'Server error restoring branch' });
  }
});

module.exports = router;
