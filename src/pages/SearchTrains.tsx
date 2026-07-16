import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiService } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Train, SavedPassenger, Booking } from '../types';
import { Train as TrainIcon, Users, Calendar, DollarSign, ArrowRight, ShieldCheck, CreditCard, ChevronRight, AlertCircle, RefreshCw, BadgePercent, MapPin, Download, CheckCircle2, Sparkles, XCircle, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';

export const SearchTrains: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();

  const getQueryParams = () => {
    const params = new URLSearchParams(location.search);
    return {
      source: params.get('source') || '',
      destination: params.get('destination') || '',
      date: params.get('date') || '',
      class: params.get('class') || '3A',
      quota: params.get('quota') || 'General',
      nlpQuery: params.get('nlpQuery') || ''
    };
  };

  const queryParams = getQueryParams();
  const [trains, setTrains] = useState<Train[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Sorting filter
  const [sortParam, setSortParam] = useState<'fare' | 'duration'>('duration');

  // Booking process states
  const [bookingTrain, setBookingTrain] = useState<Train | null>(null);
  const [bookingClass, setBookingClass] = useState('3A');
  const [bookingStep, setBookingStep] = useState<'search' | 'passengers' | 'payment' | 'success'>('search');

  // Passenger state
  const [passengers, setPassengers] = useState<Omit<SavedPassenger, 'berthPreference'> & { berthPreference: string }[]>([
    { name: '', age: 0, gender: 'Male', seniorCitizen: false, berthPreference: 'No Preference' }
  ]);

  // Payment states
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [cardNo, setCardNo] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking'>('card');
  const [upiId, setUpiId] = useState('');
  const [selectedBank, setSelectedBank] = useState('SBI');

  // Final Confirmed booking response
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  
  // Dynamic backend fare breakdown
  const [fareBreakdown, setFareBreakdown] = useState<{
    singleBaseFare: number;
    baseFareTotal: number;
    reservationCharge: number;
    convenienceFee: number;
    tatkalSurcharge: number;
    gst: number;
    totalAmount: number;
  } | null>(null);

  useEffect(() => {
    fetchTrains();
  }, [location.search, sortParam]);

  const fetchTrains = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiService.searchTrains({
        source: queryParams.source,
        destination: queryParams.destination,
        date: queryParams.date,
        class: queryParams.class,
        sort: sortParam
      });
      setTrains(data);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch matching trains. Please try search with valid station codes.");
    } finally {
      setLoading(false);
    }
  };

  // Passenger details helper
  const addPassenger = () => {
    setPassengers([...passengers, { name: '', age: 0, gender: 'Male', seniorCitizen: false, berthPreference: 'No Preference' }]);
  };

  const removePassenger = (index: number) => {
    if (passengers.length === 1) return;
    setPassengers(passengers.filter((_, i) => i !== index));
  };

  const handlePassengerChange = (index: number, key: string, value: any) => {
    const updated = [...passengers];
    updated[index] = { ...updated[index], [key]: value };
    
    // Auto senior citizen flag
    if (key === 'age') {
      const ageNum = Number(value);
      updated[index].seniorCitizen = ageNum >= 60;
    }
    
    setPassengers(updated);
  };

  const importSavedPassenger = (saved: SavedPassenger) => {
    // If first passenger row is empty, overwrite it
    if (passengers.length === 1 && !passengers[0].name) {
      setPassengers([{
        name: saved.name,
        age: saved.age,
        gender: saved.gender,
        seniorCitizen: saved.seniorCitizen,
        berthPreference: saved.berthPreference
      }]);
    } else {
      setPassengers([...passengers, {
        name: saved.name,
        age: saved.age,
        gender: saved.gender,
        seniorCitizen: saved.seniorCitizen,
        berthPreference: saved.berthPreference
      }]);
    }
  };

  const calculateTotalFare = () => {
    if (!bookingTrain) return 0;
    const baseSegFare = bookingTrain.customFareByClass ? bookingTrain.customFareByClass[bookingClass] : bookingTrain.fareByClass[bookingClass];
    let total = baseSegFare * passengers.length;
    
    // Apply 10% Senior Citizen discount on individual segments if seniorCitizen is active
    passengers.forEach(p => {
      if (p.seniorCitizen) {
        total -= Math.round(baseSegFare * 0.10);
      }
    });

    if (queryParams.quota === 'Tatkal') {
      total += Math.round(total * 0.15); // 15% premium Tatkal charges
    }

    return total;
  };

  const handleStartBooking = (train: Train, classType: string) => {
    if (!user) {
      // Redirect to login if unauthenticated
      navigate('/login');
      return;
    }
    setBookingTrain(train);
    setBookingClass(classType);
    setBookingStep('passengers');
  };

  const handlePassengersSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Simple verification
    const invalid = passengers.some(p => !p.name.trim() || !p.age);
    if (invalid) {
      alert("Please fill name and age for all passengers.");
      return;
    }

    const invalidAge = passengers.some(p => Number(p.age) <= 0 || Number(p.age) > 120);
    if (invalidAge) {
      alert("Please enter a valid age between 1 and 120 for all passengers.");
      return;
    }

    // Call dynamic backend fare calculation API
    try {
      setPaymentStatus('idle'); // reset payment status indicator
      const seniorCitizenCount = passengers.filter(p => p.seniorCitizen).length;
      const breakdown = await apiService.calculateFare({
        trainId: bookingTrain!.id,
        source: queryParams.source,
        destination: queryParams.destination,
        classType: bookingClass,
        quota: queryParams.quota,
        passengerCount: passengers.length,
        seniorCitizenCount
      });
      setFareBreakdown(breakdown);
      setBookingStep('payment');
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to calculate dynamic fare breakdown on the backend. Please try again.");
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent | null, simulateFailureOption: boolean = false) => {
    if (e) e.preventDefault();
    
    if (!simulateFailureOption) {
      if (paymentMethod === 'card' && (!cardNo || !cardName)) {
        alert("Please enter card details.");
        return;
      }
      if (paymentMethod === 'upi' && !upiId) {
        alert("Please enter UPI ID.");
        return;
      }
    }

    setPaymentStatus('processing');
    
    // Simulate payment latency
    setTimeout(async () => {
      try {
        const payload = {
          trainId: bookingTrain!.id,
          source: queryParams.source,
          destination: queryParams.destination,
          classType: bookingClass,
          quota: queryParams.quota,
          journeyDate: queryParams.date,
          fare: fareBreakdown?.totalAmount || calculateTotalFare(),
          simulateFailure: simulateFailureOption,
          passengers: passengers.map(p => ({
            name: p.name,
            age: Number(p.age),
            gender: p.gender,
            berthPreference: p.berthPreference,
            seniorCitizen: p.seniorCitizen
          }))
        };

        const bookingRes = await apiService.createBooking(payload);
        setConfirmedBooking(bookingRes);
        setPaymentStatus('success');
        setBookingStep('success');
        refreshProfile(); // refresh favorites & passenger records
      } catch (err: any) {
        console.error(err);
        setPaymentStatus('failed');
        alert(err.response?.data?.message || "Simulated payment transaction failed. No seating berths were deducted.");
      }
    }, 1200);
  };

  const drawQRCode = (doc: any, x: number, y: number, size: number) => {
    // Background
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, size, size, 'F');
    
    // Outer border
    doc.setDrawColor(15, 23, 42); // slate-900
    doc.setLineWidth(0.4);
    doc.rect(x, y, size, size);
    
    // 3 Corner Anchors (Finder Patterns)
    const drawFinderPattern = (px: number, py: number) => {
      doc.setFillColor(15, 23, 42);
      doc.rect(px, py, 7, 7, 'F'); // outer black
      doc.setFillColor(255, 255, 255);
      doc.rect(px + 1, py + 1, 5, 5, 'F'); // inner white
      doc.setFillColor(15, 23, 42);
      doc.rect(px + 2, py + 2, 3, 3, 'F'); // inner black
    };
    
    // Top-Left Finder
    drawFinderPattern(x + 2, y + 2);
    // Top-Right Finder
    drawFinderPattern(x + size - 9, y + 2);
    // Bottom-Left Finder
    drawFinderPattern(x + 2, y + size - 9);
    
    // Draw some random barcode blocks to look like a real QR code
    doc.setFillColor(15, 23, 42);
    const dots = [
      [11, 2], [13, 3], [14, 5], [10, 8], [12, 10], [15, 12], [11, 14],
      [2, 11], [3, 13], [5, 14], [8, 10], [10, 12], [12, 15], [14, 11],
      [11, 11], [13, 13], [15, 15], [18, 18], [20, 20], [22, 22], [24, 24],
      [18, 11], [20, 13], [22, 15], [24, 18], [22, 20], [20, 22], [18, 24],
      [11, 18], [13, 20], [15, 22], [18, 24], [20, 22], [22, 20], [24, 18]
    ];
    
    dots.forEach(([dx, dy]) => {
      const scale = size / 28;
      doc.rect(x + dx * scale, y + dy * scale, scale, scale, 'F');
    });
  };

  const downloadPDFTicket = (booking: Booking) => {
    const doc = new jsPDF();
    
    // Page borders and background touches
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.rect(5, 5, 200, 287);
    
    // Header Banner
    doc.setFillColor(30, 58, 138); // blue-900
    doc.rect(5, 5, 200, 35, 'F');
    
    // RailGo Logo Accent Line
    doc.setFillColor(245, 158, 11); // amber-500
    doc.rect(5, 40, 200, 2, 'F');
    
    // Branding
    doc.setTextColor(255, 255, 255);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.text("RailGo", 15, 24);
    
    doc.setFontSize(10);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(219, 234, 254); // blue-100
    doc.text("Book Smarter. Travel Better. — Independent Reservation System", 15, 30);
    
    // Right side header info
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("Helvetica", "bold");
    doc.text("E-TICKET RECIPENT", 140, 20);
    doc.setFontSize(9);
    doc.setFont("Helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 140, 26);
    
    // Box 1: PNR and Booking Information
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(10, 48, 190, 40, 'F');
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.rect(10, 48, 190, 40);
    
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFontSize(9);
    doc.setFont("Helvetica", "bold");
    doc.text("PNR NUMBER (10 DIGITS)", 15, 56);
    doc.setFontSize(14);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(30, 58, 138); // blue-900
    doc.text(booking.bookingId, 15, 64);
    
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.setFont("Helvetica", "bold");
    doc.text("BOOKING ID", 110, 56);
    doc.setFontSize(12);
    doc.setFont("Helvetica", "bold");
    doc.text(`BKG-${booking.paymentId?.split('_')[2] || '943021'}`, 110, 64);
    
    doc.setFontSize(9);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Transaction Status: SUCCESSFUL`, 15, 74);
    doc.text(`Quota: ${booking.quota} Class: ${booking.classType}`, 15, 80);
    doc.text(`Payment ID: ${booking.paymentId}`, 110, 74);
    doc.text(`Booking Date: ${new Date(booking.bookingDate || Date.now()).toLocaleDateString()}`, 110, 80);
    
    // Draw QR Code on the right side of Box 1 (around x: 165, y: 52)
    drawQRCode(doc, 165, 52, 30);
    
    // Box 2: Train & Journey Information
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.rect(10, 95, 190, 52);
    
    doc.setFillColor(241, 245, 249); // slate-100 header
    doc.rect(10, 95, 190, 8, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.setFont("Helvetica", "bold");
    doc.text("JOURNEY & TRAIN DETAILS", 15, 101);
    
    doc.setFontSize(10);
    doc.text(`Train: ${booking.trainNumber} / ${booking.trainName}`, 15, 114);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(`Journey Date: ${booking.journeyDate}`, 15, 122);
    doc.text(`Travel Class: ${booking.classType} Class`, 15, 130);
    doc.text(`Booking Status: ${booking.status}`, 15, 138);
    
    // Route segment Timeline block
    doc.setDrawColor(241, 245, 249);
    doc.line(110, 108, 110, 142);
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("Helvetica", "bold");
    doc.text(`FROM: ${booking.source}`, 115, 114);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`Boarding Station: ${booking.source}`, 115, 122);
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("Helvetica", "bold");
    doc.text(`TO: ${booking.destination}`, 115, 132);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`Destination Station: ${booking.destination}`, 115, 140);
    
    // Box 3: Passenger Berth Details
    doc.setDrawColor(226, 232, 240);
    doc.rect(10, 155, 190, 65);
    doc.setFillColor(241, 245, 249); // Header
    doc.rect(10, 155, 190, 8, 'F');
    
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.setFont("Helvetica", "bold");
    doc.text("PASSENGER DETAILS & SEAT ALLOCATION", 15, 161);
    
    // Table Headers
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("#", 15, 172);
    doc.text("PASSENGER NAME", 25, 172);
    doc.text("AGE / GENDER", 90, 172);
    doc.text("COACH", 130, 172);
    doc.text("BERTH / SEAT NO", 160, 172);
    doc.line(10, 175, 200, 175);
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("Helvetica", "normal");
    let py = 182;
    booking.passengers.forEach((p, index) => {
      doc.text(String(index + 1), 15, py);
      doc.setFont("Helvetica", "bold");
      doc.text(p.name, 25, py);
      doc.setFont("Helvetica", "normal");
      doc.text(`${p.age} Yrs / ${p.gender}`, 90, py);
      doc.text(p.assignedSeat?.coach || 'WL', 130, py);
      
      const seatStr = p.assignedSeat 
        ? `Seat ${p.assignedSeat.seatNumber} (${p.assignedSeat.berthType})`
        : 'Waiting List (No Berth)';
      doc.text(seatStr, 160, py);
      py += 8;
    });
    
    // Box 4: Fare Summary Breakdown
    doc.setDrawColor(226, 232, 240);
    doc.rect(10, 227, 190, 45);
    doc.setFillColor(248, 250, 252);
    doc.rect(10, 227, 190, 8, 'F');
    
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.setFont("Helvetica", "bold");
    doc.text("FARE SUMMARY & PAYMENT BREAKDOWN", 15, 233);
    
    doc.setFontSize(9);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text("Ticket Base Segment Price:", 15, 244);
    doc.text("Convenience, Reservation & Taxes:", 15, 251);
    doc.text("Total Passengers Count:", 15, 258);
    
    const totalFare = booking.fare;
    const convenienceTaxes = Math.round(totalFare * 0.12); // simulated
    const baseSegSum = totalFare - convenienceTaxes;
    
    doc.setTextColor(15, 23, 42);
    doc.text(`INR ${baseSegSum}`, 85, 244);
    doc.text(`INR ${convenienceTaxes}`, 85, 251);
    doc.text(`${booking.passengers.length} Passenger(s)`, 85, 258);
    
    // Total column
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TOTAL FARE PAID", 130, 246);
    doc.setFontSize(16);
    doc.setTextColor(30, 58, 138);
    doc.text(`INR ${totalFare}`, 130, 256);
    
    // Footer notes
    doc.setTextColor(148, 163, 184); // slate-400
    doc.setFontSize(7.5);
    doc.setFont("Helvetica", "normal");
    doc.text("This is an electronically generated simulated ticket issued by RailGo Reservation Simulator.", 15, 280);
    doc.text("No physical signature is required. Please carry a valid Government ID card matching the passenger names during travel.", 15, 284);
    
    doc.save(`RailGo_Ticket_PNR_${booking.bookingId}.pdf`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" id="search-view">
      {/* Dynamic Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-slate-200 pb-5">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400">Search Results</span>
          <h1 className="font-display font-bold text-2xl text-slate-900 flex items-center gap-2">
            Trains from <span className="text-blue-900">{queryParams.source}</span> to <span className="text-blue-900">{queryParams.destination}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            Journey Date: <strong>{queryParams.date}</strong> | Quota: <strong>{queryParams.quota}</strong>
          </p>
        </div>

        {/* Sorting selection only shown during active searching step */}
        {bookingStep === 'search' && (
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 shadow-xs">
            <button
              onClick={() => setSortParam('duration')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                sortParam === 'duration' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sort by Duration
            </button>
            <button
              onClick={() => setSortParam('fare')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                sortParam === 'fare' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sort by Fare
            </button>
          </div>
        )}
      </div>

      {/* NLP search reference if active */}
      {queryParams.nlpQuery && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-8 text-xs text-amber-800 flex items-center gap-2">
          <BadgePercent className="w-4 h-4 text-amber-600" />
          <span>Showing results matched by AI for: <strong>"{queryParams.nlpQuery}"</strong></span>
        </div>
      )}

      {/* ================= STEP 1: SEARCH RESULTS ================= */}
      {bookingStep === 'search' && (
        <div className="grid grid-cols-1 gap-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white border border-slate-200 rounded-2xl">
              <RefreshCw className="w-8 h-8 text-blue-900 animate-spin" />
              <span className="text-xs text-slate-500 font-medium">Scanning track systems for trains...</span>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-2xl text-xs text-center">
              {error}
            </div>
          ) : trains.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-md mx-auto space-y-4">
              <TrainIcon className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="font-display font-bold text-sm text-slate-900">No direct trains found</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                We couldn't find any trains running between {queryParams.source} and {queryParams.destination} on the selected date. Please try matching other station codes or dates.
              </p>
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-1 bg-blue-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-800 cursor-pointer"
              >
                Go Back Home
              </button>
            </div>
          ) : (
            trains.map((train) => {
              const depTime = (train as any).customDepartureTime || train.departureTimes[train.source];
              const arrTime = (train as any).customArrivalTime || train.arrivalTimes[train.destination];
              const segFareByClass = (train as any).customFareByClass || train.fareByClass;
              const segDistance = (train as any).customDistance || train.distance;
              const isPremium = train.trainName.includes("Vande") || train.trainName.includes("Rajdhani") || train.trainName.includes("Shatabdi");
              
              // Crowd estimation prediction
              const primaryClass = train.classesAvailable[0] || "SL";
              const dateSeed = queryParams.date || '2026-07-20';
              // Simple stable hash based on date + trainId
              const charSum = train.id.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0) + new Date(dateSeed).getDate();
              const density = charSum % 3;
              const crowdLevel = density === 0 ? 'Low' : density === 1 ? 'Medium' : 'High';
              const crowdPercent = density === 0 ? 32 : density === 1 ? 58 : 84;

              return (
                <motion.div
                  key={train.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white border rounded-2xl p-6 shadow-xs hover:shadow-md transition-all relative overflow-hidden ${
                    isPremium ? 'border-amber-300/60 bg-amber-50/5' : 'border-slate-200'
                  }`}
                >
                  {isPremium && (
                    <div className="absolute right-0 top-0 bg-amber-400 text-amber-950 font-display font-bold text-[9px] uppercase tracking-wider px-3 py-1 rounded-bl-lg flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Premium Train
                    </div>
                  )}

                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    {/* Train Core Details */}
                    <div>
                      <span className="font-mono text-xs font-bold text-slate-400">#{train.trainNumber}</span>
                      <h3 className="font-display font-bold text-lg text-slate-900 flex items-center gap-1.5">
                        <TrainIcon className="w-5 h-5 text-blue-900" />
                        {train.trainName}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md font-semibold">Segment: {segDistance} km</span>
                        <span className="text-[11px]">Running Days: <strong>{train.runningDays.join(', ')}</strong></span>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="flex items-center gap-4 sm:gap-8 bg-slate-50/80 border border-slate-100 rounded-xl p-3.5 w-full lg:w-auto">
                      <div className="text-center">
                        <span className="block font-mono text-sm font-bold text-slate-900">{depTime}</span>
                        <span className="block text-[10px] font-mono tracking-wider font-semibold text-slate-400 uppercase">{queryParams.source}</span>
                      </div>
                      <div className="flex flex-col items-center flex-1 min-w-[60px]">
                        <span className="text-[10px] font-mono text-slate-400">Hours</span>
                        <div className="h-0.5 w-full bg-slate-300 relative my-1">
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
                        </div>
                        <span className="text-[10px] font-bold text-blue-900 uppercase tracking-widest">{train.status}</span>
                      </div>
                      <div className="text-center">
                        <span className="block font-mono text-sm font-bold text-slate-900">{arrTime}</span>
                        <span className="block text-[10px] font-mono tracking-wider font-semibold text-slate-400 uppercase">{queryParams.destination}</span>
                      </div>
                    </div>

                    {/* Crowd Estimator Badge */}
                    <div className="flex items-center gap-2 border-l border-slate-100 pl-4 lg:min-w-[140px]">
                      <div>
                        <span className="block text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">AI Crowd Predict</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            crowdLevel === 'Low' ? 'bg-green-500' : crowdLevel === 'Medium' ? 'bg-amber-500' : 'bg-red-500'
                          }`}></span>
                          <span className="text-xs font-semibold text-slate-800">{crowdLevel} Occupancy</span>
                        </div>
                        <span className="block text-[10px] text-slate-500">{crowdPercent}% Seats Booked</span>
                      </div>
                    </div>
                  </div>

                  {/* Seat Availability & Fare selection grids */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-6 pt-5 border-t border-slate-100">
                    {train.classesAvailable.map((cls) => {
                      const fare = segFareByClass ? segFareByClass[cls] : train.fareByClass[cls];
                      const capacity = train.seatCapacity[cls] || 60;
                      // Pseudo remaining seat simulation
                      const remSeats = Math.max(2, Math.round(capacity * (1 - crowdPercent/100)));

                      return (
                        <div
                          key={cls}
                          onClick={() => handleStartBooking(train, cls)}
                          className="border border-slate-200 hover:border-blue-900 rounded-xl p-3.5 hover:bg-blue-50/20 cursor-pointer transition-all flex flex-col justify-between shadow-xs group"
                        >
                          <div>
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-display font-bold text-sm text-slate-800">{cls}</span>
                              <span className="text-[10px] font-mono font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-md">
                                {remSeats} Available
                              </span>
                            </div>
                            <span className="block text-[10px] text-slate-400">General Booking Quota</span>
                          </div>
                          <div className="flex justify-between items-center mt-3.5 pt-2 border-t border-slate-100/60">
                            <span className="font-mono text-xs font-bold text-slate-800 flex items-center">
                              <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                              INR {fare}
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-900 transition-colors" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* ================= STEP 2: ENTER PASSENGERS ================= */}
      {bookingStep === 'passengers' && bookingTrain && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl max-w-3xl mx-auto"
        >
          <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-6">
            <h2 className="font-display font-bold text-lg text-slate-900">Enter Passenger Details</h2>
            <span className="text-xs font-mono font-bold text-blue-900 bg-blue-50 px-3 py-1 rounded-full">
              Train: {bookingTrain.trainNumber} - {bookingClass}
            </span>
          </div>

          {/* Saved passengers import option */}
          {user && user.savedPassengers.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6">
              <span className="text-[10px] font-mono tracking-wider uppercase text-slate-400 block mb-2 font-bold">Quick Import Saved Passengers</span>
              <div className="flex flex-wrap gap-2">
                {user.savedPassengers.map((saved, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => importSavedPassenger(saved)}
                    className="bg-white border border-slate-200 hover:border-blue-950 text-slate-700 hover:text-blue-950 text-xs px-3 py-1.5 rounded-lg font-medium transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                  >
                    + {saved.name} ({saved.age}, {saved.gender})
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handlePassengersSubmit} className="space-y-6">
            {passengers.map((passenger, index) => (
              <div key={index} className="bg-slate-50/50 border border-slate-200 rounded-2xl p-5 relative">
                {passengers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePassenger(index)}
                    className="absolute top-4 right-4 text-xs font-bold text-red-600 hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                )}

                <span className="text-[10px] font-mono tracking-wider uppercase font-bold text-slate-400 block mb-3">Passenger #{index + 1}</span>
                
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="As per valid Govt ID"
                      value={passenger.name}
                      onChange={(e) => handlePassengerChange(index, 'name', e.target.value)}
                      required
                      className="w-full bg-white border border-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-blue-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Age</label>
                    <input
                      type="number"
                      placeholder="e.g. 23"
                      value={passenger.age || ''}
                      onChange={(e) => handlePassengerChange(index, 'age', e.target.value)}
                      required
                      className="w-full bg-white border border-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-blue-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Gender</label>
                    <select
                      value={passenger.gender}
                      onChange={(e) => handlePassengerChange(index, 'gender', e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs rounded-xl px-2.5 py-2.5 focus:outline-hidden focus:border-blue-900"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Berth Preference</label>
                    <select
                      value={passenger.berthPreference}
                      onChange={(e) => handlePassengerChange(index, 'berthPreference', e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs rounded-xl px-2.5 py-2.5 focus:outline-hidden focus:border-blue-900"
                    >
                      <option value="No Preference">No Preference</option>
                      <option value="Lower">Lower (Senior priority)</option>
                      <option value="Middle">Middle</option>
                      <option value="Upper">Upper</option>
                      <option value="Side Lower">Side Lower</option>
                      <option value="Side Upper">Side Upper</option>
                    </select>
                  </div>
                </div>

                {passenger.seniorCitizen && (
                  <div className="mt-3.5 bg-blue-50 text-blue-900 px-3.5 py-2 rounded-xl text-[11px] font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-900" />
                    Senior Citizen concession detected. 10% discount auto-applied on this berth ticket!
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-between items-center pt-4">
              <button
                type="button"
                onClick={addPassenger}
                className="text-xs font-bold text-blue-900 hover:underline cursor-pointer"
              >
                + Add Another Passenger
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setBookingStep('search')}
                  className="px-5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-900 text-white px-6 py-2.5 rounded-xl font-semibold text-xs shadow-md hover:bg-blue-800 transition-all flex items-center gap-1 cursor-pointer"
                >
                  Proceed to Payment
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      )}

      {/* ================= STEP 3: SIMULATED PAYMENT ================= */}
      {bookingStep === 'payment' && bookingTrain && fareBreakdown && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl max-w-lg mx-auto"
        >
          <h2 className="font-display font-bold text-xl text-slate-900 mb-1">Secure Payment Simulator</h2>
          <p className="text-xs text-slate-500 mb-6">Complete a simulated payment transaction. Seats are deducted and your 10-digit PNR is allocated instantly upon successful simulation.</p>

          {/* Backend Fare Breakdown */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 mb-6 text-xs space-y-2.5">
            <h3 className="font-display font-bold text-slate-800 text-xs border-b border-slate-200 pb-2 mb-2 uppercase tracking-wider">Detailed Fare Breakdown</h3>
            
            <div className="flex justify-between text-slate-600">
              <span>Base Fare (Normal passengers x {passengers.filter(p => !p.seniorCitizen).length}):</span>
              <span className="font-mono text-slate-900 font-semibold">INR {fareBreakdown.singleBaseFare * passengers.filter(p => !p.seniorCitizen).length}</span>
            </div>

            {passengers.some(p => p.seniorCitizen) && (
              <div className="flex justify-between text-emerald-700">
                <span>Senior Concession (Seniors x {passengers.filter(p => p.seniorCitizen).length} with 10% concession):</span>
                <span className="font-mono font-semibold">INR {Math.round(fareBreakdown.singleBaseFare * 0.9) * passengers.filter(p => p.seniorCitizen).length}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>Reservation Charge:</span>
              <span className="font-mono text-slate-900 font-semibold">INR {fareBreakdown.reservationCharge}</span>
            </div>

            <div className="flex justify-between text-slate-600">
              <span>Convenience Fee:</span>
              <span className="font-mono text-slate-900 font-semibold">INR {fareBreakdown.convenienceFee}</span>
            </div>

            {fareBreakdown.tatkalSurcharge > 0 && (
              <div className="flex justify-between text-amber-800 font-medium">
                <span>Tatkal Quota Surcharge:</span>
                <span className="font-mono font-semibold">INR {fareBreakdown.tatkalSurcharge}</span>
              </div>
            )}

            {fareBreakdown.gst > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>GST (5% for AC Classes):</span>
                <span className="font-mono text-slate-900 font-semibold">INR {fareBreakdown.gst}</span>
              </div>
            )}

            <div className="flex justify-between font-bold text-slate-900 pt-2.5 border-t border-slate-200 text-sm">
              <span>Total Payable Amount:</span>
              <span className="font-mono text-blue-900 text-sm">INR {fareBreakdown.totalAmount}</span>
            </div>
          </div>

          {/* Payment Method Tabs */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`flex-1 py-2 text-center text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                paymentMethod === 'card' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Credit/Debit Card
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('upi')}
              className={`flex-1 py-2 text-center text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                paymentMethod === 'upi' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              UPI Transfer
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('netbanking')}
              className={`flex-1 py-2 text-center text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                paymentMethod === 'netbanking' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Net Banking
            </button>
          </div>

          {/* Multi-Method Forms */}
          <div className="space-y-4 mb-6">
            {paymentMethod === 'card' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Simulated Card Number</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="4111 2222 3333 4444"
                      value={cardNo}
                      onChange={(e) => setCardNo(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Expiry</label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-900 text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">CVV</label>
                    <input
                      type="password"
                      maxLength={3}
                      placeholder="•••"
                      className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-900 text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Cardholder Name</label>
                  <input
                    type="text"
                    placeholder="Holder full name"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-900"
                  />
                </div>
              </motion.div>
            )}

            {paymentMethod === 'upi' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Simulated Virtual Payment Address (UPI ID)</label>
                  <input
                    type="text"
                    placeholder="e.g. mobile@oksbi"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-900 font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Please enter a valid format containing '@'</p>
                </div>
              </motion.div>
            )}

            {paymentMethod === 'netbanking' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Select Bank Account</label>
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-blue-900 font-semibold"
                  >
                    <option value="SBI">State Bank of India (SBI)</option>
                    <option value="HDFC">HDFC Bank</option>
                    <option value="ICICI">ICICI Bank</option>
                    <option value="AXIS">Axis Bank</option>
                    <option value="PNB">Punjab National Bank</option>
                  </select>
                </div>
              </motion.div>
            )}
          </div>

          {/* Action Simulation Triggers */}
          <div className="space-y-3">
            <button
              type="button"
              disabled={paymentStatus === 'processing'}
              onClick={() => handlePaymentSubmit(null, false)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl disabled:opacity-50 font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {paymentStatus === 'processing' ? 'Processing simulated transaction...' : `Simulate Successful Payment (INR ${fareBreakdown.totalAmount})`}
              <ShieldCheck className="w-4.5 h-4.5" />
            </button>

            <button
              type="button"
              disabled={paymentStatus === 'processing'}
              onClick={() => handlePaymentSubmit(null, true)}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl disabled:opacity-50 font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {paymentStatus === 'processing' ? 'Processing simulated transaction...' : 'Simulate Failed Payment'}
              <XCircle className="w-4.5 h-4.5 text-rose-100" />
            </button>

            <button
              type="button"
              onClick={() => setBookingStep('passengers')}
              className="w-full text-center text-xs text-slate-500 font-semibold hover:underline mt-2 cursor-pointer"
            >
              Go Back & Edit Passengers
            </button>
          </div>
        </motion.div>
      )}

      {/* ================= STEP 4: BOOKING SUCCESS TICKET CONFIRMED ================= */}
      {bookingStep === 'success' && confirmedBooking && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-xl mx-auto space-y-6"
        >
          {/* Confirmed Banner */}
          <div className="bg-green-50 border border-green-200 text-green-800 p-6 rounded-3xl text-center shadow-xs">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <h2 className="font-display font-bold text-lg">Ticket Confirmed Successfully!</h2>
            <p className="text-xs text-green-700 mt-1">
              Your berths have been allocated in our active layout. Confirmation email dispatched to test mailbox.
            </p>
          </div>

          {/* Ticket Display */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xl relative">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-900"></div>
            
            {/* Ticket header */}
            <div className="bg-blue-900 text-white p-5 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-mono text-slate-300 font-bold tracking-widest uppercase block">PNR NUMBER</span>
                <span className="font-mono font-bold text-lg tracking-wide text-amber-400">{confirmedBooking.bookingId}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-slate-300 font-bold tracking-widest uppercase block">CLASS & QUOTA</span>
                <span className="font-display font-bold text-xs">{confirmedBooking.classType} Class / {confirmedBooking.quota}</span>
              </div>
            </div>

            {/* Train details */}
            <div className="p-6 space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[9px] font-mono text-slate-400 block font-bold uppercase">TRAIN INFORMATION</span>
                  <span className="font-display font-bold text-sm text-slate-900 flex items-center gap-1">
                    <TrainIcon className="w-4 h-4 text-blue-900" />
                    {confirmedBooking.trainName} ({confirmedBooking.trainNumber})
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-mono text-slate-400 block font-bold uppercase">DATE OF JOURNEY</span>
                  <span className="font-mono font-bold text-xs text-slate-900">{confirmedBooking.journeyDate}</span>
                </div>
              </div>

              {/* Station segment */}
              <div className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-semibold">
                <div>
                  <span className="block text-[9px] font-mono text-slate-400 uppercase">FROM</span>
                  <span className="block text-slate-900 font-bold">{confirmedBooking.source}</span>
                </div>
                <div className="h-0.5 bg-slate-300 flex-1 mx-4 relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
                </div>
                <div className="text-right">
                  <span className="block text-[9px] font-mono text-slate-400 uppercase">TO</span>
                  <span className="block text-slate-900 font-bold">{confirmedBooking.destination}</span>
                </div>
              </div>

              {/* Passenger Berth Details */}
              <div>
                <span className="text-[9px] font-mono text-slate-400 font-bold uppercase block mb-2">PASSENGER SEATING BERTHS</span>
                <div className="space-y-2">
                  {confirmedBooking.passengers.map((p, idx) => (
                    <div key={idx} className="border border-slate-100 bg-slate-50/50 rounded-xl p-3 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-slate-800">{p.name}</span>
                        <span className="text-slate-500 block text-[10px]">{p.age} Yrs | {p.gender}</span>
                      </div>
                      <div className="text-right">
                        {p.assignedSeat ? (
                          <span className="font-mono text-blue-900 font-bold text-[11px] bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200">
                            Coach {p.assignedSeat.coach} / Seat {p.assignedSeat.seatNumber} ({p.assignedSeat.berthType})
                          </span>
                        ) : (
                          <span className="text-slate-400">WL (Waiting List)</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pricing breakdown */}
              <div className="flex justify-between items-center pt-4 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-[9px] font-mono text-slate-400 block font-bold uppercase">MOCK PAYMENT REFERENCE</span>
                  <span className="font-mono text-slate-600 block">{confirmedBooking.paymentId}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-mono text-slate-400 block font-bold uppercase">TOTAL FARE PAID</span>
                  <span className="font-mono font-bold text-sm text-blue-950">INR {confirmedBooking.fare}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => downloadPDFTicket(confirmedBooking)}
              className="flex-1 bg-blue-900 text-white py-3 rounded-xl font-semibold text-xs shadow-md hover:bg-blue-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
            >
              <Download className="w-4 h-4" /> Download PDF
            </button>
            <button
              onClick={() => window.print()}
              className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-semibold text-xs shadow-md hover:bg-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
            >
              <Printer className="w-4 h-4" /> Print Ticket
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex-1 bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-semibold text-xs shadow-xs hover:bg-slate-50 transition-all text-center cursor-pointer"
            >
              Go to Dashboard
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};
