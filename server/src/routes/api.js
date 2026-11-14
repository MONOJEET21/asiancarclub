
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

import { User, Car, Booking } from '../models/index.js';
import { auth, admin } from '../middleware/auth.js';

const r = Router();

// ==========================================
// CLOUDINARY CONFIGURATION
// ==========================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// ==========================================
// MULTER CONFIGURATION
// Images are temporarily stored in memory
// ==========================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_, file, cb) => {
    if (/image\/(jpeg|png|webp)/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG and WEBP images are allowed'));
    }
  }
});

// ==========================================
// CLOUDINARY UPLOAD FUNCTION
// ==========================================

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'asian-car-club/cars',
        resource_type: 'image'
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        if (!result?.secure_url) {
          return reject(new Error('Cloudinary did not return an image URL'));
        }

        resolve(result.secure_url);
      }
    );

    stream.end(buffer);
  });
};

// ==========================================
// JWT TOKEN
// ==========================================

const token = u =>
  jwt.sign(
    {
      id: u._id,
      role: u.role,
      name: u.name
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '7d'
    }
  );

// ==========================================
// CUSTOMER REGISTRATION
// ==========================================

r.post('/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password || password.length < 8) {
      return res.status(400).json({
        message: 'Name, email and a password of at least 8 characters are required'
      });
    }

    if (await User.findOne({ email })) {
      return res.status(409).json({
        message: 'Email already registered'
      });
    }

    const u = await User.create({
      name,
      email,
      phone,
      password: await bcrypt.hash(password, 12)
    });

    res.status(201).json({
      token: token(u),
      user: {
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role
      }
    });
  } catch (e) {
    res.status(500).json({
      message: 'Could not register'
    });
  }
});

// ==========================================
// LOGIN
// ==========================================

r.post('/auth/login', async (req, res) => {
  const u = await User.findOne({
    email: req.body.email
  });

  if (!u || !await bcrypt.compare(req.body.password || '', u.password)) {
    return res.status(401).json({
      message: 'Invalid email or password'
    });
  }

  res.json({
    token: token(u),
    user: {
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role
    }
  });
});

// ==========================================
// PUBLIC CAR LISTING
// ==========================================

r.get('/cars', async (req, res) => {
  const q = {
    active: true
  };

  if (req.query.category && req.query.category !== 'All') {
    q.category = req.query.category;
  }

  if (req.query.search) {
    q.$or = [
      { name: new RegExp(req.query.search, 'i') },
      { brand: new RegExp(req.query.search, 'i') }
    ];
  }

  res.json(
    await Car.find(q).sort({
      createdAt: -1
    })
  );
});

// ==========================================
// SINGLE CAR DETAILS
// ==========================================

r.get('/cars/:id', async (req, res) => {
  const c = await Car.findById(req.params.id);

  if (!c) {
    return res.status(404).json({
      message: 'Car not found'
    });
  }

  res.json(c);
});

// ==========================================
// CREATE BOOKING
// ==========================================

r.post('/bookings', auth, async (req, res) => {
  try {
    const {
      carId,
      startDate,
      endDate,
      address,
      phone,
      pickupLocation
    } = req.body;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!startDate || !endDate || isNaN(start) || isNaN(end) || end <= start) {
      return res.status(400).json({
        message: 'Choose valid rental dates'
      });
    }

    if (start < new Date(new Date().setHours(0, 0, 0, 0))) {
      return res.status(400).json({
        message: 'Pickup date cannot be in the past'
      });
    }

    const car = await Car.findById(carId);

    if (!car || !car.active || car.manualBlocked || car.stock < 1) {
      return res.status(409).json({
        message: 'This car is currently unavailable'
      });
    }

    const days = Math.ceil((end - start) / 86400000);

    const overlapping = await Booking.countDocuments({
      car: carId,
      status: {
        $in: ['pending', 'accepted']
      },
      startDate: {
        $lt: end
      },
      endDate: {
        $gt: start
      }
    });

    if (overlapping >= car.stock) {
      return res.status(409).json({
        message: 'This car is already booked for those dates'
      });
    }

    const user = await User.findById(req.user.id);

    const b = await Booking.create({
      user: user._id,
      car: car._id,
      carName: car.name,
      customerName: user.name,
      email: user.email,
      phone: phone || user.phone,
      address,
      pickupLocation,
      startDate: start,
      endDate: end,
      days,
      pricePerDay: car.price,
      total: days * car.price
    });

    res.status(201).json(b);

  } catch (e) {
    res.status(500).json({
      message: 'Could not create booking'
    });
  }
});

// ==========================================
// CUSTOMER BOOKINGS
// ==========================================

r.get('/bookings/mine', auth, async (req, res) => {
  res.json(
    await Booking.find({
      user: req.user.id
    }).sort({
      createdAt: -1
    })
  );
});

// ==========================================
// RAZORPAY CREATE ORDER
// ==========================================

r.post('/payments/order', auth, async (req, res) => {
  try {
    if (
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      return res.status(503).json({
        message: 'Online payment is not configured yet. Contact the rental team.'
      });
    }

    const b = await Booking.findOne({
      _id: req.body.bookingId,
      user: req.user.id
    });

    if (!b) {
      return res.status(404).json({
        message: 'Booking not found'
      });
    }

    const rz = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const order = await rz.orders.create({
      amount: Math.round(b.total * 100),
      currency: 'INR',
      receipt: String(b._id)
    });

    b.paymentOrderId = order.id;
    await b.save();

    res.json({
      order,
      key: process.env.RAZORPAY_KEY_ID,
      booking: b
    });

  } catch (e) {
    res.status(500).json({
      message: 'Unable to start payment'
    });
  }
});

// ==========================================
// RAZORPAY PAYMENT VERIFICATION
// ==========================================

r.post('/payments/verify', auth, async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    bookingId
  } = req.body;

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  const received = String(razorpay_signature || '');

  if (
    received.length !== expected.length ||
    !crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(received)
    )
  ) {
    return res.status(400).json({
      message: 'Payment verification failed'
    });
  }

  const b = await Booking.findOne({
    _id: bookingId,
    user: req.user.id,
    paymentOrderId: razorpay_order_id
  });

  if (!b) {
    return res.status(404).json({
      message: 'Booking not found'
    });
  }

  b.paymentStatus = 'paid';
  b.paymentId = razorpay_payment_id;

  await b.save();

  res.json({
    message: 'Payment successful',
    booking: b
  });
});

// ==========================================
// ADMIN DASHBOARD SUMMARY
// ==========================================

r.get('/admin/summary', auth, admin, async (req, res) => {
  const [
    cars,
    bookings,
    paid,
    recent,
    monthly
  ] = await Promise.all([
    Car.countDocuments(),

    Booking.countDocuments(),

    Booking.aggregate([
      {
        $match: {
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          revenue: {
            $sum: '$total'
          }
        }
      }
    ]),

    Booking.find()
      .sort({ createdAt: -1 })
      .limit(8),

    Booking.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          createdAt: {
            $gte: new Date(
              new Date().getFullYear(),
              new Date().getMonth() - 5,
              1
            )
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m',
              date: '$createdAt'
            }
          },
          revenue: {
            $sum: '$total'
          },
          orders: {
            $sum: 1
          }
        }
      },
      {
        $sort: {
          _id: 1
        }
      }
    ])
  ]);

  res.json({
    cars,
    bookings,
    revenue: paid[0]?.revenue || 0,
    recent,
    monthly
  });
});

// ==========================================
// ADMIN CAR MANAGEMENT
// ==========================================

r.get('/admin/cars', auth, admin, async (req, res) => {
  res.json(
    await Car.find().sort({
      createdAt: -1
    })
  );
});

// ==========================================
// ADD CAR WITH CLOUDINARY IMAGE UPLOAD
// ==========================================

r.post(
  '/admin/cars',
  auth,
  admin,
  upload.single('photo'),
  async (req, res) => {
    try {
      let imageUrl = req.body.image;

      if (req.file) {
        imageUrl = await uploadToCloudinary(req.file.buffer);
      }

      const data = {
        ...req.body,
        price: Number(req.body.price),
        stock: Number(req.body.stock),
        seats: Number(req.body.seats),
        image: imageUrl
      };

      const car = await Car.create(data);

      res.status(201).json(car);

    } catch (e) {
      console.error('Cloudinary car upload error:', e);

      res.status(500).json({
        message: 'Could not add car or upload its image'
      });
    }
  }
);

// ==========================================
// UPDATE CAR WITH CLOUDINARY IMAGE UPLOAD
// ==========================================

r.put(
  '/admin/cars/:id',
  auth,
  admin,
  upload.single('photo'),
  async (req, res) => {
    try {
      const data = {
        ...req.body
      };

      for (const k of ['price', 'stock', 'seats']) {
        if (data[k] !== undefined) {
          data[k] = Number(data[k]);
        }
      }

      if (req.file) {
        data.image = await uploadToCloudinary(req.file.buffer);
      }

      const car = await Car.findByIdAndUpdate(
        req.params.id,
        data,
        {
          new: true,
          runValidators: true
        }
      );

      if (!car) {
        return res.status(404).json({
          message: 'Car not found'
        });
      }

      res.json(car);

    } catch (e) {
      console.error('Cloudinary car update error:', e);

      res.status(500).json({
        message: 'Could not update car or upload its image'
      });
    }
  }
);

// ==========================================
// DELETE CAR
// ==========================================

r.delete('/admin/cars/:id', auth, admin, async (req, res) => {
  await Car.findByIdAndDelete(req.params.id);

  res.json({
    message: 'Car removed'
  });
});

// ==========================================
// ADMIN BOOKING MANAGEMENT
// ==========================================

r.get('/admin/bookings', auth, admin, async (req, res) => {
  res.json(
    await Booking.find().sort({
      createdAt: -1
    })
  );
});

// ==========================================
// UPDATE BOOKING STATUS
// ==========================================

r.patch('/admin/bookings/:id', auth, admin, async (req, res) => {
  const allowed = [
    'pending',
    'accepted',
    'rejected',
    'cancelled',
    'completed'
  ];

  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({
      message: 'Invalid status'
    });
  }

  res.json(
    await Booking.findByIdAndUpdate(
      req.params.id,
      {
        status: req.body.status,
        adminNote: req.body.adminNote
      },
      {
        new: true
      }
    )
  );
});

// ==========================================
// BLOCK / UNBLOCK CAR
// ==========================================

r.patch('/admin/cars/:id/block', auth, admin, async (req, res) => {
  res.json(
    await Car.findByIdAndUpdate(
      req.params.id,
      {
        manualBlocked: !!req.body.blocked
      },
      {
        new: true
      }
    )
  );
});

// ==========================================
// ADMIN SEED ROUTE
// ==========================================

r.post('/admin/seed', async (req, res) => {
  if (await User.findOne({ role: 'admin' })) {
    return res.status(409).json({
      message: 'Admin already exists'
    });
  }

  const {
    name,
    email,
    password,
    secret
  } = req.body;

  if (
    secret !== process.env.ADMIN_SEED_SECRET ||
    !name ||
    !email ||
    !password ||
    password.length < 12
  ) {
    return res.status(403).json({
      message: 'Invalid setup credentials'
    });
  }

  const u = await User.create({
    name,
    email,
    password: await bcrypt.hash(password, 12),
    role: 'admin'
  });

  res.status(201).json({
    message: 'Admin created',
    email: u.email
  });
});

export default r;
