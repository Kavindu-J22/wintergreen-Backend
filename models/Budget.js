const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  category: {
    type: String,
    required: [true, 'Budget category is required'],
    trim: true,
    maxlength: [100, 'Category cannot exceed 100 characters']
  },
  allocated: {
    type: Number,
    required: [true, 'Allocated amount is required'],
    min: [0, 'Allocated amount cannot be negative'],
    max: [100000000, 'Allocated amount cannot exceed 100,000,000 LKR']
  },
  spent: {
    type: Number,
    default: 0,
    min: [0, 'Spent amount cannot be negative']
  },
  currency: {
    type: String,
    default: 'LKR',
    enum: ['LKR', 'USD'],
    required: true
  },
  period: {
    type: String,
    required: [true, 'Budget period is required'],
    enum: {
      values: ['monthly', 'quarterly', 'yearly'],
      message: 'Period must be one of: monthly, quarterly, yearly'
    }
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  status: {
    type: String,
    required: [true, 'Budget status is required'],
    enum: {
      values: ['active', 'inactive', 'completed', 'exceeded'],
      message: 'Status must be one of: active, inactive, completed, exceeded'
    },
    default: 'active'
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: [true, 'Branch is required']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
budgetSchema.index({ category: 1 });
budgetSchema.index({ period: 1 });
budgetSchema.index({ status: 1 });
budgetSchema.index({ branch: 1 });
budgetSchema.index({ startDate: 1, endDate: 1 });
budgetSchema.index({ createdBy: 1 });
budgetSchema.index({ isActive: 1 });

// Compound indexes for common queries
budgetSchema.index({ branch: 1, category: 1 });
budgetSchema.index({ branch: 1, period: 1, status: 1 });
budgetSchema.index({ branch: 1, startDate: 1, endDate: 1 });

// Ensure unique budget per category, period, and branch for overlapping dates
budgetSchema.index(
  { branch: 1, category: 1, startDate: 1, endDate: 1 },
  { 
    unique: true,
    partialFilterExpression: { isActive: true }
  }
);

// Pre-save middleware to update the updatedAt field
budgetSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Pre-save validation to ensure end date is after start date
budgetSchema.pre('save', function(next) {
  if (this.endDate <= this.startDate) {
    next(new Error('End date must be after start date'));
  } else {
    next();
  }
});

// Virtual for remaining budget
budgetSchema.virtual('remaining').get(function() {
  return Math.max(0, this.allocated - this.spent);
});

// Virtual for utilization percentage
budgetSchema.virtual('utilizationPercentage').get(function() {
  return this.allocated > 0 ? Math.round((this.spent / this.allocated) * 100) : 0;
});

// Virtual for budget status based on spending
budgetSchema.virtual('budgetStatus').get(function() {
  const utilization = this.utilizationPercentage;
  if (utilization >= 100) return 'exceeded';
  if (utilization >= 80) return 'warning';
  if (utilization >= 50) return 'moderate';
  return 'good';
});

// Method to update spent amount based on transactions
budgetSchema.methods.updateSpentAmount = async function() {
  const Transaction = mongoose.model('Transaction');
  
  const result = await Transaction.aggregate([
    {
      $match: {
        branch: this.branch,
        category: this.category,
        type: 'expense',
        status: 'completed',
        date: {
          $gte: this.startDate,
          $lte: this.endDate
        },
        isActive: true
      }
    },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: '$amount' }
      }
    }
  ]);
  
  this.spent = result.length > 0 ? result[0].totalSpent : 0;
  
  // Update status based on spending
  if (this.spent >= this.allocated) {
    this.status = 'exceeded';
  } else if (new Date() > this.endDate) {
    this.status = 'completed';
  } else {
    this.status = 'active';
  }
  
  return this.save();
};

// Static method to get budget statistics
budgetSchema.statics.getStatistics = async function(branchId, userRole, filters = {}) {
  const matchQuery = { isActive: true };
  
  // Apply branch filter for non-superAdmin users
  if (userRole !== 'superAdmin' && branchId) {
    matchQuery.branch = new mongoose.Types.ObjectId(branchId);
  } else if (branchId) {
    matchQuery.branch = new mongoose.Types.ObjectId(branchId);
  }
  
  // Apply date filters if provided
  if (filters.period) {
    matchQuery.period = filters.period;
  }
  
  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalBudgets: { $sum: 1 },
        totalAllocated: { $sum: '$allocated' },
        totalSpent: { $sum: '$spent' },
        activeBudgets: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        exceededBudgets: {
          $sum: { $cond: [{ $eq: ['$status', 'exceeded'] }, 1, 0] }
        }
      }
    }
  ]);
  
  const result = stats.length > 0 ? stats[0] : {
    totalBudgets: 0,
    totalAllocated: 0,
    totalSpent: 0,
    activeBudgets: 0,
    exceededBudgets: 0
  };
  
  result.totalRemaining = result.totalAllocated - result.totalSpent;
  result.overallUtilization = result.totalAllocated > 0 
    ? Math.round((result.totalSpent / result.totalAllocated) * 100) 
    : 0;
  
  return result;
};

module.exports = mongoose.model('Budget', budgetSchema);
