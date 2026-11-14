
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from './src/models/index.js';

async function updateAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const admin = await User.findOne({ role: 'admin' });

    if (!admin) {
      console.log('No existing admin found.');
      return;
    }

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || 'Asian Car Club Admin';

    if (!email || !password || password.length < 12) {
      throw new Error('Check ADMIN_EMAIL and ADMIN_PASSWORD in .env. Password must be at least 12 characters.');
    }

    const existingUser = await User.findOne({
      email,
      _id: { $ne: admin._id }
    });

    if (existingUser) {
      throw new Error('This email already belongs to another account.');
    }

    admin.name = name;
    admin.email = email;
    admin.password = await bcrypt.hash(password, 12);
    admin.role = 'admin';

    await admin.save();

    console.log('Admin account updated successfully!');
    console.log('Admin email:', admin.email);

  } catch (error) {
    console.error('Update failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

updateAdmin();
