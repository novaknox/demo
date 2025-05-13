require('dotenv').config(); // Load environment variables from .env
const express = require('express');
const app = express();
const PORT = 3000;
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const rateLimit = require('express-rate-limit');

// Twilio credentials (from .env file)
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = new twilio(accountSid, authToken);

// Your Twilio and personal phone numbers
const twilioPhoneNumber = process.env.TWILIO_NUMBER;
const recipientPhoneNumber = process.env.MY_PHONE;

// Create a rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Middleware setup
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('Frontend'));

// Apply rate limiter to all requests (or specific ones like '/submit-booking')
app.use(limiter);

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'tent_booking'
});

db.connect(err => {
  if (err) {
    console.error("❌ MySQL connection error:", err);
    return;
  }
  console.log("✅ Connected to MySQL Database.");
});

// ---------------------------
// ✅ Submit Booking with SMS
// ---------------------------
app.post("/submit-booking", (req, res) => {
  const {
    fullName, phone, whatsapp, email, gender,
    checkIn, checkOut, guests,
    tentType, tentCount, meal, activities, requests
  } = req.body;

  const sql = `
    INSERT INTO bookings 
    (full_name, phone, whatsapp, email, gender, check_in, check_out, guests, tent_type, tent_count, meal_preference, activities, special_requests)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    fullName, phone, whatsapp, email, gender,
    checkIn, checkOut, guests,
    tentType, tentCount, meal, activities, requests
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("❌ Booking insert failed:", err);
      return res.status(500).send("Server error while booking.");
    }

    // Send SMS notification
    const sms =
      `🛎️ New Booking!
Name: ${fullName}
Phone: ${phone}
Email: ${email}
Check-in: ${checkIn}
Check-out: ${checkOut}
Tent: ${tentType} × ${tentCount}
Guests: ${guests}
Meal: ${meal}
Activities: ${activities}`;

    client.messages.create({
      body: sms,
      to: recipientPhoneNumber,
      from: twilioPhoneNumber
    })
      .then(msg => {
        console.log("✅ Booking SMS sent:", msg.sid);
        res.send("✅ Booking saved and SMS sent!");
      })
      .catch(error => {
        console.error("❌ SMS error:", error);
        res.status(500).json({ message: "SMS failed", error: error.message });
      });
  });
});

// ---------------------------
// ✅ Contact Form with SMS
// ---------------------------
app.post('/api/contact', (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  const query = `INSERT INTO messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)`;

  db.query(query, [name, email, phone, subject, message], (err, result) => {
    if (err) {
      console.error("❌ Contact insert error:", err);
      return res.status(500).json({ success: false });
    }

    // SMS content
    const smsMessage =
      `📩 New Message!
From: ${name}
Email: ${email}
Phone: ${phone}
Subject: ${subject}
Message: ${message}`;

    client.messages.create({
      body: smsMessage,
      to: recipientPhoneNumber,
      from: twilioPhoneNumber
    })
      .then(msg => {
        console.log("✅ Contact SMS sent:", msg.sid);
        res.json({ success: true, message: "Saved and SMS sent!" });
      })
      .catch(error => {
        console.error("❌ SMS error:", error);
        res.status(500).json({ success: false, message: "Saved but SMS failed." });
      });
  });
});

// ---------------------------
// ✅ Admin Login (Static)
// ---------------------------
app.post('/login', (req, res) => {
  const { admin_id, password } = req.body;

  const validAdminId = 'admin123';
  const validPassword = 'adminpassword';

  if (admin_id === validAdminId && password === validPassword) {
    res.redirect('/admin');
  } else {
    res.send('<script>alert("Invalid credentials!"); window.location.href="/login.html";</script>');
  }
});

// Admin dashboard page
app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/Frontend/admin.html');
});

// ---------------------------
// ✅ API: Get messages/bookings
// ---------------------------
app.get('/api/contact', (req, res) => {
  db.query('SELECT * FROM messages ORDER BY created_at DESC', (err, results) => {
    if (err) {
      console.error("❌ Error fetching messages:", err);
      return res.status(500).json({ success: false });
    }
    res.json(results);
  });
});

app.get('/api/bookings', (req, res) => {
  db.query('SELECT * FROM bookings ORDER BY created_at DESC', (err, results) => {
    if (err) {
      console.error("❌ Error fetching bookings:", err);
      return res.status(500).json({ success: false });
    }
    res.json(results);
  });
});

// Start the server after all routes and middleware
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
