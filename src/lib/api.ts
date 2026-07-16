import axios from 'axios';
import { User, Station, Train, Booking, PaymentLog, Analytics } from '../types';

// API instance
const api = axios.create({
  baseURL: '/api',
});

// Auto inject Bearer Token on requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('railconnect_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export const apiService = {
  // Auth API
  login: async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    localStorage.setItem('railconnect_token', res.data.token);
    return res.data;
  },

  register: async (email: string, password: string, name: string, phone: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/register', { email, password, name, phone });
    localStorage.setItem('railconnect_token', res.data.token);
    return res.data;
  },

  logout: () => {
    localStorage.removeItem('railconnect_token');
    return Promise.resolve();
  },

  forgotPassword: async (email: string) => {
    const res = await api.post<{ message: string }>('/auth/forgot-password', { email });
    return res.data;
  },

  // User Profile
  getProfile: async () => {
    const res = await api.get<User>('/users/profile');
    return res.data;
  },

  updateProfile: async (data: Partial<User>) => {
    const res = await api.put<{ message: string; user: User }>('/users/profile', data);
    return res.data;
  },

  // Stations
  getStations: async () => {
    const res = await api.get<Station[]>('/stations');
    return res.data;
  },

  addStation: async (station: Omit<Station, 'latitude' | 'longitude'>) => {
    const res = await api.post<Station>('/stations', station);
    return res.data;
  },

  // Trains
  searchTrains: async (params: {
    source: string;
    destination: string;
    date: string;
    class?: string;
    sort?: string;
  }) => {
    const res = await api.get<Train[]>('/trains', { params });
    return res.data;
  },

  getTrain: async (id: string) => {
    const res = await api.get<Train>(`/trains/${id}`);
    return res.data;
  },

  addTrain: async (train: Partial<Train>) => {
    const res = await api.post<Train>('/trains', train);
    return res.data;
  },

  updateTrain: async (id: string, data: Partial<Train>) => {
    const res = await api.put<Train>(`/trains/${id}`, data);
    return res.data;
  },

  deleteTrain: async (id: string) => {
    const res = await api.delete<{ message: string }>(`/trains/${id}`);
    return res.data;
  },

  // Bookings
  calculateFare: async (params: {
    trainId: string;
    source: string;
    destination: string;
    classType: string;
    quota: string;
    passengerCount: number;
    seniorCitizenCount: number;
  }) => {
    const res = await api.post<{
      singleBaseFare: number;
      baseFareTotal: number;
      reservationCharge: number;
      convenienceFee: number;
      tatkalSurcharge: number;
      gst: number;
      totalAmount: number;
    }>('/fares/calculate', params);
    return res.data;
  },

  createBooking: async (bookingData: {
    trainId: string;
    source: string;
    destination: string;
    passengers: { name: string; age: number; gender: string; berthPreference: string; seniorCitizen: boolean }[];
    classType: string;
    quota: string;
    fare: number;
    journeyDate: string;
    simulateFailure?: boolean;
  }) => {
    const res = await api.post<Booking>('/bookings', bookingData);
    return res.data;
  },

  getUserBookings: async () => {
    const res = await api.get<Booking[]>('/bookings/user');
    return res.data;
  },

  getAllBookings: async () => {
    const res = await api.get<Booking[]>('/bookings/all');
    return res.data;
  },

  cancelBooking: async (bookingId: string, passengerIndex?: number) => {
    const res = await api.delete<{ message: string; booking: Booking }>(`/bookings/${bookingId}`, {
      data: { passengerIndex }
    });
    return res.data;
  },

  // Admin Panel endpoints
  getAnalytics: async () => {
    const res = await api.get<Analytics>('/admin/analytics');
    return res.data;
  },

  getUsersList: async () => {
    const res = await api.get<Omit<User, 'passwordHash' | 'savedPassengers' | 'favoriteRoutes'>[]>('/users');
    return res.data;
  },

  suspendUser: async (id: string) => {
    const res = await api.delete<{ message: string }>(`/users/${id}`);
    return res.data;
  },

  // AI Assistance
  sendAIChat: async (message: string, history: { role: 'user' | 'model'; text: string }[]) => {
    const res = await api.post<{ reply: string }>('/ai/chat', { message, history });
    return res.data;
  },

  getNLPRecommendations: async (query: string) => {
    const res = await api.post<{
      success: boolean;
      parsed: { source: string; destination: string; date: string; classPreference?: string };
      cheapest: Train | null;
      fastest: Train | null;
      trains: Train[];
      message?: string;
    }>('/ai/recommendations', { query });
    return res.data;
  }
};
