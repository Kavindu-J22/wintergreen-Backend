const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: {
      values: ['income', 'expense'],
      message: 'Transaction type must be either income or expense'
    }
  },
  category: {
    type: String,
    required: [true, 'Transaction category is required'],
    trim: true,
    maxlength: [100, 'Category cannot exceed 100 characters']
  },
  amount: {
    type: Number,
    required: [true, 'Transaction amount is required'],
    min: [0.01, 'Amount must be greater than 0'],
    max: [10000000, 'Amount cannot exceed 10,000,000 LKR']
  },
  currency: {
    type: String,
    default: 'LKR',
    enum: ['LKR', 'USD'],
    required: true
  },
  description: {
    type: String,
    required: [true, 'Transaction description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  date: {
    type: Date,
    required: [true, 'Transaction date is required'],
    default: Date.now
  },
  status: {
    type: String,
    required: [true, 'Transaction status is required'],
    enum: {
      values: ['pending', 'completed', 'cancelled'],
      message: 'Status must be one of: pending, completed, cancelled'
    },
    default: 'pending'
  },
  reference: {
    type: String,
    trim: true,
    maxlength: [50, 'Reference cannot exceed 50 characters'],
    unique: true,
    sparse: true // Allow multiple null values
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: false
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: false
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
transactionSchema.index({ type: 1 });
transactionSchema.index({ category: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ date: -1 });
transactionSchema.index({ branch: 1 });
transactionSchema.index({ student: 1 });
transactionSchema.index({ course: 1 });
transactionSchema.index({ createdBy: 1 });
transactionSchema.index({ isActive: 1 });
transactionSchema.index({ reference: 1 });

// Compound indexes for common queries
transactionSchema.index({ branch: 1, type: 1, status: 1 });
transactionSchema.index({ branch: 1, date: -1 });
transactionSchema.index({ branch: 1, category: 1 });

// Pre-save middleware to update the updatedAt field
transactionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Pre-save middleware to generate reference if not provided
transactionSchema.pre('save', async function(next) {
  if (!this.reference && this.isNew) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const typePrefix = this.type === 'income' ? 'IN' : 'EX';
    
    // Find the last transaction with similar reference pattern
    const lastTransaction = await this.constructor.findOne({
      reference: new RegExp(`^${typePrefix}-${year}${month}-`),
      branch: this.branch
    }).sort({ reference: -1 });
    
    let sequence = 1;
    if (lastTransaction && lastTransaction.reference) {
      const lastSequence = parseInt(lastTransaction.reference.split('-').pop());
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }
    
    this.reference = `${typePrefix}-${year}${month}-${String(sequence).padStart(4, '0')}`;
  }
  next();
});

// Static method to get transaction statistics
transactionSchema.statics.getStatistics = async function(branchId, userRole, filters = {}) {
  const matchQuery = { isActive: true };

  // Apply branch filter
  if (branchId) {
    try {
      // Convert to ObjectId if it's a string
      const branchObjectId = typeof branchId === 'string' ? mongoose.Types.ObjectId.createFromHexString(branchId) : branchId;
      matchQuery.branch = branchObjectId;
    } catch (error) {
      console.error('Invalid branch ID in Transaction.getStatistics:', error);
      // Return empty stats if invalid branch ID
      return {
        totalTransactions: 0,
        totalRevenue: 0,
        totalExpenses: 0,
        netIncome: 0,
        averageTransactionAmount: 0,
        revenueByType: {},
        expensesByType: {}
      };
    }
  }

  // Apply date filters if provided
  if (filters.startDate || filters.endDate) {
    matchQuery.date = {};
    if (filters.startDate) {
      matchQuery.date.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      matchQuery.date.$lte = new Date(filters.endDate);
    }
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalIncome: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$type', 'income'] }, { $eq: ['$status', 'completed'] }] },
              '$amount',
              0
            ]
          }
        },
        totalExpenses: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$type', 'expense'] }, { $eq: ['$status', 'completed'] }] },
              '$amount',
              0
            ]
          }
        },
        pendingIncome: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$type', 'income'] }, { $eq: ['$status', 'pending'] }] },
              '$amount',
              0
            ]
          }
        },
        pendingExpenses: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$type', 'expense'] }, { $eq: ['$status', 'pending'] }] },
              '$amount',
              0
            ]
          }
        },
        pendingTransactions: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        }
      }
    }
  ]);

  const result = stats.length > 0 ? stats[0] : {
    totalTransactions: 0,
    totalIncome: 0,
    totalExpenses: 0,
    pendingIncome: 0,
    pendingExpenses: 0,
    pendingTransactions: 0
  };

  result.netProfit = result.totalIncome - result.totalExpenses;

  return result;
};

module.exports = mongoose.model('Transaction', transactionSchema);
