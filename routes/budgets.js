const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Budget = require('../models/Budget');
const Branch = require('../models/Branch');
const { validationRules, handleValidationErrors } = require('../utils/validation');
const { 
  authenticateToken, 
  requireSuperAdmin,
  requireRole
} = require('../middleware/auth');

// @route   GET /api/budgets
// @desc    Get all budgets with filtering and pagination
// @access  Private (SuperAdmin, Admin)
router.get('/', authenticateToken, requireRole('superAdmin', 'admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      category,
      period,
      status,
      branchId
    } = req.query;

    // Build match query
    let matchQuery = { isActive: true };

    // Apply branch filter for non-superAdmin users
    if (req.user.role !== 'superAdmin') {
      matchQuery.branch = req.user.branch._id;
    } else if (branchId) {
      matchQuery.branch = new mongoose.Types.ObjectId(branchId);
    }

    // Apply filters
    if (category) matchQuery.category = new RegExp(category, 'i');
    if (period) matchQuery.period = period;
    if (status) matchQuery.status = status;

    // Search filter
    if (search) {
      matchQuery.$or = [
        { category: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get budgets with population
    const budgets = await Budget.find(matchQuery)
      .populate('branch', 'name')
      .populate('createdBy', 'fullName username')
      .populate('updatedBy', 'fullName username')
      .sort({ startDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Add virtual fields to response
    const budgetsWithVirtuals = budgets.map(budget => {
      const budgetObj = budget.toObject({ virtuals: true });
      return budgetObj;
    });

    // Get total count for pagination
    const totalBudgets = await Budget.countDocuments(matchQuery);
    const totalPages = Math.ceil(totalBudgets / parseInt(limit));

    res.json({
      budgets: budgetsWithVirtuals,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalBudgets,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get budgets error:', error);
    res.status(500).json({ message: 'Server error fetching budgets' });
  }
});

// @route   GET /api/budgets/statistics
// @desc    Get budget statistics
// @access  Private (SuperAdmin, Admin)
router.get('/statistics', authenticateToken, requireRole('superAdmin', 'admin'), async (req, res) => {
  try {
    const { branchId, period } = req.query;
    
    let targetBranchId = null;
    
    // Non-superAdmin users can only see their branch statistics
    if (req.user.role !== 'superAdmin') {
      targetBranchId = req.user.branch._id.toString();
    } else if (branchId) {
      targetBranchId = branchId;
    }

    const filters = {};
    if (period) filters.period = period;

    const statistics = await Budget.getStatistics(targetBranchId, req.user.role, filters);

    res.json(statistics);
  } catch (error) {
    console.error('Get budget statistics error:', error);
    res.status(500).json({ message: 'Server error fetching budget statistics' });
  }
});

// @route   GET /api/budgets/:id
// @desc    Get single budget
// @access  Private (SuperAdmin, Admin)
router.get('/:id', authenticateToken, requireRole('superAdmin', 'admin'), [
  ...validationRules.mongoId,
  handleValidationErrors
], async (req, res) => {
  try {
    let matchQuery = { _id: req.params.id, isActive: true };

    // Apply branch filter for non-superAdmin users
    if (req.user.role !== 'superAdmin') {
      matchQuery.branch = req.user.branch._id;
    }

    const budget = await Budget.findOne(matchQuery)
      .populate('branch', 'name')
      .populate('createdBy', 'fullName username')
      .populate('updatedBy', 'fullName username');

    if (!budget) {
      return res.status(404).json({ message: 'Budget not found' });
    }

    // Update spent amount before returning
    await budget.updateSpentAmount();

    const budgetWithVirtuals = budget.toObject({ virtuals: true });
    res.json(budgetWithVirtuals);
  } catch (error) {
    console.error('Get budget error:', error);
    res.status(500).json({ message: 'Server error fetching budget' });
  }
});

// @route   POST /api/budgets
// @desc    Create new budget
// @access  Private (SuperAdmin only)
router.post('/', authenticateToken, requireSuperAdmin, [
  ...validationRules.budgetCreate,
  handleValidationErrors
], async (req, res) => {
  try {
    const { 
      category, 
      allocated, 
      period, 
      startDate, 
      endDate, 
      description, 
      status, 
      branch 
    } = req.body;

    // Determine target branch
    let targetBranchId = branch;
    if (req.user.role !== 'superAdmin') {
      targetBranchId = req.user.branch._id.toString();
      if (branch && branch !== targetBranchId) {
        return res.status(403).json({ message: 'Cannot create budget for other branches' });
      }
    }

    // Verify branch exists
    if (targetBranchId) {
      const branchExists = await Branch.findById(targetBranchId);
      if (!branchExists || !branchExists.isActive) {
        return res.status(400).json({ message: 'Invalid or inactive branch' });
      }
    }

    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    // Check for overlapping budgets in the same category and branch
    const overlappingBudget = await Budget.findOne({
      branch: targetBranchId,
      category,
      isActive: true,
      $or: [
        {
          startDate: { $lte: start },
          endDate: { $gte: start }
        },
        {
          startDate: { $lte: end },
          endDate: { $gte: end }
        },
        {
          startDate: { $gte: start },
          endDate: { $lte: end }
        }
      ]
    });

    if (overlappingBudget) {
      return res.status(400).json({ 
        message: 'A budget for this category already exists in the specified date range' 
      });
    }

    // Create new budget
    const budget = new Budget({
      category,
      allocated,
      period,
      startDate: start,
      endDate: end,
      description,
      status: status || 'active',
      branch: targetBranchId,
      createdBy: req.user._id
    });

    await budget.save();

    // Update spent amount
    await budget.updateSpentAmount();

    // Populate the response
    await budget.populate([
      { path: 'branch', select: 'name' },
      { path: 'createdBy', select: 'fullName username' }
    ]);

    const budgetWithVirtuals = budget.toObject({ virtuals: true });

    res.status(201).json({
      message: 'Budget created successfully',
      budget: budgetWithVirtuals
    });
  } catch (error) {
    console.error('Create budget error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Budget with this category and date range already exists' });
    }
    
    res.status(500).json({ message: 'Server error creating budget' });
  }
});

// @route   PUT /api/budgets/:id
// @desc    Update budget
// @access  Private (SuperAdmin only)
router.put('/:id', authenticateToken, requireSuperAdmin, [
  ...validationRules.mongoId,
  ...validationRules.budgetUpdate,
  handleValidationErrors
], async (req, res) => {
  try {
    let matchQuery = { _id: req.params.id, isActive: true };

    // Apply branch filter for non-superAdmin users
    if (req.user.role !== 'superAdmin') {
      matchQuery.branch = req.user.branch._id;
    }

    const budget = await Budget.findOne(matchQuery);

    if (!budget) {
      return res.status(404).json({ message: 'Budget not found' });
    }

    const {
      category,
      allocated,
      period,
      startDate,
      endDate,
      description,
      status
    } = req.body;

    // Validate date range if dates are being updated
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : budget.startDate;
      const end = endDate ? new Date(endDate) : budget.endDate;

      if (end <= start) {
        return res.status(400).json({ message: 'End date must be after start date' });
      }

      // Check for overlapping budgets if category or dates are changing
      if (category !== budget.category || startDate || endDate) {
        const checkCategory = category || budget.category;

        const overlappingBudget = await Budget.findOne({
          _id: { $ne: budget._id },
          branch: budget.branch,
          category: checkCategory,
          isActive: true,
          $or: [
            {
              startDate: { $lte: start },
              endDate: { $gte: start }
            },
            {
              startDate: { $lte: end },
              endDate: { $gte: end }
            },
            {
              startDate: { $gte: start },
              endDate: { $lte: end }
            }
          ]
        });

        if (overlappingBudget) {
          return res.status(400).json({
            message: 'A budget for this category already exists in the specified date range'
          });
        }
      }
    }

    // Update budget fields
    if (category !== undefined) budget.category = category;
    if (allocated !== undefined) budget.allocated = allocated;
    if (period !== undefined) budget.period = period;
    if (startDate !== undefined) budget.startDate = new Date(startDate);
    if (endDate !== undefined) budget.endDate = new Date(endDate);
    if (description !== undefined) budget.description = description;
    if (status !== undefined) budget.status = status;

    budget.updatedBy = req.user._id;

    await budget.save();

    // Update spent amount
    await budget.updateSpentAmount();

    // Populate the response
    await budget.populate([
      { path: 'branch', select: 'name' },
      { path: 'createdBy', select: 'fullName username' },
      { path: 'updatedBy', select: 'fullName username' }
    ]);

    const budgetWithVirtuals = budget.toObject({ virtuals: true });

    res.json({
      message: 'Budget updated successfully',
      budget: budgetWithVirtuals
    });
  } catch (error) {
    console.error('Update budget error:', error);

    if (error.code === 11000) {
      return res.status(400).json({ message: 'Budget with this category and date range already exists' });
    }

    res.status(500).json({ message: 'Server error updating budget' });
  }
});

// @route   DELETE /api/budgets/:id
// @desc    Delete budget (soft delete)
// @access  Private (SuperAdmin only)
router.delete('/:id', authenticateToken, requireSuperAdmin, [
  ...validationRules.mongoId,
  handleValidationErrors
], async (req, res) => {
  try {
    let matchQuery = { _id: req.params.id, isActive: true };

    // Apply branch filter for non-superAdmin users
    if (req.user.role !== 'superAdmin') {
      matchQuery.branch = req.user.branch._id;
    }

    const budget = await Budget.findOne(matchQuery);

    if (!budget) {
      return res.status(404).json({ message: 'Budget not found' });
    }

    // Soft delete
    budget.isActive = false;
    budget.updatedBy = req.user._id;
    await budget.save();

    res.json({ message: 'Budget deleted successfully' });
  } catch (error) {
    console.error('Delete budget error:', error);
    res.status(500).json({ message: 'Server error deleting budget' });
  }
});

// @route   POST /api/budgets/:id/refresh
// @desc    Refresh budget spent amount
// @access  Private (SuperAdmin, Admin)
router.post('/:id/refresh', authenticateToken, requireRole('superAdmin', 'admin'), [
  ...validationRules.mongoId,
  handleValidationErrors
], async (req, res) => {
  try {
    let matchQuery = { _id: req.params.id, isActive: true };

    // Apply branch filter for non-superAdmin users
    if (req.user.role !== 'superAdmin') {
      matchQuery.branch = req.user.branch._id;
    }

    const budget = await Budget.findOne(matchQuery);

    if (!budget) {
      return res.status(404).json({ message: 'Budget not found' });
    }

    // Update spent amount
    await budget.updateSpentAmount();

    // Populate the response
    await budget.populate([
      { path: 'branch', select: 'name' },
      { path: 'createdBy', select: 'fullName username' },
      { path: 'updatedBy', select: 'fullName username' }
    ]);

    const budgetWithVirtuals = budget.toObject({ virtuals: true });

    res.json({
      message: 'Budget refreshed successfully',
      budget: budgetWithVirtuals
    });
  } catch (error) {
    console.error('Refresh budget error:', error);
    res.status(500).json({ message: 'Server error refreshing budget' });
  }
});

module.exports = router;
