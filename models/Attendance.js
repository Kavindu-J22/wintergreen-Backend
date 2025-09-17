const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Student is required']
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course is required']
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: [true, 'Branch is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    validate: {
      validator: function(value) {
        // Ensure date is not more than 1 day in the future (to account for timezone differences)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 59, 999); // End of tomorrow
        return value <= tomorrow;
      },
      message: 'Attendance date cannot be more than 1 day in the future'
    }
  },
  status: {
    type: String,
    required: [true, 'Attendance status is required'],
    enum: {
      values: ['Present', 'Absent', 'Late', 'Excused'],
      message: 'Status must be one of: Present, Absent, Late, Excused'
    }
  },
  timeIn: {
    type: String,
    validate: {
      validator: function(value) {
        // Only validate if timeIn is provided
        if (!value) return true;
        // Validate HH:MM format
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value);
      },
      message: 'Time must be in HH:MM format'
    }
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Marked by user is required']
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

// Compound indexes for better query performance
attendanceSchema.index({ student: 1, date: 1, course: 1 }, { unique: true }); // Prevent duplicate attendance for same student, date, course
attendanceSchema.index({ course: 1, date: 1 }); // For course-wise attendance queries
attendanceSchema.index({ branch: 1, date: 1 }); // For branch-wise attendance queries
attendanceSchema.index({ date: 1, status: 1 }); // For date and status filtering
attendanceSchema.index({ student: 1, date: -1 }); // For student attendance history
attendanceSchema.index({ markedBy: 1, createdAt: -1 }); // For audit trails
attendanceSchema.index({ isActive: 1 });

// Pre-save middleware to update the updatedAt field and set lastModifiedBy
attendanceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Set timeIn automatically for Present/Late status if not provided
  if ((this.status === 'Present' || this.status === 'Late') && !this.timeIn) {
    const now = new Date();
    this.timeIn = now.toTimeString().slice(0, 5); // HH:MM format
  }
  
  // Clear timeIn for Absent/Excused status
  if (this.status === 'Absent' || this.status === 'Excused') {
    this.timeIn = undefined;
  }
  
  next();
});

// Static method to get attendance statistics for a course on a specific date
attendanceSchema.statics.getAttendanceStats = async function(courseId, date, branchId = null) {
  const matchQuery = {
    course: courseId,
    date: new Date(date),
    isActive: true
  };
  
  if (branchId) {
    matchQuery.branch = branchId;
  }
  
  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Convert to object format
  const result = {
    Present: 0,
    Absent: 0,
    Late: 0,
    Excused: 0,
    total: 0
  };
  
  stats.forEach(stat => {
    result[stat._id] = stat.count;
    result.total += stat.count;
  });
  
  return result;
};

// Static method to get attendance records with filtering and pagination
attendanceSchema.statics.getFilteredAttendance = function(filters = {}, options = {}) {
  const {
    courseId,
    branchId,
    studentId,
    date,
    dateFrom,
    dateTo,
    status,
    userRole,
    userBranchId
  } = filters;
  
  const {
    page = 1,
    limit = 50,
    sort = { date: -1, createdAt: -1 }
  } = options;
  
  let matchQuery = { isActive: true };
  
  // Apply filters
  if (courseId) matchQuery.course = courseId;
  if (studentId) matchQuery.student = studentId;
  if (status) matchQuery.status = status;
  
  // Date filtering
  if (date) {
    matchQuery.date = new Date(date);
  } else if (dateFrom || dateTo) {
    matchQuery.date = {};
    if (dateFrom) matchQuery.date.$gte = new Date(dateFrom);
    if (dateTo) matchQuery.date.$lte = new Date(dateTo);
  }
  
  // Branch filtering based on user role
  if (userRole === 'superAdmin') {
    // SuperAdmin can see all branches or filter by specific branch
    if (branchId) matchQuery.branch = branchId;
  } else {
    // Other users can only see their branch
    matchQuery.branch = userBranchId;
  }
  
  const skip = (page - 1) * limit;
  
  return this.find(matchQuery)
    .populate('student', 'studentId fullName email')
    .populate('course', 'title')
    .populate('branch', 'name')
    .populate('markedBy', 'fullName username')
    .populate('lastModifiedBy', 'fullName username')
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// Static method to bulk create/update attendance
attendanceSchema.statics.bulkUpsertAttendance = async function(attendanceRecords, markedByUserId) {
  const operations = attendanceRecords.map(record => ({
    updateOne: {
      filter: {
        student: record.student,
        course: record.course,
        date: new Date(record.date)
      },
      update: {
        $set: {
          status: record.status,
          timeIn: record.timeIn,
          notes: record.notes,
          branch: record.branch,
          lastModifiedBy: markedByUserId,
          updatedAt: new Date()
        },
        $setOnInsert: {
          markedBy: markedByUserId,
          createdAt: new Date()
        }
      },
      upsert: true
    }
  }));
  
  return this.bulkWrite(operations);
};

// Instance method to check if attendance can be modified by user
attendanceSchema.methods.canModify = function(userRole, userBranchId) {
  // SuperAdmin and Admin can modify any attendance in their scope
  if (userRole === 'superAdmin') return true;
  if (userRole === 'admin' && this.branch.toString() === userBranchId.toString()) return true;
  
  // Moderator can modify attendance in their branch
  if (userRole === 'moderator' && this.branch.toString() === userBranchId.toString()) return true;
  
  // Staff can only view, not modify
  return false;
};

// Virtual for formatted date
attendanceSchema.virtual('formattedDate').get(function() {
  return this.date.toISOString().split('T')[0];
});

// Virtual for formatted time
attendanceSchema.virtual('formattedTime').get(function() {
  return this.timeIn || 'N/A';
});

// Ensure virtual fields are serialized
attendanceSchema.set('toJSON', { virtuals: true });
attendanceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
