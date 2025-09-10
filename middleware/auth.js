const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ message: 'Access token is required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database to ensure they still exist and are active
    const user = await User.findById(decoded.userId)
      .populate('branch', 'name isActive')
      .select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Check if user's branch is still active (except for superAdmin)
    if (user.role !== 'superAdmin' && (!user.branch || !user.branch.isActive)) {
      return res.status(401).json({ message: 'User branch is inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    
    console.error('Authentication error:', error);
    return res.status(500).json({ message: 'Authentication failed' });
  }
};

// Middleware to check if user has required role
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Insufficient permissions',
        required: roles,
        current: req.user.role
      });
    }

    next();
  };
};

// Middleware to check if user is superAdmin
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.user.role !== 'superAdmin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }

  next();
};

// Middleware to check if user is admin of the branch or superAdmin
const requireBranchAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const { branchId } = req.params;
  
  // SuperAdmin can access any branch
  if (req.user.role === 'superAdmin') {
    return next();
  }

  // Admin can only access their own branch
  if (req.user.role === 'admin' && req.user.branch._id.toString() === branchId) {
    return next();
  }

  return res.status(403).json({ message: 'Branch admin access required' });
};

// Middleware to check if user can access the branch
const requireBranchAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const { branchId } = req.params;
  
  // SuperAdmin can access any branch
  if (req.user.role === 'superAdmin') {
    return next();
  }

  // Other users can only access their own branch
  if (req.user.branch._id.toString() === branchId) {
    return next();
  }

  return res.status(403).json({ message: 'Access denied to this branch' });
};

// Middleware to validate branch ownership for non-superAdmin users
const validateBranchOwnership = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  // SuperAdmin can work with any branch
  if (req.user.role === 'superAdmin') {
    return next();
  }

  // For other users, ensure they can only work with their own branch
  const branchId = req.body.branch || req.params.branchId;
  
  if (branchId && req.user.branch._id.toString() !== branchId) {
    return res.status(403).json({ message: 'Cannot access other branches' });
  }

  next();
};

module.exports = {
  authenticateToken,
  requireRole,
  requireSuperAdmin,
  requireBranchAdmin,
  requireBranchAccess,
  validateBranchOwnership
};
