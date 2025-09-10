const mongoose = require('mongoose');
const User = require('./models/User');
const Branch = require('./models/Branch');
require('dotenv').config();

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://kavindu:kavi123@cluster0.mvgjc1f.mongodb.net/wintergreen', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Check if superAdmin already exists
    let superAdmin = await User.findOne({ role: 'superAdmin' });

    if (superAdmin) {
      console.log('SuperAdmin already exists:', superAdmin.username);
    } else {
      // Create superAdmin user
      superAdmin = new User({
        fullName: 'Super Administrator',
        nicOrPassport: 'SUPER001',
        contactNumber: '+94771234567',
        email: 'superadmin@wintergreen.edu',
        username: 'superadmin',
        password: 'admin123',
        role: 'superAdmin'
      });

      await superAdmin.save();
      console.log('SuperAdmin created successfully');
      console.log('Username: superadmin');
      console.log('Password: admin123');
    }

    // Create sample branches
    const existingBranches = await Branch.find();
    let createdBranches;

    if (existingBranches.length === 0) {
      const branches = [
        { name: 'Colombo', createdBy: superAdmin._id },
        { name: 'Kandy', createdBy: superAdmin._id },
        { name: 'Galle', createdBy: superAdmin._id }
      ];

      createdBranches = await Branch.insertMany(branches);
      console.log('Sample branches created:', createdBranches.map(b => b.name).join(', '));
    } else {
      createdBranches = existingBranches;
      console.log('Branches already exist:', createdBranches.map(b => b.name).join(', '));
    }

    // Create sample admin users for each branch
    const sampleUsers = [
      {
        fullName: 'Colombo Admin',
        nicOrPassport: 'COL001',
        contactNumber: '+94771234568',
        email: 'admin.colombo@wintergreen.edu',
        username: 'admin_colombo',
        password: 'admin123',
        role: 'admin',
        branch: createdBranches[0]._id,
        createdBy: superAdmin._id
      },
      {
        fullName: 'Kandy Admin',
        nicOrPassport: 'KAN001',
        contactNumber: '+94771234569',
        email: 'admin.kandy@wintergreen.edu',
        username: 'admin_kandy',
        password: 'admin123',
        role: 'admin',
        branch: createdBranches[1]._id,
        createdBy: superAdmin._id
      },
      {
        fullName: 'Galle Admin',
        nicOrPassport: 'GAL001',
        contactNumber: '+94771234570',
        email: 'admin.galle@wintergreen.edu',
        username: 'admin_galle',
        password: 'admin123',
        role: 'admin',
        branch: createdBranches[2]._id,
        createdBy: superAdmin._id
      },
      {
        fullName: 'John Moderator',
        nicOrPassport: 'MOD001',
        contactNumber: '+94771234571',
        email: 'moderator@wintergreen.edu',
        username: 'moderator1',
        password: 'mod123',
        role: 'moderator',
        branch: createdBranches[0]._id,
        createdBy: superAdmin._id
      },
      {
        fullName: 'Jane Staff',
        nicOrPassport: 'STF001',
        contactNumber: '+94771234572',
        email: 'staff@wintergreen.edu',
        username: 'staff1',
        password: 'staff123',
        role: 'staff',
        branch: createdBranches[0]._id,
        createdBy: superAdmin._id
      }
    ];

    // Check if users already exist and only create missing ones
    for (const userData of sampleUsers) {
      const existingUser = await User.findOne({ username: userData.username });
      if (!existingUser) {
        const user = new User(userData);
        await user.save();
        console.log(`User created: ${userData.username}`);
      } else {
        // Check if existing user has plain text password and fix it
        if (existingUser.password === userData.password) {
          console.log(`Fixing password hash for existing user: ${userData.username}`);
          existingUser.password = userData.password;
          await existingUser.save();
        } else {
          console.log(`User already exists: ${userData.username}`);
        }
      }
    }

    console.log('\n=== SEED DATA CREATED ===');
    console.log('SuperAdmin:');
    console.log('  Username: superadmin');
    console.log('  Password: admin123');
    console.log('\nBranch Admins:');
    console.log('  Username: admin_colombo, Password: admin123 (Colombo branch)');
    console.log('  Username: admin_kandy, Password: admin123 (Kandy branch)');
    console.log('  Username: admin_galle, Password: admin123 (Galle branch)');
    console.log('\nOther Users:');
    console.log('  Username: moderator1, Password: mod123 (Moderator, Colombo branch)');
    console.log('  Username: staff1, Password: staff123 (Staff, Colombo branch)');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
