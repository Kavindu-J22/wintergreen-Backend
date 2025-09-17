const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Course title is required'],
    trim: true,
    minlength: [3, 'Course title must be at least 3 characters long'],
    maxlength: [200, 'Course title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Course description is required'],
    trim: true,
    minlength: [10, 'Course description must be at least 10 characters long'],
    maxlength: [1000, 'Course description cannot exceed 1000 characters']
  },
  duration: {
    type: String,
    required: [true, 'Course duration is required'],
    trim: true,
    maxlength: [100, 'Course duration cannot exceed 100 characters']
  },
  price: {
    type: Number,
    required: [true, 'Course price is required'],
    min: [0, 'Course price cannot be negative'],
    max: [1000000, 'Course price cannot exceed 1,000,000 LKR']
  },
  currency: {
    type: String,
    default: 'LKR',
    enum: ['LKR', 'USD'],
    required: true
  },
  maxStudents: {
    type: Number,
    required: [true, 'Maximum students is required'],
    min: [1, 'Maximum students must be at least 1'],
    max: [100, 'Maximum students cannot exceed 100']
  },
  currentEnrolled: {
    type: Number,
    default: 0,
    min: [0, 'Current enrolled cannot be negative']
  },
  schedule: {
    type: String,
    required: [true, 'Course schedule is required'],
    trim: true,
    maxlength: [200, 'Course schedule cannot exceed 200 characters']
  },
  instructor: {
    type: String,
    required: [true, 'Course instructor is required'],
    trim: true,
    maxlength: [100, 'Instructor name cannot exceed 100 characters']
  },
  nextStart: {
    type: Date,
    required: [true, 'Next start date is required']
  },
  status: {
    type: String,
    required: [true, 'Course status is required'],
    enum: {
      values: ['Draft', 'Active', 'Inactive', 'Completed'],
      message: 'Status must be one of: Draft, Active, Inactive, Completed'
    },
    default: 'Draft'
  },
  modules: [{
    type: String,
    trim: true,
    maxlength: [200, 'Module name cannot exceed 200 characters']
  }],
  branch: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and string
    required: [true, 'Branch is required'],
    validate: {
      validator: function(value) {
        // Allow 'all' string or valid ObjectId
        return value === 'all' || mongoose.Types.ObjectId.isValid(value);
      },
      message: 'Branch must be a valid ID or "all"'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
courseSchema.index({ title: 1 });
courseSchema.index({ status: 1 });
courseSchema.index({ branch: 1 });
courseSchema.index({ isActive: 1 });
courseSchema.index({ nextStart: 1 });
courseSchema.index({ createdBy: 1 });

// Pre-save middleware to update the updatedAt field
courseSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for enrollment percentage
courseSchema.virtual('enrollmentPercentage').get(function() {
  return this.maxStudents > 0 ? Math.round((this.currentEnrolled / this.maxStudents) * 100) : 0;
});

// Virtual for revenue
courseSchema.virtual('revenue').get(function() {
  return this.price * this.currentEnrolled;
});

// Instance method to check if course is full
courseSchema.methods.isFull = function() {
  return this.currentEnrolled >= this.maxStudents;
};

// Instance method to get available spots
courseSchema.methods.getAvailableSpots = function() {
  return Math.max(0, this.maxStudents - this.currentEnrolled);
};

// Static method to find active courses
courseSchema.statics.findActive = function() {
  return this.find({ status: 'Active', isActive: true }).sort({ nextStart: 1 });
};

// Static method to find courses by branch
courseSchema.statics.findByBranch = function(branchId) {
  return this.find({ branch: branchId, isActive: true })
    .populate('branch', 'name')
    .populate('createdBy', 'fullName username')
    .sort({ createdAt: -1 });
};

// Static method to get course statistics
courseSchema.statics.getStatistics = async function(branchId = null, userRole = null) {
  let matchQuery = { isActive: true };

  if (branchId) {
    if (userRole === 'superAdmin') {
      // SuperAdmin can see specific branch stats
      matchQuery.branch = branchId;
    } else {
      // Branch users see their branch courses + "All Branches" courses
      matchQuery.$or = [
        { branch: branchId },
        { branch: 'all' }
      ];
    }
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalCourses: { $sum: 1 },
        activeCourses: {
          $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
        },
        totalEnrolled: { $sum: '$currentEnrolled' },
        totalRevenue: { $sum: { $multiply: ['$price', '$currentEnrolled'] } },
        averagePrice: { $avg: '$price' },
        totalCapacity: { $sum: '$maxStudents' }
      }
    }
  ]);

  return stats.length > 0 ? stats[0] : {
    totalCourses: 0,
    activeCourses: 0,
    totalEnrolled: 0,
    totalRevenue: 0,
    averagePrice: 0,
    totalCapacity: 0
  };
};

module.exports = mongoose.model('Course', courseSchema);
