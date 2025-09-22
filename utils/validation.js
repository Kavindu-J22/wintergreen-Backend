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

    body('childBabyCare')
      .optional()
      .isBoolean()
      .withMessage('Child/Baby care must be a boolean value'),

    body('elderCare')
      .optional()
      .isBoolean()
      .withMessage('Elder care must be a boolean value'),

    body('documents')
      .optional()
      .isArray()
      .withMessage('Documents must be an array'),

    body('documents.*.name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Document name must be between 1 and 200 characters'),

    body('documents.*.url')
      .optional()
      .isURL()
      .withMessage('Document URL must be a valid URL'),

    body('documents.*.type')
      .optional()
      .isIn(['image', 'pdf', 'document'])
      .withMessage('Document type must be one of: image, pdf, document'),

    body('personalDocuments.birthCertificate')
      .optional()
      .isBoolean()
      .withMessage('Birth certificate must be a boolean value'),

    body('personalDocuments.gramaNiladhariCertificate')
      .optional()
      .isBoolean()
      .withMessage('Grama Niladhari certificate must be a boolean value'),

    body('personalDocuments.guardianSpouseLetter')
      .optional()
      .isBoolean()
      .withMessage('Guardian/Spouse letter must be a boolean value'),

    body('personalDocuments.originalCertificate.hasDocument')
      .optional()
      .isBoolean()
      .withMessage('Original certificate status must be a boolean value'),

    body('personalDocuments.originalCertificate.title')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Certificate title cannot exceed 200 characters'),

    body('hostelRequirement')
      .optional()
      .isBoolean()
      .withMessage('Hostel requirement must be a boolean value'),

    body('mealRequirement')
      .optional()
      .isBoolean()
      .withMessage('Meal requirement must be a boolean value'),

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

    body('childBabyCare')
      .optional()
      .isBoolean()
      .withMessage('Child/Baby care must be a boolean value'),

    body('elderCare')
      .optional()
      .isBoolean()
      .withMessage('Elder care must be a boolean value'),

    body('documents')
      .optional()
      .isArray()
      .withMessage('Documents must be an array'),

    body('documents.*.name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Document name must be between 1 and 200 characters'),

    body('documents.*.url')
      .optional()
      .isURL()
      .withMessage('Document URL must be a valid URL'),

    body('documents.*.type')
      .optional()
      .isIn(['image', 'pdf', 'document'])
      .withMessage('Document type must be one of: image, pdf, document'),

    body('personalDocuments.birthCertificate')
      .optional()
      .isBoolean()
      .withMessage('Birth certificate must be a boolean value'),

    body('personalDocuments.gramaNiladhariCertificate')
      .optional()
      .isBoolean()
      .withMessage('Grama Niladhari certificate must be a boolean value'),

    body('personalDocuments.guardianSpouseLetter')
      .optional()
      .isBoolean()
      .withMessage('Guardian/Spouse letter must be a boolean value'),

    body('personalDocuments.originalCertificate.hasDocument')
      .optional()
      .isBoolean()
      .withMessage('Original certificate status must be a boolean value'),

    body('personalDocuments.originalCertificate.title')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Certificate title cannot exceed 200 characters'),

    body('hostelRequirement')
      .optional()
      .isBoolean()
      .withMessage('Hostel requirement must be a boolean value'),

    body('mealRequirement')
      .optional()
      .isBoolean()
      .withMessage('Meal requirement must be a boolean value'),

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
  ],

  // Transaction validation rules
  transactionCreate: [
    body('type')
      .notEmpty()
      .withMessage('Transaction type is required')
      .isIn(['income', 'expense'])
      .withMessage('Transaction type must be either income or expense'),

    body('category')
      .notEmpty()
      .withMessage('Category is required')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Category must be between 1 and 100 characters'),

    body('amount')
      .notEmpty()
      .withMessage('Amount is required')
      .isFloat({ min: 0.01, max: 10000000 })
      .withMessage('Amount must be between 0.01 and 10,000,000'),

    body('description')
      .notEmpty()
      .withMessage('Description is required')
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Description must be between 1 and 500 characters'),

    body('date')
      .optional()
      .isISO8601()
      .withMessage('Date must be a valid date'),

    body('status')
      .optional()
      .isIn(['pending', 'completed', 'cancelled'])
      .withMessage('Status must be one of: pending, completed, cancelled'),

    body('reference')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Reference cannot exceed 50 characters'),

    body('student')
      .optional()
      .isMongoId()
      .withMessage('Student must be a valid ID'),

    body('course')
      .optional()
      .isMongoId()
      .withMessage('Course must be a valid ID'),

    body('branch')
      .optional()
      .isMongoId()
      .withMessage('Branch must be a valid ID')
  ],

  transactionUpdate: [
    body('type')
      .optional()
      .isIn(['income', 'expense'])
      .withMessage('Transaction type must be either income or expense'),

    body('category')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Category must be between 1 and 100 characters'),

    body('amount')
      .optional()
      .isFloat({ min: 0.01, max: 10000000 })
      .withMessage('Amount must be between 0.01 and 10,000,000'),

    body('description')
      .optional()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Description must be between 1 and 500 characters'),

    body('date')
      .optional()
      .isISO8601()
      .withMessage('Date must be a valid date'),

    body('status')
      .optional()
      .isIn(['pending', 'completed', 'cancelled'])
      .withMessage('Status must be one of: pending, completed, cancelled'),

    body('reference')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Reference cannot exceed 50 characters'),

    body('student')
      .optional()
      .isMongoId()
      .withMessage('Student must be a valid ID'),

    body('course')
      .optional()
      .isMongoId()
      .withMessage('Course must be a valid ID')
  ],

  // Budget validation rules
  budgetCreate: [
    body('category')
      .notEmpty()
      .withMessage('Category is required')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Category must be between 1 and 100 characters'),

    body('allocated')
      .notEmpty()
      .withMessage('Allocated amount is required')
      .isFloat({ min: 0, max: 100000000 })
      .withMessage('Allocated amount must be between 0 and 100,000,000'),

    body('period')
      .notEmpty()
      .withMessage('Period is required')
      .isIn(['monthly', 'quarterly', 'yearly'])
      .withMessage('Period must be one of: monthly, quarterly, yearly'),

    body('startDate')
      .notEmpty()
      .withMessage('Start date is required')
      .isISO8601()
      .withMessage('Start date must be a valid date'),

    body('endDate')
      .notEmpty()
      .withMessage('End date is required')
      .isISO8601()
      .withMessage('End date must be a valid date'),

    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters'),

    body('status')
      .optional()
      .isIn(['active', 'inactive', 'completed', 'exceeded'])
      .withMessage('Status must be one of: active, inactive, completed, exceeded'),

    body('branch')
      .optional()
      .isMongoId()
      .withMessage('Branch must be a valid ID')
  ],

  budgetUpdate: [
    body('category')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Category must be between 1 and 100 characters'),

    body('allocated')
      .optional()
      .isFloat({ min: 0, max: 100000000 })
      .withMessage('Allocated amount must be between 0 and 100,000,000'),

    body('period')
      .optional()
      .isIn(['monthly', 'quarterly', 'yearly'])
      .withMessage('Period must be one of: monthly, quarterly, yearly'),

    body('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid date'),

    body('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid date'),

    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters'),

    body('status')
      .optional()
      .isIn(['active', 'inactive', 'completed', 'exceeded'])
      .withMessage('Status must be one of: active, inactive, completed, exceeded')
  ]
};

module.exports = {
  handleValidationErrors,
  validationRules
};
