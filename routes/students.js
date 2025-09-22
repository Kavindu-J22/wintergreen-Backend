const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Course = require('../models/Course');
const Branch = require('../models/Branch');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validationRules, handleValidationErrors } = require('../utils/validation');

// @route   GET /api/students
// @desc    Get all students (SuperAdmin) or branch students (others)
// @access  Private (All authenticated users)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', branchId = '', courseId = '' } = req.query;
    const skip = (page - 1) * limit;

    // Build search query
    let searchQuery = { isActive: true };

    // Text search
    if (search) {
      searchQuery.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      searchQuery.status = status;
    }

    // Course filter
    if (courseId) {
      searchQuery.course = courseId;
    }

    // Branch filter based on user role
    if (req.user.role === 'superAdmin') {
      // SuperAdmin can see all students or filter by specific branch
      if (branchId) {
        searchQuery.branch = branchId;
      }
    } else {
      // Other users can only see students from their branch
      const userBranchId = req.user.branch._id.toString();
      searchQuery.branch = userBranchId;
    }

    // Get students with pagination
    const students = await Student.find(searchQuery)
      .populate('course', 'title')
      .populate('branch', 'name')
      .populate('createdBy', 'fullName username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Student.countDocuments(searchQuery);

    res.json({
      students,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ message: 'Server error fetching students' });
  }
});

// @route   GET /api/students/statistics
// @desc    Get student statistics
// @access  Private (All authenticated users)
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const { branchId } = req.query;
    
    let targetBranchId = null;
    if (req.user.role === 'superAdmin') {
      targetBranchId = branchId || null;
    } else {
      targetBranchId = req.user.branch._id.toString();
    }

    const statistics = await Student.getStatistics(targetBranchId, req.user.role);
    res.json(statistics);
  } catch (error) {
    console.error('Get student statistics error:', error);
    res.status(500).json({ message: 'Server error fetching statistics' });
  }
});

// @route   GET /api/students/:id
// @desc    Get single student
// @access  Private (All authenticated users)
router.get('/:id', authenticateToken, [
  ...validationRules.mongoId,
  handleValidationErrors
], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('course', 'title modules')
      .populate('branch', 'name')
      .populate('createdBy', 'fullName username');

    if (!student || !student.isActive) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check access permissions for non-superAdmin users
    if (req.user.role !== 'superAdmin' && 
        student.branch._id.toString() !== req.user.branch._id.toString()) {
      return res.status(403).json({ message: 'Access denied to this student' });
    }

    res.json(student);
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({ message: 'Server error fetching student' });
  }
});

// @route   POST /api/students
// @desc    Create new student
// @access  Private (SuperAdmin, Admin, Moderator)
router.post('/', authenticateToken, requireRole('superAdmin', 'admin', 'moderator'), [
  ...validationRules.studentCreate,
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      address,
      dateOfBirth,
      course: courseId,
      modules,
      branch: branchId,
      status,
      enrollmentDate,
      level,
      certifications,
      childBabyCare,
      elderCare,
      documents,
      personalDocuments,
      hostelRequirement,
      mealRequirement
    } = req.body;

    // Validate branch access for non-superAdmin users
    let targetBranchId = branchId;
    if (req.user.role !== 'superAdmin') {
      targetBranchId = req.user.branch._id.toString();
      if (branchId && branchId !== targetBranchId) {
        return res.status(403).json({ message: 'Cannot create student for other branches' });
      }
    }

    // Verify branch exists and is active
    const branch = await Branch.findById(targetBranchId);
    if (!branch || !branch.isActive) {
      return res.status(400).json({ message: 'Invalid or inactive branch' });
    }

    // Verify course exists and is active
    const course = await Course.findById(courseId);
    if (!course || !course.isActive) {
      return res.status(400).json({ message: 'Invalid or inactive course' });
    }

    // Check if course is available for the branch
    if (req.user.role !== 'superAdmin') {
      const userBranchId = req.user.branch._id.toString();
      if (course.branch !== 'all' && course.branch !== userBranchId) {
        return res.status(400).json({ message: 'Course not available for your branch' });
      }
    }

    // Check if course is full
    if (course.isFull()) {
      return res.status(400).json({ message: 'Course is full' });
    }

    // Check for duplicate email
    const existingStudent = await Student.findOne({ email: email.toLowerCase(), isActive: true });
    if (existingStudent) {
      return res.status(400).json({ message: 'Student with this email already exists' });
    }

    // Generate student ID
    const studentId = await Student.generateStudentId(courseId);

    // Create new student
    const student = new Student({
      studentId,
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      address: address.trim(),
      dateOfBirth: new Date(dateOfBirth),
      course: courseId,
      modules: modules || [],
      branch: targetBranchId,
      status: status || 'Active',
      enrollmentDate: enrollmentDate ? new Date(enrollmentDate) : new Date(),
      level: level || 'Beginner',
      certifications: certifications || [],
      childBabyCare: childBabyCare || false,
      elderCare: elderCare || false,
      documents: documents || [],
      personalDocuments: personalDocuments || {
        birthCertificate: false,
        gramaNiladhariCertificate: false,
        guardianSpouseLetter: false,
        originalCertificate: {
          hasDocument: false,
          title: ''
        }
      },
      hostelRequirement: hostelRequirement || false,
      mealRequirement: mealRequirement || false,
      createdBy: req.user._id
    });

    await student.save();

    // Update course enrollment count
    await course.enrollStudent();

    // Populate the response
    await student.populate([
      { path: 'course', select: 'title modules' },
      { path: 'branch', select: 'name' },
      { path: 'createdBy', select: 'fullName username' }
    ]);

    res.status(201).json({
      message: 'Student created successfully',
      student
    });
  } catch (error) {
    console.error('Create student error:', error);
    if (error.code === 11000) {
      if (error.keyPattern?.email) {
        return res.status(400).json({ message: 'Student with this email already exists' });
      }
      if (error.keyPattern?.studentId) {
        return res.status(400).json({ message: 'Student ID already exists' });
      }
    }
    res.status(500).json({ message: 'Server error creating student' });
  }
});

// @route   PUT /api/students/:id
// @desc    Update student
// @access  Private (SuperAdmin, Admin, Moderator)
router.put('/:id', authenticateToken, requireRole('superAdmin', 'admin', 'moderator'), [
  ...validationRules.mongoId,
  ...validationRules.studentUpdate,
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      address,
      dateOfBirth,
      course: newCourseId,
      modules,
      status,
      enrollmentDate,
      level,
      certifications,
      childBabyCare,
      elderCare,
      documents,
      personalDocuments,
      hostelRequirement,
      mealRequirement
    } = req.body;

    const student = await Student.findById(req.params.id)
      .populate('course', 'title currentEnrolled maxStudents')
      .populate('branch', 'name');

    if (!student || !student.isActive) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check access permissions for non-superAdmin users
    if (req.user.role !== 'superAdmin' &&
        student.branch._id.toString() !== req.user.branch._id.toString()) {
      return res.status(403).json({ message: 'Access denied to this student' });
    }

    // Handle course change if provided
    let courseChanged = false;
    if (newCourseId && newCourseId !== student.course._id.toString()) {
      // Verify new course exists and is active
      const newCourse = await Course.findById(newCourseId);
      if (!newCourse || !newCourse.isActive) {
        return res.status(400).json({ message: 'Invalid or inactive course' });
      }

      // Check if new course is available for the branch
      if (req.user.role !== 'superAdmin') {
        const userBranchId = req.user.branch._id.toString();
        if (newCourse.branch !== 'all' && newCourse.branch !== userBranchId) {
          return res.status(400).json({ message: 'Course not available for your branch' });
        }
      }

      // Check if new course is full
      if (newCourse.isFull()) {
        return res.status(400).json({ message: 'New course is full' });
      }

      courseChanged = true;
    }

    // Check for duplicate email (excluding current student)
    if (email && email.toLowerCase() !== student.email) {
      const existingStudent = await Student.findOne({
        email: email.toLowerCase(),
        isActive: true,
        _id: { $ne: student._id }
      });
      if (existingStudent) {
        return res.status(400).json({ message: 'Student with this email already exists' });
      }
    }

    // Update student fields
    if (fullName) student.fullName = fullName.trim();
    if (email) student.email = email.toLowerCase().trim();
    if (phone) student.phone = phone.trim();
    if (address) student.address = address.trim();
    if (dateOfBirth) student.dateOfBirth = new Date(dateOfBirth);
    if (modules !== undefined) student.modules = modules;
    if (status) student.status = status;
    if (enrollmentDate) student.enrollmentDate = new Date(enrollmentDate);
    if (level) student.level = level;
    if (certifications !== undefined) student.certifications = certifications;
    if (childBabyCare !== undefined) student.childBabyCare = childBabyCare;
    if (elderCare !== undefined) student.elderCare = elderCare;
    if (documents !== undefined) student.documents = documents;
    if (personalDocuments !== undefined) student.personalDocuments = personalDocuments;
    if (hostelRequirement !== undefined) student.hostelRequirement = hostelRequirement;
    if (mealRequirement !== undefined) student.mealRequirement = mealRequirement;

    // Handle course change
    if (courseChanged) {
      const oldCourse = await Course.findById(student.course._id);
      const newCourse = await Course.findById(newCourseId);

      // Generate new student ID for new course
      const newStudentId = await Student.generateStudentId(newCourseId);
      student.studentId = newStudentId;
      student.course = newCourseId;

      // Update enrollment counts
      if (oldCourse) {
        await oldCourse.unenrollStudent();
      }
      await newCourse.enrollStudent();
    }

    await student.save();

    // Populate the response
    await student.populate([
      { path: 'course', select: 'title modules' },
      { path: 'branch', select: 'name' },
      { path: 'createdBy', select: 'fullName username' }
    ]);

    res.json({
      message: 'Student updated successfully',
      student
    });
  } catch (error) {
    console.error('Update student error:', error);
    if (error.code === 11000) {
      if (error.keyPattern?.email) {
        return res.status(400).json({ message: 'Student with this email already exists' });
      }
      if (error.keyPattern?.studentId) {
        return res.status(400).json({ message: 'Student ID already exists' });
      }
    }
    res.status(500).json({ message: 'Server error updating student' });
  }
});

// @route   DELETE /api/students/:id
// @desc    Delete student (soft delete)
// @access  Private (SuperAdmin, Admin, Moderator)
router.delete('/:id', authenticateToken, requireRole('superAdmin', 'admin', 'moderator'), [
  ...validationRules.mongoId,
  handleValidationErrors
], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('course', 'title currentEnrolled')
      .populate('branch', 'name');

    if (!student || !student.isActive) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check access permissions for non-superAdmin users
    if (req.user.role !== 'superAdmin' &&
        student.branch._id.toString() !== req.user.branch._id.toString()) {
      return res.status(403).json({ message: 'Access denied to this student' });
    }

    // Soft delete the student
    student.isActive = false;
    await student.save();

    // Update course enrollment count
    const course = await Course.findById(student.course._id);
    if (course) {
      await course.unenrollStudent();
    }

    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ message: 'Server error deleting student' });
  }
});

module.exports = router;
