const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Branch = require('../models/Branch');
const { validationRules, handleValidationErrors } = require('../utils/validation');
const { 
  authenticateToken, 
  requireRole,
  validateBranchOwnership 
} = require('../middleware/auth');

// @route   GET /api/transactions
// @desc    Get all transactions with filtering and pagination
// @access  Private (SuperAdmin, Admin)
router.get('/', authenticateToken, requireRole('superAdmin', 'admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      type,
      category,
      status,
      startDate,
      endDate,
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
    if (type) matchQuery.type = type;
    if (category) matchQuery.category = new RegExp(category, 'i');
    if (status) matchQuery.status = status;

    // Date range filter
    if (startDate || endDate) {
      matchQuery.date = {};
      if (startDate) matchQuery.date.$gte = new Date(startDate);
      if (endDate) matchQuery.date.$lte = new Date(endDate);
    }

    // Search filter
    if (search) {
      matchQuery.$or = [
        { description: new RegExp(search, 'i') },
        { category: new RegExp(search, 'i') },
        { reference: new RegExp(search, 'i') }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get transactions with population
    const transactions = await Transaction.find(matchQuery)
      .populate('student', 'fullName studentId')
      .populate('course', 'title')
      .populate('branch', 'name')
      .populate('createdBy', 'fullName username')
      .populate('updatedBy', 'fullName username')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalTransactions = await Transaction.countDocuments(matchQuery);
    const totalPages = Math.ceil(totalTransactions / parseInt(limit));

    res.json({
      transactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalTransactions,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Server error fetching transactions' });
  }
});

// @route   GET /api/transactions/statistics
// @desc    Get transaction statistics
// @access  Private (SuperAdmin, Admin)
router.get('/statistics', authenticateToken, requireRole('superAdmin', 'admin'), async (req, res) => {
  try {
    const { branchId, startDate, endDate } = req.query;
    
    let targetBranchId = null;
    
    // Non-superAdmin users can only see their branch statistics
    if (req.user.role !== 'superAdmin') {
      targetBranchId = req.user.branch._id.toString();
    } else if (branchId) {
      targetBranchId = branchId;
    }

    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const statistics = await Transaction.getStatistics(targetBranchId, req.user.role, filters);

    res.json(statistics);
  } catch (error) {
    console.error('Get transaction statistics error:', error);
    res.status(500).json({ message: 'Server error fetching transaction statistics' });
  }
});

// @route   GET /api/transactions/:id
// @desc    Get single transaction
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

    const transaction = await Transaction.findOne(matchQuery)
      .populate('student', 'fullName studentId email phone')
      .populate('course', 'title price')
      .populate('branch', 'name')
      .populate('createdBy', 'fullName username')
      .populate('updatedBy', 'fullName username');

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json(transaction);
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ message: 'Server error fetching transaction' });
  }
});

// @route   POST /api/transactions
// @desc    Create new transaction
// @access  Private (SuperAdmin, Admin)
router.post('/', authenticateToken, requireRole('superAdmin', 'admin'), [
  ...validationRules.transactionCreate,
  handleValidationErrors
], async (req, res) => {
  try {
    const { 
      type, 
      category, 
      amount, 
      description, 
      date, 
      status, 
      reference, 
      student, 
      course, 
      branch 
    } = req.body;

    // Determine target branch
    let targetBranchId = branch;
    if (req.user.role !== 'superAdmin') {
      targetBranchId = req.user.branch._id.toString();
      if (branch && branch !== targetBranchId) {
        return res.status(403).json({ message: 'Cannot create transaction for other branches' });
      }
    }

    // Verify branch exists
    if (targetBranchId) {
      const branchExists = await Branch.findById(targetBranchId);
      if (!branchExists || !branchExists.isActive) {
        return res.status(400).json({ message: 'Invalid or inactive branch' });
      }
    }

    // Verify student exists and belongs to the branch (if provided)
    if (student) {
      const studentExists = await Student.findOne({ 
        _id: student, 
        branch: targetBranchId,
        isActive: true 
      });
      if (!studentExists) {
        return res.status(400).json({ message: 'Invalid student or student does not belong to this branch' });
      }
    }

    // Verify course exists and belongs to the branch (if provided)
    if (course) {
      const courseExists = await Course.findOne({ 
        _id: course, 
        $or: [{ branch: targetBranchId }, { branch: 'all' }],
        isActive: true 
      });
      if (!courseExists) {
        return res.status(400).json({ message: 'Invalid course or course not available for this branch' });
      }
    }

    // Create new transaction
    const transaction = new Transaction({
      type,
      category,
      amount,
      description,
      date: date || new Date(),
      status: status || 'pending',
      reference,
      student,
      course,
      branch: targetBranchId,
      createdBy: req.user._id
    });

    await transaction.save();

    // Populate the response
    await transaction.populate([
      { path: 'student', select: 'fullName studentId' },
      { path: 'course', select: 'title' },
      { path: 'branch', select: 'name' },
      { path: 'createdBy', select: 'fullName username' }
    ]);

    res.status(201).json({
      message: 'Transaction created successfully',
      transaction
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Transaction reference already exists' });
    }
    
    res.status(500).json({ message: 'Server error creating transaction' });
  }
});

// @route   PUT /api/transactions/:id
// @desc    Update transaction
// @access  Private (SuperAdmin, Admin)
router.put('/:id', authenticateToken, requireRole('superAdmin', 'admin'), [
  ...validationRules.mongoId,
  ...validationRules.transactionUpdate,
  handleValidationErrors
], async (req, res) => {
  try {
    let matchQuery = { _id: req.params.id, isActive: true };

    // Apply branch filter for non-superAdmin users
    if (req.user.role !== 'superAdmin') {
      matchQuery.branch = req.user.branch._id;
    }

    const transaction = await Transaction.findOne(matchQuery);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const {
      type,
      category,
      amount,
      description,
      date,
      status,
      reference,
      student,
      course
    } = req.body;

    // Verify student exists and belongs to the branch (if provided)
    if (student && student !== transaction.student?.toString()) {
      const studentExists = await Student.findOne({
        _id: student,
        branch: transaction.branch,
        isActive: true
      });
      if (!studentExists) {
        return res.status(400).json({ message: 'Invalid student or student does not belong to this branch' });
      }
    }

    // Verify course exists and belongs to the branch (if provided)
    if (course && course !== transaction.course?.toString()) {
      const courseExists = await Course.findOne({
        _id: course,
        $or: [{ branch: transaction.branch }, { branch: 'all' }],
        isActive: true
      });
      if (!courseExists) {
        return res.status(400).json({ message: 'Invalid course or course not available for this branch' });
      }
    }

    // Update transaction fields
    if (type !== undefined) transaction.type = type;
    if (category !== undefined) transaction.category = category;
    if (amount !== undefined) transaction.amount = amount;
    if (description !== undefined) transaction.description = description;
    if (date !== undefined) transaction.date = date;
    if (status !== undefined) transaction.status = status;
    if (reference !== undefined) transaction.reference = reference;
    if (student !== undefined) transaction.student = student;
    if (course !== undefined) transaction.course = course;

    transaction.updatedBy = req.user._id;

    await transaction.save();

    // Populate the response
    await transaction.populate([
      { path: 'student', select: 'fullName studentId' },
      { path: 'course', select: 'title' },
      { path: 'branch', select: 'name' },
      { path: 'createdBy', select: 'fullName username' },
      { path: 'updatedBy', select: 'fullName username' }
    ]);

    res.json({
      message: 'Transaction updated successfully',
      transaction
    });
  } catch (error) {
    console.error('Update transaction error:', error);

    if (error.code === 11000) {
      return res.status(400).json({ message: 'Transaction reference already exists' });
    }

    res.status(500).json({ message: 'Server error updating transaction' });
  }
});

// @route   DELETE /api/transactions/:id
// @desc    Delete transaction (soft delete)
// @access  Private (SuperAdmin, Admin)
router.delete('/:id', authenticateToken, requireRole('superAdmin', 'admin'), [
  ...validationRules.mongoId,
  handleValidationErrors
], async (req, res) => {
  try {
    let matchQuery = { _id: req.params.id, isActive: true };

    // Apply branch filter for non-superAdmin users
    if (req.user.role !== 'superAdmin') {
      matchQuery.branch = req.user.branch._id;
    }

    const transaction = await Transaction.findOne(matchQuery);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Soft delete
    transaction.isActive = false;
    transaction.updatedBy = req.user._id;
    await transaction.save();

    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ message: 'Server error deleting transaction' });
  }
});

module.exports = router;
