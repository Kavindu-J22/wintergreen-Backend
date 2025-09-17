const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Course = require('../models/Course');
const Branch = require('../models/Branch');
const { validationRules, handleValidationErrors } = require('../utils/validation');
const { 
  authenticateToken, 
  requireSuperAdmin, 
  requireRole,
  requireBranchAccess,
  validateBranchOwnership 
} = require('../middleware/auth');

// @route   GET /api/courses
// @desc    Get all courses (SuperAdmin) or branch courses (others)
// @access  Private (All authenticated users)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', branchId = '' } = req.query;
    const skip = (page - 1) * limit;

    // Build search query
    let searchQuery = { isActive: true };

    // Text search
    if (search) {
      searchQuery.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { instructor: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      searchQuery.status = status;
    }

    // Branch filter based on user role
    if (req.user.role === 'superAdmin') {
      // SuperAdmin can see all courses or filter by specific branch
      if (branchId) {
        searchQuery.branch = branchId;
      }
    } else {
      // Other users can see courses from their branch OR courses marked as "all"
      // Convert ObjectId to string for comparison since course.branch is stored as string
      const userBranchId = req.user.branch._id.toString();
      searchQuery.$or = [
        { branch: userBranchId },
        { branch: 'all' }
      ];
    }

    // Get courses with pagination
    const courses = await Course.find(searchQuery)
      .populate('createdBy', 'fullName username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Process courses to handle branch population and 'all' branch display
    const processedCourses = await Promise.all(courses.map(async (course) => {
      const courseObj = course.toObject();

      if (courseObj.branch === 'all') {
        // Handle 'all' branch case
        courseObj.branch = { _id: 'all', name: 'All Branches' };
      } else {
        // Manually fetch branch data since Mixed type doesn't support populate
        const branchData = await Branch.findById(courseObj.branch).select('name');
        if (branchData) {
          courseObj.branch = { _id: branchData._id, name: branchData.name };
        }
      }

      return courseObj;
    }));

    // Get total count for pagination
    const total = await Course.countDocuments(searchQuery);

    res.json({
      courses: processedCourses,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ message: 'Server error fetching courses' });
  }
});

// @route   GET /api/courses/statistics
// @desc    Get course statistics
// @access  Private (All authenticated users)
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    let branchId = null;
    
    // Non-superAdmin users can only see their branch statistics
    if (req.user.role !== 'superAdmin') {
      branchId = req.user.branch._id;
    } else if (req.query.branchId) {
      branchId = req.query.branchId;
    }

    const statistics = await Course.getStatistics(branchId);
    
    res.json(statistics);
  } catch (error) {
    console.error('Get course statistics error:', error);
    res.status(500).json({ message: 'Server error fetching course statistics' });
  }
});

// @route   GET /api/courses/:id
// @desc    Get single course
// @access  Private (All authenticated users)
router.get('/:id', authenticateToken, [
  ...validationRules.mongoId,
  handleValidationErrors
], async (req, res) => {
  try {
    let course = await Course.findById(req.params.id)
      .populate('createdBy', 'fullName username');

    if (!course || !course.isActive) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Handle branch population and 'all' branch display
    let courseObj = course.toObject();
    if (courseObj.branch === 'all') {
      courseObj.branch = { _id: 'all', name: 'All Branches' };
    } else {
      // Manually fetch branch data since Mixed type doesn't support populate
      const branchData = await Branch.findById(courseObj.branch).select('name');
      if (branchData) {
        courseObj.branch = { _id: branchData._id, name: branchData.name };
      }
    }

    // Check access permissions for non-superAdmin users
    if (req.user.role !== 'superAdmin') {
      // If course is for all branches, allow access
      if (course.branch !== 'all' &&
          course.branch && course.branch._id.toString() !== req.user.branch._id.toString()) {
        return res.status(403).json({ message: 'Access denied to this course' });
      }
    }

    res.json(courseObj);
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ message: 'Server error fetching course' });
  }
});

// @route   POST /api/courses
// @desc    Create new course
// @access  Private (SuperAdmin only)
router.post('/', authenticateToken, requireSuperAdmin, [
  ...validationRules.courseCreate,
  handleValidationErrors
], async (req, res) => {
  try {
    const { 
      title, 
      description, 
      duration, 
      price, 
      maxStudents, 
      schedule, 
      instructor, 
      nextStart, 
      status, 
      modules,
      branch 
    } = req.body;

    // Verify branch exists (unless it's 'all')
    if (branch !== 'all') {
      const branchExists = await Branch.findById(branch);
      if (!branchExists || !branchExists.isActive) {
        return res.status(400).json({ message: 'Invalid or inactive branch' });
      }
    }

    // Check if course title already exists in the same branch
    const existingCourse = await Course.findOne({
      title: { $regex: new RegExp(`^${title}$`, 'i') },
      branch: branch,
      isActive: true
    });

    if (existingCourse) {
      const branchName = branch === 'all' ? 'all branches' : 'this branch';
      return res.status(400).json({ message: `Course title already exists in ${branchName}` });
    }

    // Create new course
    const course = new Course({
      title: title.trim(),
      description: description.trim(),
      duration: duration.trim(),
      price: parseFloat(price),
      currency: 'LKR', // Default to LKR
      maxStudents: parseInt(maxStudents),
      schedule: schedule.trim(),
      instructor: instructor.trim(),
      nextStart: new Date(nextStart),
      status: status || 'Draft',
      modules: modules || [],
      branch: branch,
      createdBy: req.user._id
    });

    await course.save();

    // Populate the response
    await course.populate('createdBy', 'fullName username');

    // Process course to handle 'all' branch display
    let courseObj = course.toObject();
    if (courseObj.branch === 'all') {
      courseObj.branch = { _id: 'all', name: 'All Branches' };
    } else {
      // Manually fetch branch data since Mixed type doesn't support populate
      const branchData = await Branch.findById(courseObj.branch).select('name');
      if (branchData) {
        courseObj.branch = { _id: branchData._id, name: branchData.name };
      }
    }

    res.status(201).json({
      message: 'Course created successfully',
      course: courseObj
    });
  } catch (error) {
    console.error('Create course error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error', errors });
    }
    
    res.status(500).json({ message: 'Server error creating course' });
  }
});

// @route   PUT /api/courses/:id
// @desc    Update course
// @access  Private (SuperAdmin only)
router.put('/:id', authenticateToken, requireSuperAdmin, [
  ...validationRules.mongoId,
  ...validationRules.courseUpdate,
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      title,
      description,
      duration,
      price,
      maxStudents,
      schedule,
      instructor,
      nextStart,
      status,
      modules,
      branch
    } = req.body;

    const course = await Course.findById(req.params.id);

    if (!course || !course.isActive) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // If branch is being changed, verify it exists (unless it's 'all')
    if (branch && branch !== course.branch.toString()) {
      if (branch !== 'all') {
        const branchExists = await Branch.findById(branch);
        if (!branchExists || !branchExists.isActive) {
          return res.status(400).json({ message: 'Invalid or inactive branch' });
        }
      }
    }

    // Check if title is being changed and if it conflicts with existing courses
    if (title && title !== course.title) {
      const existingCourse = await Course.findOne({
        title: { $regex: new RegExp(`^${title}$`, 'i') },
        branch: branch || course.branch,
        isActive: true,
        _id: { $ne: req.params.id }
      });

      if (existingCourse) {
        const branchName = (branch || course.branch) === 'all' ? 'all branches' : 'this branch';
        return res.status(400).json({ message: `Course title already exists in ${branchName}` });
      }
    }

    // Update course fields
    if (title) course.title = title.trim();
    if (description) course.description = description.trim();
    if (duration) course.duration = duration.trim();
    if (price !== undefined) course.price = parseFloat(price);
    if (maxStudents !== undefined) course.maxStudents = parseInt(maxStudents);
    if (schedule) course.schedule = schedule.trim();
    if (instructor) course.instructor = instructor.trim();
    if (nextStart) course.nextStart = new Date(nextStart);
    if (status) course.status = status;
    if (modules !== undefined) course.modules = modules;
    if (branch) course.branch = branch;

    await course.save();

    // Populate the response
    await course.populate('createdBy', 'fullName username');

    // Process course to handle 'all' branch display
    let courseObj = course.toObject();
    if (courseObj.branch === 'all') {
      courseObj.branch = { _id: 'all', name: 'All Branches' };
    } else {
      // Manually fetch branch data since Mixed type doesn't support populate
      const branchData = await Branch.findById(courseObj.branch).select('name');
      if (branchData) {
        courseObj.branch = { _id: branchData._id, name: branchData.name };
      }
    }

    res.json({
      message: 'Course updated successfully',
      course: courseObj
    });
  } catch (error) {
    console.error('Update course error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error', errors });
    }

    res.status(500).json({ message: 'Server error updating course' });
  }
});

// @route   DELETE /api/courses/:id
// @desc    Delete course (soft delete)
// @access  Private (SuperAdmin only)
router.delete('/:id', authenticateToken, requireSuperAdmin, [
  ...validationRules.mongoId,
  handleValidationErrors
], async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course || !course.isActive) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if course has enrolled students
    if (course.currentEnrolled > 0) {
      return res.status(400).json({
        message: `Cannot delete course. It has ${course.currentEnrolled} enrolled student(s). Please transfer or complete the course first.`
      });
    }

    // Soft delete
    course.isActive = false;
    await course.save();

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ message: 'Server error deleting course' });
  }
});

// @route   POST /api/courses/:id/restore
// @desc    Restore deleted course
// @access  Private (SuperAdmin only)
router.post('/:id/restore', authenticateToken, requireSuperAdmin, [
  ...validationRules.mongoId,
  handleValidationErrors
], async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (course.isActive) {
      return res.status(400).json({ message: 'Course is already active' });
    }

    course.isActive = true;
    await course.save();

    res.json({ message: 'Course restored successfully' });
  } catch (error) {
    console.error('Restore course error:', error);
    res.status(500).json({ message: 'Server error restoring course' });
  }
});

module.exports = router;
