const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Branch name is required'],
    trim: true,
    unique: true,
    minlength: [2, 'Branch name must be at least 2 characters long'],
    maxlength: [100, 'Branch name cannot exceed 100 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

// Index for better query performance
branchSchema.index({ name: 1 });
branchSchema.index({ isActive: 1 });

// Pre-save middleware to update the updatedAt field
branchSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to get active users count
branchSchema.methods.getActiveUsersCount = async function() {
  const User = mongoose.model('User');
  return await User.countDocuments({ branch: this._id, isActive: true });
};

// Static method to find active branches
branchSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

module.exports = mongoose.model('Branch', branchSchema);
