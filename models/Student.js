const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: [true, 'Student ID is required'],
    unique: true,
    trim: true,
    maxlength: [20, 'Student ID cannot exceed 20 characters']
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Full name must be at least 2 characters long'],
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[0-9+\-\s()]+$/, 'Please enter a valid phone number']
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters']
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required'],
    validate: {
      validator: function(value) {
        return value < new Date();
      },
      message: 'Date of birth must be in the past'
    }
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course is required']
  },
  modules: [{
    type: String,
    trim: true,
    maxlength: [200, 'Module name cannot exceed 200 characters']
  }],
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: [true, 'Branch is required']
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: {
      values: ['Active', 'Inactive', 'Suspended', 'Graduated', 'Dropped'],
      message: 'Status must be one of: Active, Inactive, Suspended, Graduated, Dropped'
    },
    default: 'Active'
  },
  enrollmentDate: {
    type: Date,
    required: [true, 'Enrollment date is required'],
    default: Date.now
  },
  // Care services
  childBabyCare: {
    type: Boolean,
    default: false
  },
  elderCare: {
    type: Boolean,
    default: false
  },
  // Document uploads
  documents: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    url: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['image', 'pdf', 'document'],
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Personal documents checklist
  personalDocuments: {
    birthCertificate: {
      type: Boolean,
      default: false
    },
    gramaNiladhariCertificate: {
      type: Boolean,
      default: false
    },
    guardianSpouseLetter: {
      type: Boolean,
      default: false
    },
    originalCertificate: {
      hasDocument: {
        type: Boolean,
        default: false
      },
      title: {
        type: String,
        trim: true,
        maxlength: [200, 'Certificate title cannot exceed 200 characters']
      }
    }
  },
  // Additional requirements
  hostelRequirement: {
    type: Boolean,
    default: false
  },
  mealRequirement: {
    type: Boolean,
    default: false
  },
  level: {
    type: String,
    required: [true, 'Level is required'],
    enum: {
      values: ['Beginner', 'Intermediate', 'Advanced'],
      message: 'Level must be one of: Beginner, Intermediate, Advanced'
    },
    default: 'Beginner'
  },
  certifications: [{
    type: String,
    trim: true,
    maxlength: [200, 'Certification name cannot exceed 200 characters']
  }],
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
studentSchema.index({ studentId: 1 });
studentSchema.index({ email: 1 });
studentSchema.index({ course: 1 });
studentSchema.index({ branch: 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ isActive: 1 });
studentSchema.index({ enrollmentDate: 1 });

// Pre-save middleware to update the updatedAt field
studentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to generate student ID
studentSchema.statics.generateStudentId = async function(courseId) {
  const Course = mongoose.model('Course');
  const course = await Course.findById(courseId);
  
  if (!course) {
    throw new Error('Course not found');
  }
  
  // Extract first letters from course title words
  const words = course.title.split(' ');
  let prefix = '';
  
  for (const word of words) {
    if (word.length > 0 && /^[A-Za-z]/.test(word)) {
      prefix += word.charAt(0).toUpperCase();
    }
  }
  
  // Fallback if no valid letters found
  if (prefix.length === 0) {
    prefix = 'STU';
  }
  
  // Limit prefix to 6 characters max
  prefix = prefix.substring(0, 6);
  
  // Get current enrolled count and increment
  const nextNumber = course.currentEnrolled + 1;
  
  // Format with leading zeros (4 digits)
  const studentId = `${prefix}${String(nextNumber).padStart(4, '0')}`;
  
  return studentId;
};

// Static method to find students by branch
studentSchema.statics.findByBranch = function(branchId, userRole = null) {
  let query = { isActive: true };
  
  if (userRole === 'superAdmin') {
    // SuperAdmin can see all students or filter by specific branch
    if (branchId) {
      query.branch = branchId;
    }
  } else {
    // Other users can only see students from their branch
    query.branch = branchId;
  }
  
  return this.find(query)
    .populate('course', 'title')
    .populate('branch', 'name')
    .populate('createdBy', 'fullName username')
    .sort({ createdAt: -1 });
};

// Static method to get student statistics
studentSchema.statics.getStatistics = async function(branchId = null, userRole = null) {
  const mongoose = require('mongoose');
  let matchQuery = { isActive: true };

  if (branchId) {
    try {
      // Validate ObjectId format first
      if (typeof branchId === 'string' && !mongoose.Types.ObjectId.isValid(branchId)) {
        console.warn('Invalid branch ID format in Student.getStatistics:', branchId);
        return {
          totalStudents: 0,
          activeStudents: 0,
          graduatedStudents: 0
        };
      }

      // Convert to ObjectId if it's a string
      const branchObjectId = typeof branchId === 'string' ? mongoose.Types.ObjectId.createFromHexString(branchId) : branchId;
      matchQuery.branch = branchObjectId;
    } catch (error) {
      console.error('Invalid branch ID in Student.getStatistics:', error);
      // Return empty stats if invalid branch ID
      return {
        totalStudents: 0,
        activeStudents: 0,
        graduatedStudents: 0
      };
    }
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalStudents: { $sum: 1 },
        activeStudents: {
          $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
        },
        graduatedStudents: {
          $sum: { $cond: [{ $eq: ['$status', 'Graduated'] }, 1, 0] }
        }
      }
    }
  ]);

  return stats.length > 0 ? stats[0] : {
    totalStudents: 0,
    activeStudents: 0,
    graduatedStudents: 0
  };
};

module.exports = mongoose.model('Student', studentSchema);
