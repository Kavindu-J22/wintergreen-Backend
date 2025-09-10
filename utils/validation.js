const { body, param, query, validationResult } = require('express-validator');

// Validation middleware to check for errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Common validation rules
const validationRules = {
  // User validation rules
  userRegistration: [
    body('fullName')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Full name must be between 2 and 100 characters'),
    
    body('nicOrPassport')
      .trim()
      .isLength({ min: 5, max: 20 })
      .withMessage('NIC or Passport must be between 5 and 20 characters'),
    
    body('contactNumber')
      .trim()
      .matches(/^[0-9+\-\s()]+$/)
      .withMessage('Please enter a valid contact number'),
    
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email address'),
    
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username must be 3-30 characters and contain only letters, numbers, and underscores'),
    
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    
    body('role')
      .isIn(['admin', 'moderator', 'staff'])
      .withMessage('Role must be one of: admin, moderator, staff'),
    
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
      .isIn(['admin', 'moderator', 'staff'])
      .withMessage('Role must be one of: admin, moderator, staff')
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
    param('userId')
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
