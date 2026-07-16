export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatar?: string;
  role: 'user' | 'admin';
  verified: boolean;
  savedPassengers: SavedPassenger[];
  favoriteRoutes: FavoriteRoute[];
  createdAt: string;
}

export interface SavedPassenger {
  name: string;
  age: number;
  gender: string;
  berthPreference: 'Lower' | 'Middle' | 'Upper' | 'Side Lower' | 'Side Upper' | 'No Preference';
  seniorCitizen: boolean;
}

export interface FavoriteRoute {
  source: string;
  destination: string;
}

export interface Station {
  code: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

export interface Train {
  id: string;
  trainNumber: string;
  trainName: string;
  source: string;
  destination: string;
  intermediateStations: string[];
  arrivalTimes: Record<string, string>;
  departureTimes: Record<string, string>;
  distance: number;
  classesAvailable: string[];
  seatCapacity: Record<string, number>;
  fareByClass: Record<string, number>;
  runningDays: string[];
  status: 'Active' | 'Cancelled' | 'Delayed';
  delayMinutes?: number;

  // Route segment properties injected dynamically during searches
  customSource?: string;
  customDestination?: string;
  customDepartureTime?: string;
  customArrivalTime?: string;
  customFareByClass?: Record<string, number>;
  customDistance?: number;
  crowdPrediction?: {
    level: 'Low' | 'Medium' | 'High';
    percentage: number;
    description: string;
  };
  isPremium?: boolean;
}

export interface Passenger {
  name: string;
  age: number;
  gender: string;
  berthPreference: string;
  seniorCitizen: boolean;
  assignedSeat?: {
    coach: string;
    seatNumber: number;
    berthType: string;
  };
}

export interface Booking {
  bookingId: string;
  userId: string;
  trainId: string;
  trainNumber: string;
  trainName: string;
  source: string;
  destination: string;
  passengers: Passenger[];
  classType: string;
  quota: string;
  fare: number;
  status: 'Confirmed' | 'RAC' | 'WL' | 'Cancelled';
  bookingDate: string;
  journeyDate: string;
  paymentId: string;
  transactionStatus: 'Success' | 'Refunded' | 'Failed';
}

export interface PaymentLog {
  id: string;
  bookingId: string;
  userId: string;
  amount: number;
  type: 'Payment' | 'Refund';
  status: 'Success' | 'Failed';
  timestamp: string;
}

export interface Analytics {
  totalUsers: number;
  totalBookings: number;
  totalRevenue: number;
  trainsCount: number;
  popularRoutes: { route: string; count: number }[];
  recentActivity: Booking[];
}
