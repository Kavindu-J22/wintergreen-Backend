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
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Full name must be between 2 and 100 characters'),
    
    body('nicOrPassport')
      .optional()
      .trim()
      .isLength({ min: 5, max: 20 })
      .withMessage('NIC or Passport must be between 5 and 20 characters'),
    
    body('contactNumber')
      .optional()
      .trim()
      .matches(/^[0-9+\-\s()]+$/)
      .withMessage('Please enter a valid contact number'),
    
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email address'),
    
    body('role')
      .optional()
      .isIn(['superAdmin', 'admin', 'moderator', 'staff'])
      .withMessage('Role must be one of: superAdmin, admin, moderator, staff')
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
