import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { DB, SeatAllocationService } from './src/server/db.js';
import { chatWithAI, parseNLPQuery, estimateCrowdOccupancy } from './src/server/gemini.js';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Extend express requests to include optional user
interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string;
    email: string;
    role: 'user' | 'admin';
  };
}

// Simple Base64-based JWT emulator for maximum reliability and 0 config dependencies
const signToken = (payload: { id: string; email: string; role: 'user' | 'admin' }) => {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
};

const verifyToken = (token: string): { id: string; email: string; role: 'user' | 'admin' } | null => {
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// Middleware for authentication
const authMiddleware = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = authHeader.split(' ')[1];
  const user = verifyToken(token);
  if (user) {
    req.user = user;
  }
  next();
};

app.use(authMiddleware as express.RequestHandler);

// Helper requiring authenticated user
const requireAuth = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  if (!req.user) {
    res.status(411).json({ message: "Authentication required" });
    return;
  }
  next();
};

// Helper requiring admin role
const requireAdmin = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ message: "Administrator permissions required" });
    return;
  }
  next();
};

// ================= AUTH ENDPOINTS =================

app.post('/api/auth/register', (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!email || !password || !name) {
    res.status(400).json({ message: "Please specify name, email, and password." });
    return;
  }

  const users = DB.getUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    res.status(400).json({ message: "User with this email already registered." });
    return;
  }

  const newUser = {
    id: `user_${Date.now()}`,
    email: email.toLowerCase(),
    passwordHash: password, // For simplicity in our mock, we match direct string passwords
    name,
    phone,
    role: 'user' as const,
    verified: true,
    savedPassengers: [],
    favoriteRoutes: [],
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  DB.saveUsers(users);

  const token = signToken({ id: newUser.id, email: newUser.email, role: newUser.role });
  res.status(201).json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required." });
    return;
  }

  const users = DB.getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user || user.passwordHash !== password) {
    res.status(401).json({ message: "Invalid email or password." });
    return;
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      phone: user.phone,
      savedPassengers: user.savedPassengers,
      favoriteRoutes: user.favoriteRoutes
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ message: "Logout successful." });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ message: "Email is required." });
    return;
  }
  res.json({ message: "Password reset link sent successfully to your email." });
});

// ================= USER ENDPOINTS =================

app.get('/api/users/profile', requireAuth as express.RequestHandler, (req: AuthenticatedRequest, res) => {
  const users = DB.getUsers();
  const user = users.find(u => u.id === req.user?.id);
  if (!user) {
    res.status(404).json({ message: "Profile not found." });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    phone: user.phone,
    savedPassengers: user.savedPassengers,
    favoriteRoutes: user.favoriteRoutes,
    createdAt: user.createdAt
  });
});

app.put('/api/users/profile', requireAuth as express.RequestHandler, (req: AuthenticatedRequest, res) => {
  const users = DB.getUsers();
  const userIndex = users.findIndex(u => u.id === req.user?.id);
  if (userIndex === -1) {
    res.status(404).json({ message: "Profile not found." });
    return;
  }

  const user = users[userIndex];
  const { name, phone, avatar, savedPassengers, favoriteRoutes } = req.body;

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (avatar !== undefined) user.avatar = avatar;
  if (savedPassengers !== undefined) user.savedPassengers = savedPassengers;
  if (favoriteRoutes !== undefined) user.favoriteRoutes = favoriteRoutes;

  users[userIndex] = user;
  DB.saveUsers(users);

  res.json({
    message: "Profile updated successfully.",
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      phone: user.phone,
      savedPassengers: user.savedPassengers,
      favoriteRoutes: user.favoriteRoutes
    }
  });
});

// ================= STATIONS ENDPOINTS =================

app.get('/api/stations', (req, res) => {
  res.json(DB.getStations());
});

app.post('/api/stations', requireAuth as express.RequestHandler, requireAdmin as express.RequestHandler, (req, res) => {
  const { code, name, city, state, latitude, longitude } = req.body;
  if (!code || !name || !city || !state) {
    res.status(400).json({ message: "Code, name, city and state are required" });
    return;
  }
  const stations = DB.getStations();
  if (stations.some(s => s.code.toUpperCase() === code.toUpperCase())) {
    res.status(400).json({ message: "Station code already exists" });
    return;
  }
  const newStation = {
    code: code.toUpperCase(),
    name,
    city,
    state,
    latitude: Number(latitude) || 20,
    longitude: Number(longitude) || 75
  };
  stations.push(newStation);
  DB.saveStations(stations);
  res.status(201).json(newStation);
});

// ================= TRAINS ENDPOINTS =================

app.get('/api/trains', (req, res) => {
  const { source, destination, date, class: classType, sort, status } = req.query;
  let trains = DB.getTrains();

  // If status is filtered (e.g. for Admin Panel)
  if (status) {
    trains = trains.filter(t => t.status === status);
  }

  // Segment/Route Intermediate aware train search!
  if (source && destination) {
    const srcCode = String(source).toUpperCase();
    const destCode = String(destination).toUpperCase();

    trains = trains.filter(t => {
      // Find index positions
      let srcIndex = t.source === srcCode ? -1 : t.intermediateStations.indexOf(srcCode);
      let destIndex = t.destination === destCode ? 999 : t.intermediateStations.indexOf(destCode);

      if (t.source === srcCode) srcIndex = -2; // starts at source
      if (t.destination === destCode) destIndex = 1000; // ends at destination

      // Match if both exist on train and source is visited before destination
      const exists = srcIndex !== -1 && destIndex !== -1 && srcIndex < destIndex;
      if (!exists) return false;

      // Filter by day of week if date is specified
      if (date) {
        const dateObj = new Date(String(date));
        const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const dayName = daysOfWeek[dateObj.getDay()];
        return t.runningDays.includes(dayName);
      }
      return true;
    });

    // Proportional intermediate fare calculation & timings replacement for route specific view
    trains = trains.map(t => {
      const srcIndex = t.source === srcCode ? -2 : t.intermediateStations.indexOf(srcCode);
      const destIndex = t.destination === destCode ? 1000 : t.intermediateStations.indexOf(destCode);

      // Estimate travel segment factor
      const totalSteps = t.intermediateStations.length + 2;
      const stepS = srcIndex === -2 ? 0 : srcIndex + 1;
      const stepD = destIndex === 1000 ? totalSteps - 1 : destIndex + 1;
      const segmentFactor = Math.max(0.15, (stepD - stepS) / (totalSteps - 1));

      // Build intermediate custom fares
      const customFareByClass: Record<string, number> = {};
      Object.keys(t.fareByClass).forEach(c => {
        customFareByClass[c] = Math.round(t.fareByClass[c] * segmentFactor);
      });

      // Calculate dynamic seat availability per class
      const liveSeats: Record<string, string> = {};
      const targetDate = String(date || new Date().toISOString().split('T')[0]);
      t.classesAvailable.forEach(c => {
        const bookings = DB.getBookings().filter(b => 
          b.trainId === t.id && 
          b.journeyDate === targetDate && 
          b.classType === c && 
          b.status !== 'Cancelled'
        );
        let confirmedCount = 0;
        let racCount = 0;
        let wlCount = 0;

        bookings.forEach(b => {
          b.passengers.forEach(() => {
            if (b.status === 'Confirmed') confirmedCount++;
            else if (b.status === 'RAC') racCount++;
            else if (b.status === 'WL') wlCount++;
          });
        });

        const capacity = t.seatCapacity[c] || 60;
        const available = capacity - confirmedCount;

        if (available > 0) {
          liveSeats[c] = `AVAILABLE - ${available}`;
        } else if (racCount < 10) {
          liveSeats[c] = `RAC - ${10 - racCount}`;
        } else if (wlCount < 15) {
          liveSeats[c] = `WL - ${wlCount + 1}`;
        } else {
          liveSeats[c] = `REGRET`;
        }
      });

      return {
        ...t,
        customSource: srcCode,
        customDestination: destCode,
        customDepartureTime: t.departureTimes[srcCode] || t.departureTimes[t.source],
        customArrivalTime: t.arrivalTimes[destCode] || t.arrivalTimes[t.destination],
        customFareByClass,
        customDistance: Math.round(t.distance * segmentFactor),
        liveSeats
      };
    });
  }

  // Sorting
  if (sort === 'fare') {
    trains.sort((a, b) => {
      const fareA = (a as any).customFareByClass ? Object.values((a as any).customFareByClass)[0] as number : Object.values(a.fareByClass)[0];
      const fareB = (b as any).customFareByClass ? Object.values((b as any).customFareByClass)[0] as number : Object.values(b.fareByClass)[0];
      return fareA - fareB;
    });
  } else if (sort === 'duration') {
    // Proportional sort by distance or travel hours
    trains.sort((a, b) => a.distance - b.distance);
  }

  res.json(trains);
});

app.get('/api/trains/:id', (req, res) => {
  const trains = DB.getTrains();
  const train = trains.find(t => t.id === req.params.id);
  if (!train) {
    res.status(404).json({ message: "Train not found." });
    return;
  }
  res.json(train);
});

app.post('/api/trains', requireAuth as express.RequestHandler, requireAdmin as express.RequestHandler, (req, res) => {
  const { trainNumber, trainName, source, destination, intermediateStations, arrivalTimes, departureTimes, distance, classesAvailable, seatCapacity, fareByClass, runningDays } = req.body;
  
  if (!trainNumber || !trainName || !source || !destination) {
    res.status(400).json({ message: "Train number, name, source, and destination are required." });
    return;
  }

  const trains = DB.getTrains();
  if (trains.some(t => t.trainNumber === trainNumber)) {
    res.status(400).json({ message: "Train with this number already exists." });
    return;
  }

  const newTrain = {
    id: `train_${Date.now()}`,
    trainNumber,
    trainName,
    source,
    destination,
    intermediateStations: intermediateStations || [],
    arrivalTimes: arrivalTimes || {},
    departureTimes: departureTimes || {},
    distance: Number(distance) || 500,
    classesAvailable: classesAvailable || ["2A", "3A", "SL"],
    seatCapacity: seatCapacity || { "2A": 48, "3A": 64, "SL": 72 },
    fareByClass: fareByClass || { "2A": 1200, "3A": 850, "SL": 350 },
    runningDays: runningDays || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    status: 'Active' as const
  };

  trains.push(newTrain);
  DB.saveTrains(trains);
  res.status(201).json(newTrain);
});

app.put('/api/trains/:id', requireAuth as express.RequestHandler, requireAdmin as express.RequestHandler, (req, res) => {
  const trains = DB.getTrains();
  const index = trains.findIndex(t => t.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ message: "Train not found." });
    return;
  }

  const train = trains[index];
  const { trainName, status, delayMinutes, runningDays, fareByClass } = req.body;

  if (trainName !== undefined) train.trainName = trainName;
  if (status !== undefined) train.status = status;
  if (delayMinutes !== undefined) train.delayMinutes = delayMinutes;
  if (runningDays !== undefined) train.runningDays = runningDays;
  if (fareByClass !== undefined) train.fareByClass = fareByClass;

  trains[index] = train;
  DB.saveTrains(trains);
  res.json(train);
});

app.delete('/api/trains/:id', requireAuth as express.RequestHandler, requireAdmin as express.RequestHandler, (req, res) => {
  let trains = DB.getTrains();
  if (!trains.some(t => t.id === req.params.id)) {
    res.status(404).json({ message: "Train not found." });
    return;
  }
  trains = trains.filter(t => t.id !== req.params.id);
  DB.saveTrains(trains);
  res.json({ message: "Train deleted successfully." });
});

// ================= JOURNEY INVENTORY SYNCHRONIZER =================
function syncJourneyInventory(trainId: string, journeyDate: string, classType: string) {
  const train = DB.getTrains().find(t => t.id === trainId);
  if (!train) return;

  const bookings = DB.getBookings().filter(b => 
    b.trainId === trainId && 
    b.journeyDate === journeyDate && 
    b.classType === classType && 
    b.status !== 'Cancelled'
  );

  let confirmedCount = 0;
  let racCount = 0;
  let wlCount = 0;

  bookings.forEach(b => {
    b.passengers.forEach(() => {
      if (b.status === 'Confirmed') confirmedCount++;
      else if (b.status === 'RAC') racCount++;
      else if (b.status === 'WL') wlCount++;
    });
  });

  const totalSeats = train.seatCapacity[classType] || 60;
  const racCapacity = 10;
  const wlCapacity = 15;
  const availableSeats = Math.max(0, totalSeats - confirmedCount);

  const inventory = DB.getInventory();
  const invId = `${trainId}_${journeyDate}_${classType}`;
  const index = inventory.findIndex(i => i.id === invId);

  const invRecord = {
    id: invId,
    trainId,
    journeyDate,
    classType,
    totalSeats,
    bookedSeats: confirmedCount,
    availableSeats,
    racCapacity,
    racBooked: racCount,
    wlCapacity,
    wlBooked: wlCount
  };

  if (index !== -1) {
    inventory[index] = invRecord;
  } else {
    inventory.push(invRecord);
  }
  DB.saveInventory(inventory);
}

// ================= FARE CALCULATION ENDPOINT =================
app.post('/api/fares/calculate', (req, res) => {
  const { trainId, source, destination, classType, quota, passengerCount, seniorCitizenCount } = req.body;
  
  if (!trainId || !source || !destination || !classType) {
    res.status(400).json({ message: "Missing required parameters for fare calculation." });
    return;
  }

  const train = DB.getTrains().find(t => t.id === trainId);
  if (!train) {
    res.status(404).json({ message: "Train not found for fare calculation." });
    return;
  }

  // Calculate segment factor
  let segmentFactor = 1.0;
  if (source !== train.source || destination !== train.destination) {
    const stops = [train.source, ...train.intermediateStations, train.destination];
    const srcIdx = stops.indexOf(source);
    const destIdx = stops.indexOf(destination);
    if (srcIdx !== -1 && destIdx !== -1 && destIdx > srcIdx) {
      segmentFactor = (destIdx - srcIdx) / (stops.length - 1);
    }
  }

  const singleBaseFare = Math.round((train.fareByClass[classType] || 500) * segmentFactor);
  
  const passengers = Number(passengerCount) || 1;
  const seniors = Number(seniorCitizenCount) || 0;
  const normals = Math.max(0, passengers - seniors);

  // Apply senior discount (10% off base fare)
  const baseFareNormal = singleBaseFare * normals;
  const baseFareSenior = Math.round(singleBaseFare * 0.9) * seniors;
  const baseFareTotal = baseFareNormal + baseFareSenior;

  // Reservation charge
  let reservationFeePerPassenger = 20; // Default SL
  if (classType === '1A') reservationFeePerPassenger = 60;
  else if (classType === '2A') reservationFeePerPassenger = 50;
  else if (classType === '3A') reservationFeePerPassenger = 40;
  
  const totalReservationCharge = reservationFeePerPassenger * passengers;

  // Convenience fee
  const isAC = ['1A', '2A', '3A'].includes(classType);
  const convenienceFee = isAC ? 30 : 15;

  // Tatkal Surcharge
  let tatkalSurcharge = 0;
  if (quota === 'Tatkal') {
    if (isAC) {
      // 30% of base fare, min 300, max 500 per passenger
      const tatkalPerPax = Math.min(500, Math.max(300, Math.round(singleBaseFare * 0.3)));
      tatkalSurcharge = tatkalPerPax * passengers;
    } else {
      // 10% of base fare, min 100, max 200 per passenger
      const tatkalPerPax = Math.min(200, Math.max(100, Math.round(singleBaseFare * 0.1)));
      tatkalSurcharge = tatkalPerPax * passengers;
    }
  }

  // GST (5% of (Base + Reservation + Tatkal) for AC)
  const gst = isAC ? Math.round((baseFareTotal + totalReservationCharge + tatkalSurcharge) * 0.05) : 0;

  const totalAmount = baseFareTotal + totalReservationCharge + convenienceFee + tatkalSurcharge + gst;

  res.json({
    singleBaseFare,
    baseFareTotal,
    reservationCharge: totalReservationCharge,
    convenienceFee,
    tatkalSurcharge,
    gst,
    totalAmount
  });
});

// ================= BOOKINGS ENDPOINTS =================

app.post('/api/bookings', requireAuth as express.RequestHandler, (req: AuthenticatedRequest, res) => {
  const { trainId, source, destination, passengers, classType, quota, fare, journeyDate, simulateFailure } = req.body;
  if (!trainId || !passengers || !classType || !journeyDate || !source || !destination) {
    res.status(400).json({ message: "Missing required booking details." });
    return;
  }

  const train = DB.getTrains().find(t => t.id === trainId);
  if (!train) {
    res.status(404).json({ message: "Train not found" });
    return;
  }

  // Payment Failure Simulation
  if (simulateFailure) {
    const payments = DB.getPayments();
    payments.push({
      id: `pay_fail_${Date.now()}`,
      bookingId: `FAIL_${Math.floor(100000 + Math.random() * 900000)}`,
      userId: req.user!.id,
      amount: Number(fare),
      type: 'Payment',
      status: 'Failed',
      timestamp: new Date().toISOString()
    });
    DB.savePayments(payments);

    res.status(402).json({ message: "Simulated Payment Failed. No seats were deducted." });
    return;
  }

  // Allocate Seat/Berth using our dynamic berth assignment system
  const allocation = SeatAllocationService.allocateSeats(trainId, journeyDate, classType, passengers, quota);

  const pnr = `${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  const paymentId = `PAY_MOCK_${Math.floor(100000 + Math.random() * 900000)}`;

  const newBooking = {
    bookingId: pnr,
    userId: req.user!.id,
    trainId,
    trainNumber: train.trainNumber,
    trainName: train.trainName,
    source,
    destination,
    passengers: allocation.passengers,
    classType,
    quota: quota || "General",
    fare: Number(fare) || 500,
    status: allocation.status,
    bookingDate: new Date().toISOString(),
    journeyDate,
    paymentId,
    transactionStatus: 'Success' as const
  };

  const bookings = DB.getBookings();
  bookings.push(newBooking);
  DB.saveBookings(bookings);

  // Append a successful mock payment log
  const payments = DB.getPayments();
  payments.push({
    id: `pay_${Date.now()}`,
    bookingId: pnr,
    userId: req.user!.id,
    amount: Number(fare),
    type: 'Payment',
    status: 'Success',
    timestamp: new Date().toISOString()
  });
  DB.savePayments(payments);

  // Sync with dynamic journey seat inventory
  syncJourneyInventory(trainId, journeyDate, classType);

  res.status(201).json(newBooking);
});

app.get('/api/bookings/user', requireAuth as express.RequestHandler, (req: AuthenticatedRequest, res) => {
  const bookings = DB.getBookings();
  const userBookings = bookings.filter(b => b.userId === req.user?.id);
  res.json(userBookings.reverse()); // Latest bookings first
});

// Admin endpoint to view all bookings
app.get('/api/bookings/all', requireAuth as express.RequestHandler, requireAdmin as express.RequestHandler, (req, res) => {
  res.json(DB.getBookings().reverse());
});

// Cancel complete ticket or partial ticket
app.delete('/api/bookings/:id', requireAuth as express.RequestHandler, (req: AuthenticatedRequest, res) => {
  const bookings = DB.getBookings();
  const index = bookings.findIndex(b => b.bookingId === req.params.id);
  if (index === -1) {
    res.status(404).json({ message: "Booking not found." });
    return;
  }

  const booking = bookings[index];
  
  // Authorization check
  if (req.user?.role !== 'admin' && booking.userId !== req.user?.id) {
    res.status(403).json({ message: "Forbidden." });
    return;
  }

  const { passengerIndex } = req.body; // For partial cancellation

  if (passengerIndex !== undefined && passengerIndex >= 0 && passengerIndex < booking.passengers.length) {
    // Partial cancellation
    const p = booking.passengers[passengerIndex];
    booking.passengers.splice(passengerIndex, 1);
    
    // Proportional refund calculation
    const refundedAmount = Math.round(booking.fare / (booking.passengers.length + 1) * 0.85); // 15% cancellation fee
    booking.fare = Math.round(booking.fare * (booking.passengers.length / (booking.passengers.length + 1)));

    // If no passengers left, booking is cancelled fully
    if (booking.passengers.length === 0) {
      booking.status = 'Cancelled';
      booking.transactionStatus = 'Refunded';
    }

    // Record Refund log
    const payments = DB.getPayments();
    payments.push({
      id: `pay_refund_${Date.now()}`,
      bookingId: booking.bookingId,
      userId: booking.userId,
      amount: refundedAmount,
      type: 'Refund',
      status: 'Success',
      timestamp: new Date().toISOString()
    });
    DB.savePayments(payments);

  } else {
    // Full cancellation
    booking.status = 'Cancelled';
    booking.transactionStatus = 'Refunded';

    // Refund policy based on time
    const refundedAmount = Math.round(booking.fare * 0.85); // 15% cancellation charge

    const payments = DB.getPayments();
    payments.push({
      id: `pay_refund_${Date.now()}`,
      bookingId: booking.bookingId,
      userId: booking.userId,
      amount: refundedAmount,
      type: 'Refund',
      status: 'Success',
      timestamp: new Date().toISOString()
    });
    DB.savePayments(payments);
  }

  bookings[index] = booking;
  DB.saveBookings(bookings);

  // Trigger seat promotions for other RAC / WL waiting passengers!
  SeatAllocationService.handlePromotionOnCancellation(booking.trainId, booking.journeyDate, booking.classType);

  // Sync dynamic seat inventory
  syncJourneyInventory(booking.trainId, booking.journeyDate, booking.classType);

  res.json({ message: "Booking cancelled and refund processed.", booking });
});

// ================= PAYMENT ENDPOINTS =================

app.post('/api/payments/create', requireAuth as express.RequestHandler, (req, res) => {
  const { bookingId, amount } = req.body;
  if (!bookingId || !amount) {
    res.status(400).json({ message: "BookingId and amount required" });
    return;
  }
  res.json({ success: true, paymentId: `PAY_MOCK_${Date.now()}`, message: "Payment processed successfully." });
});

app.post('/api/payments/refund', requireAuth as express.RequestHandler, (req, res) => {
  const { bookingId, amount } = req.body;
  if (!bookingId || !amount) {
    res.status(400).json({ message: "BookingId and amount required" });
    return;
  }
  res.json({ success: true, refundId: `REF_MOCK_${Date.now()}`, message: "Refund processed successfully." });
});

// ================= ADMIN ANALYTICS =================

app.get('/api/admin/analytics', requireAuth as express.RequestHandler, requireAdmin as express.RequestHandler, (req, res) => {
  const users = DB.getUsers();
  const bookings = DB.getBookings();
  const trains = DB.getTrains();

  const totalUsers = users.length;
  const totalBookings = bookings.length;
  const totalRevenue = bookings.filter(b => b.status !== 'Cancelled').reduce((sum, b) => sum + b.fare, 0);

  // Popular routes
  const routeFreq: Record<string, number> = {};
  bookings.forEach(b => {
    const route = `${b.source} → ${b.destination}`;
    routeFreq[route] = (routeFreq[route] || 0) + 1;
  });

  const popularRoutes = Object.entries(routeFreq).map(([route, count]) => ({ route, count })).sort((a,b) => b.count - a.count).slice(0, 5);

  res.json({
    totalUsers,
    totalBookings,
    totalRevenue,
    trainsCount: trains.length,
    popularRoutes,
    recentActivity: bookings.slice(-5).reverse()
  });
});

// Suspend/delete user accounts (Admin role)
app.delete('/api/users/:id', requireAuth as express.RequestHandler, requireAdmin as express.RequestHandler, (req, res) => {
  let users = DB.getUsers();
  if (req.params.id === 'user_admin') {
    res.status(400).json({ message: "Cannot suspend system administrator." });
    return;
  }
  if (!users.some(u => u.id === req.params.id)) {
    res.status(404).json({ message: "User not found." });
    return;
  }
  users = users.filter(u => u.id !== req.params.id);
  DB.saveUsers(users);
  res.json({ message: "User suspended successfully." });
});

// Return all users (Admin role)
app.get('/api/users', requireAuth as express.RequestHandler, requireAdmin as express.RequestHandler, (req, res) => {
  res.json(DB.getUsers().map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, createdAt: u.createdAt })));
});

// ================= AI ENDPOINTS =================

app.post('/api/ai/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    res.status(400).json({ message: "Message is required." });
    return;
  }
  const reply = await chatWithAI(message, history || []);
  res.json({ reply });
});

app.post('/api/ai/recommendations', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    res.status(400).json({ message: "Query text is required." });
    return;
  }

  // AI parses the query
  const parsed = await parseNLPQuery(query);
  
  if (!parsed.source || !parsed.destination) {
    res.json({
      success: false,
      message: "Could not parse your journey source and destination. Try: 'Mumbai Central to Bangalore next Friday'.",
      parsed
    });
    return;
  }

  // Perform search with parsed details
  const trains = DB.getTrains();
  const srcCode = parsed.source.toUpperCase();
  const destCode = parsed.destination.toUpperCase();

  let matchedTrains = trains.filter(t => {
    let srcIndex = t.source === srcCode ? -1 : t.intermediateStations.indexOf(srcCode);
    let destIndex = t.destination === destCode ? 999 : t.intermediateStations.indexOf(destCode);

    if (t.source === srcCode) srcIndex = -2;
    if (t.destination === destCode) destIndex = 1000;

    return srcIndex !== -1 && destIndex !== -1 && srcIndex < destIndex;
  });

  // Attach crowd prediction and fare details
  const suggestions = matchedTrains.map(t => {
    const srcIndex = t.source === srcCode ? -2 : t.intermediateStations.indexOf(srcCode);
    const destIndex = t.destination === destCode ? 1000 : t.intermediateStations.indexOf(destCode);
    const totalSteps = t.intermediateStations.length + 2;
    const stepS = srcIndex === -2 ? 0 : srcIndex + 1;
    const stepD = destIndex === 1000 ? totalSteps - 1 : destIndex + 1;
    const segmentFactor = Math.max(0.15, (stepD - stepS) / (totalSteps - 1));

    const customFareByClass: Record<string, number> = {};
    Object.keys(t.fareByClass).forEach(c => {
      customFareByClass[c] = Math.round(t.fareByClass[c] * segmentFactor);
    });

    const primaryClass = t.classesAvailable[0] || "SL";
    const crowd = estimateCrowdOccupancy(t.id, parsed.date, primaryClass);

    return {
      ...t,
      customFareByClass,
      customDepartureTime: t.departureTimes[srcCode] || t.departureTimes[t.source],
      customArrivalTime: t.arrivalTimes[destCode] || t.arrivalTimes[t.destination],
      customDistance: Math.round(t.distance * segmentFactor),
      crowdPrediction: crowd,
      isPremium: t.trainName.includes("Vande") || t.trainName.includes("Rajdhani") || t.trainName.includes("Shatabdi")
    };
  });

  // Calculate cheapest and fastest options
  const cheapest = suggestions.length > 0 ? [...suggestions].sort((a, b) => {
    const fareA = Object.values(a.customFareByClass)[0] as number;
    const fareB = Object.values(b.customFareByClass)[0] as number;
    return fareA - fareB;
  })[0] : null;

  const fastest = suggestions.length > 0 ? [...suggestions].sort((a, b) => a.customDistance - b.customDistance)[0] : null;

  res.json({
    success: true,
    parsed,
    cheapest,
    fastest,
    trains: suggestions
  });
});

// ================= VITE OR STATIC FRONTEND ASSET SERVING =================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RailConnect AI Full Stack Server listening on http://localhost:${PORT}`);
  });
}

startServer();
