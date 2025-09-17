const { body, param, query, validationResult } = require('express-validator');

// Validation middleware to check for errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg);
    const detailedMessage = errorMessages.length === 1
      ? errorMessages[0]
      : `Validation failed: ${errorMessages.join(', ')}`;

    return res.status(400).json({
      message: detailedMessage,
      errors: errors.array(),
      validationFailed: true
    });
  }
  next();
};

// Common validation rules
const validationRules = {
  // User validation rules
  userRegistration: [
    body('fullName')
      .notEmpty()
      .withMessage('Full name is required')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Full name must be between 2 and 100 characters'),

    body('nicOrPassport')
      .notEmpty()
      .withMessage('NIC or Passport is required')
      .trim()
      .isLength({ min: 5, max: 20 })
      .withMessage('NIC or Passport must be between 5 and 20 characters'),

    body('contactNumber')
      .notEmpty()
      .withMessage('Contact number is required')
      .trim()
      .matches(/^[0-9+\-\s()]+$/)
      .withMessage('Please enter a valid contact number'),

    body('email')
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email address'),

    body('username')
      .notEmpty()
      .withMessage('Username is required')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be 3-30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),

    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),

    body('role')
      .notEmpty()
      .withMessage('Role is required')
      .isIn(['superAdmin', 'admin', 'moderator', 'staff'])
      .withMessage('Role must be one of: superAdmin, admin, moderator, staff'),

    body('branch')
      .optional()
      .isMongoId()
      .withMessage('Branch must be a valid ID')
  ],

  userUpdate: [
    body('fullName')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Full name must be between 2 and 100 characters'),

    body('nicOrPassport')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 5, max: 20 })
      .withMessage('NIC or Passport must be between 5 and 20 characters'),

    body('contactNumber')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^[0-9+\-\s()]+$/)
      .withMessage('Please enter a valid contact number'),

    body('email')
      .optional({ checkFalsy: true })
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email address'),

    body('role')
      .optional({ checkFalsy: true })
      .isIn(['superAdmin', 'admin', 'moderator', 'staff'])
      .withMessage('Role must be one of: superAdmin, admin, moderator, staff'),

    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean value')
  ],

  // Login validation rules
  login: [
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Username is required'),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    
    body('branchId')
      .optional()
      .isMongoId()
      .withMessage('Branch ID must be valid')
  ],

  // Branch validation rules
  branchCreate: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Branch name must be between 2 and 100 characters')
  ],

  branchUpdate: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Branch name must be between 2 and 100 characters')
  ],

  // Course validation rules
  courseCreate: [
    body('title')
      .notEmpty()
      .withMessage('Course title is required')
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Course title must be between 3 and 200 characters'),

    body('description')
      .notEmpty()
      .withMessage('Course description is required')
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Course description must be between 10 and 1000 characters'),

    body('duration')
      .notEmpty()
      .withMessage('Course duration is required')
      .trim()
      .isLength({ max: 100 })
      .withMessage('Course duration cannot exceed 100 characters'),

    body('price')
      .notEmpty()
      .withMessage('Course price is required')
      .isFloat({ min: 0, max: 1000000 })
      .withMessage('Course price must be between 0 and 1,000,000 LKR'),

    body('maxStudents')
      .notEmpty()
      .withMessage('Maximum students is required')
      .isInt({ min: 1, max: 100 })
      .withMessage('Maximum students must be between 1 and 100'),

    body('schedule')
      .notEmpty()
      .withMessage('Course schedule is required')
      .trim()
      .isLength({ max: 200 })
      .withMessage('Course schedule cannot exceed 200 characters'),

    body('instructor')
      .notEmpty()
      .withMessage('Course instructor is required')
      .trim()
      .isLength({ max: 100 })
      .withMessage('Instructor name cannot exceed 100 characters'),

    body('nextStart')
      .notEmpty()
      .withMessage('Next start date is required')
      .isISO8601()
      .withMessage('Next start date must be a valid date'),

    body('status')
      .optional()
      .isIn(['Draft', 'Active', 'Inactive', 'Completed'])
      .withMessage('Status must be one of: Draft, Active, Inactive, Completed'),

    body('modules')
      .optional()
      .isArray()
      .withMessage('Modules must be an array'),

    body('modules.*')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Module name cannot exceed 200 characters'),

    body('branch')
      .notEmpty()
      .withMessage('Branch is required')
      .custom((value) => {
        // Allow 'all' string or valid MongoDB ObjectId
        if (value === 'all') {
          return true;
        }
        if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
          return true;
        }
        throw new Error('Branch must be a valid ID or "all"');
      })
  ],

  courseUpdate: [
    body('title')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Course title must be between 3 and 200 characters'),

    body('description')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Course description must be between 10 and 1000 characters'),

    body('duration')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 100 })
      .withMessage('Course duration cannot exceed 100 characters'),

    body('price')
      .optional({ checkFalsy: true })
      .isFloat({ min: 0, max: 1000000 })
      .withMessage('Course price must be between 0 and 1,000,000 LKR'),

    body('maxStudents')
      .optional({ checkFalsy: true })
      .isInt({ min: 1, max: 100 })
      .withMessage('Maximum students must be between 1 and 100'),

    body('schedule')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 200 })
      .withMessage('Course schedule cannot exceed 200 characters'),

    body('instructor')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 100 })
      .withMessage('Instructor name cannot exceed 100 characters'),

    body('nextStart')
      .optional({ checkFalsy: true })
      .isISO8601()
      .withMessage('Next start date must be a valid date'),

    body('status')
      .optional({ checkFalsy: true })
      .isIn(['Draft', 'Active', 'Inactive', 'Completed'])
      .withMessage('Status must be one of: Draft, Active, Inactive, Completed'),

    body('modules')
      .optional()
      .isArray()
      .withMessage('Modules must be an array'),

    body('modules.*')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Module name cannot exceed 200 characters'),

    body('branch')
      .optional({ checkFalsy: true })
      .custom((value) => {
        // Allow 'all' string or valid MongoDB ObjectId
        if (value === 'all') {
          return true;
        }
        if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
          return true;
        }
        throw new Error('Branch must be a valid ID or "all"');
      })
  ],

  // Student validation rules
  studentCreate: [
    body('fullName')
      .notEmpty()
      .withMessage('Full name is required')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Full name must be between 2 and 100 characters'),

    body('email')
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email address'),

    body('phone')
      .notEmpty()
      .withMessage('Phone number is required')
      .trim()
      .matches(/^[0-9+\-\s()]+$/)
      .withMessage('Please enter a valid phone number'),

    body('address')
      .notEmpty()
      .withMessage('Address is required')
      .trim()
      .isLength({ max: 500 })
      .withMessage('Address cannot exceed 500 characters'),

    body('dateOfBirth')
      .notEmpty()
      .withMessage('Date of birth is required')
      .isISO8601()
      .withMessage('Date of birth must be a valid date')
      .custom((value) => {
        if (new Date(value) >= new Date()) {
          throw new Error('Date of birth must be in the past');
        }
        return true;
      }),

    body('course')
      .notEmpty()
      .withMessage('Course is required')
      .isMongoId()
      .withMessage('Course must be a valid ID'),

    body('modules')
      .optional()
      .isArray()
      .withMessage('Modules must be an array'),

    body('modules.*')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Module name cannot exceed 200 characters'),

    body('branch')
      .optional()
      .isMongoId()
      .withMessage('Branch must be a valid ID'),

    body('status')
      .optional()
      .isIn(['Active', 'Inactive', 'Suspended', 'Graduated', 'Dropped'])
      .withMessage('Status must be one of: Active, Inactive, Suspended, Graduated, Dropped'),

    body('enrollmentDate')
      .optional()
      .isISO8601()
      .withMessage('Enrollment date must be a valid date'),

    body('gpa')
      .optional()
      .isFloat({ min: 0, max: 4 })
      .withMessage('GPA must be between 0 and 4.0'),

    body('level')
      .optional()
      .isIn(['Beginner', 'Intermediate', 'Advanced'])
      .withMessage('Level must be one of: Beginner, Intermediate, Advanced'),

    body('certifications')
      .optional()
      .isArray()
      .withMessage('Certifications must be an array'),

    body('certifications.*')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Certification name cannot exceed 200 characters')
  ],

  studentUpdate: [
    body('fullName')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Full name must be between 2 and 100 characters'),

    body('email')
      .optional({ checkFalsy: true })
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email address'),

    body('phone')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^[0-9+\-\s()]+$/)
      .withMessage('Please enter a valid phone number'),

    body('address')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 500 })
      .withMessage('Address cannot exceed 500 characters'),

    body('dateOfBirth')
      .optional({ checkFalsy: true })
      .isISO8601()
      .withMessage('Date of birth must be a valid date')
      .custom((value) => {
        if (value && new Date(value) >= new Date()) {
          throw new Error('Date of birth must be in the past');
        }
        return true;
      }),

    body('course')
      .optional({ checkFalsy: true })
      .isMongoId()
      .withMessage('Course must be a valid ID'),

    body('modules')
      .optional()
      .isArray()
      .withMessage('Modules must be an array'),

    body('modules.*')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Module name cannot exceed 200 characters'),

    body('status')
      .optional({ checkFalsy: true })
      .isIn(['Active', 'Inactive', 'Suspended', 'Graduated', 'Dropped'])
      .withMessage('Status must be one of: Active, Inactive, Suspended, Graduated, Dropped'),

    body('enrollmentDate')
      .optional({ checkFalsy: true })
      .isISO8601()
      .withMessage('Enrollment date must be a valid date'),

    body('gpa')
      .optional({ checkFalsy: true })
      .isFloat({ min: 0, max: 4 })
      .withMessage('GPA must be between 0 and 4.0'),

    body('level')
      .optional({ checkFalsy: true })
      .isIn(['Beginner', 'Intermediate', 'Advanced'])
      .withMessage('Level must be one of: Beginner, Intermediate, Advanced'),

    body('certifications')
      .optional()
      .isArray()
      .withMessage('Certifications must be an array'),

    body('certifications.*')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Certification name cannot exceed 200 characters')
  ],

  // Parameter validation rules
  mongoId: [
    param('id')
      .isMongoId()
      .withMessage('Invalid ID format')
  ],

  branchId: [
    param('branchId')
      .isMongoId()
      .withMessage('Invalid branch ID format')
  ],

  userId: [
    param('id')
      .isMongoId()
      .withMessage('Invalid user ID format')
  ],

  // Query validation rules
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ]
};

module.exports = {
  handleValidationErrors,
  validationRules
};
