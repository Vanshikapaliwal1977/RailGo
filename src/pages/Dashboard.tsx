import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Booking, SavedPassenger, FavoriteRoute } from '../types';
import { Calendar, User as UserIcon, Users, Trash, MapPin, Search, Ticket, RefreshCw, XCircle, DollarSign, Download, Plus, Heart, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateProfile, refreshProfile } = useAuth();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);

  // Cancellation modal states
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  const [selectedPassengerIdx, setSelectedPassengerIdx] = useState<number | null>(null); // null = full booking cancel
  const [cancellationProcessing, setCancellationProcessing] = useState(false);

  // New saved passenger form states
  const [newPassengerName, setNewPassengerName] = useState('');
  const [newPassengerAge, setNewPassengerAge] = useState('');
  const [newPassengerGender, setNewPassengerGender] = useState('Male');
  const [newPassengerPreference, setNewPassengerPreference] = useState<'Lower' | 'Middle' | 'Upper' | 'Side Lower' | 'Side Upper' | 'No Preference'>('No Preference');

  // New favorite route form states
  const [stations, setStations] = useState<{ code: string; name: string }[]>([]);
  const [favSource, setFavSource] = useState('');
  const [favDest, setFavDest] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Load user bookings
    apiService.getUserBookings()
      .then(res => {
        setBookings(res);
        setLoadingBookings(false);
      })
      .catch(err => {
        console.error(err);
        setLoadingBookings(false);
      });

    // Load stations for favorite route selectors
    apiService.getStations()
      .then(res => {
        setStations(res.map(s => ({ code: s.code, name: s.name })));
      })
      .catch(err => console.error(err));
  }, [user]);

  const handleCancelTicketClick = (booking: Booking) => {
    setCancellingBooking(booking);
    setSelectedPassengerIdx(null); // default to full cancellation
  };

  const handleExecuteCancellation = async () => {
    if (!cancellingBooking) return;
    setCancellationProcessing(true);

    try {
      // API call to delete (cancel) booking
      const res = await apiService.cancelBooking(
        cancellingBooking.bookingId,
        selectedPassengerIdx !== null ? selectedPassengerIdx : undefined
      );

      // Re-load bookings
      const updatedBookings = await apiService.getUserBookings();
      setBookings(updatedBookings);
      setCancellingBooking(null);
      alert(res.message || "Ticket successfully cancelled!");
    } catch (err) {
      console.error(err);
      alert("Could not process cancellation at this time.");
    } finally {
      setCancellationProcessing(false);
    }
  };

  const handleAddSavedPassenger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassengerName || !newPassengerAge) {
      alert("Name and age are required.");
      return;
    }

    const ageNum = Number(newPassengerAge);
    const newPassenger: SavedPassenger = {
      name: newPassengerName,
      age: ageNum,
      gender: newPassengerGender,
      berthPreference: newPassengerPreference,
      seniorCitizen: ageNum >= 60
    };

    const currentSaved = user?.savedPassengers || [];
    const updatedList = [...currentSaved, newPassenger];

    try {
      await updateProfile({ savedPassengers: updatedList });
      setNewPassengerName('');
      setNewPassengerAge('');
      setNewPassengerGender('Male');
      setNewPassengerPreference('No Preference');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSavedPassenger = async (index: number) => {
    const currentSaved = user?.savedPassengers || [];
    const updatedList = currentSaved.filter((_, i) => i !== index);
    try {
      await updateProfile({ savedPassengers: updatedList });
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddFavoriteRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!favSource || !favDest) {
      alert("Please select both source and destination stations.");
      return;
    }
    if (favSource === favDest) {
      alert("Source and destination cannot be the same.");
      return;
    }

    const newRoute: FavoriteRoute = {
      source: favSource,
      destination: favDest
    };

    const currentFavs = user?.favoriteRoutes || [];
    // Prevent duplicates
    if (currentFavs.some(f => f.source === favSource && f.destination === favDest)) {
      alert("This route is already in your favorites list.");
      return;
    }

    const updatedList = [...currentFavs, newRoute];
    try {
      await updateProfile({ favoriteRoutes: updatedList });
      setFavSource('');
      setFavDest('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFavoriteRoute = async (index: number) => {
    const currentFavs = user?.favoriteRoutes || [];
    const updatedList = currentFavs.filter((_, i) => i !== index);
    try {
      await updateProfile({ favoriteRoutes: updatedList });
    } catch (err) {
      console.error(err);
    }
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
    
    // Corner patterns
    drawFinderPattern(x + 2, y + 2);
    drawFinderPattern(x + size - 9, y + 2);
    drawFinderPattern(x + 2, y + size - 9);
    
    // Vector blocks
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

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" id="dashboard-view">
      {/* Dashboard Grid Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          {user.avatar ? (
            <img src={user.avatar} alt="User Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-blue-900" />
          ) : (
            <div className="w-16 h-16 bg-blue-900 text-white font-display font-bold text-2xl rounded-full flex items-center justify-center border-2 border-white shadow-md">
              {user.name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="font-display font-bold text-xl text-slate-900">{user.name}</h1>
            <p className="text-xs text-slate-500">{user.email} | {user.phone || 'No phone registered'}</p>
            <span className="inline-block bg-blue-50 text-blue-900 font-bold text-[9px] uppercase px-2 py-0.5 rounded-sm tracking-widest mt-1.5">
              Verified Traveler
            </span>
          </div>
        </div>

        {/* Quick Search Redirect widget */}
        <button
          onClick={() => navigate('/')}
          className="bg-blue-900 hover:bg-blue-800 text-white px-5 py-3 rounded-xl font-semibold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer w-full md:w-auto justify-center"
        >
          <Search className="w-4 h-4" />
          Book New Train Tickets
        </button>
      </div>

      {/* Main Bento Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Bookings List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
              <Ticket className="w-5 h-5 text-blue-900" />
              <h2 className="font-display font-bold text-sm text-slate-900">Your Reservation History</h2>
            </div>

            {loadingBookings ? (
              <div className="flex items-center justify-center py-12 gap-2">
                <RefreshCw className="w-6 h-6 text-blue-900 animate-spin" />
                <span className="text-xs text-slate-500 font-medium">Loading ticket records...</span>
              </div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-12 space-y-4 max-w-sm mx-auto">
                <Ticket className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="font-display font-bold text-sm text-slate-900">No bookings logged yet</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  You haven't purchased any railway tickets yet. Search routes and reserve seating right away!
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="bg-blue-900 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
                >
                  Book Tickets
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {bookings.map((booking) => {
                  const isCancelled = booking.status === 'Cancelled';
                  return (
                    <div
                      key={booking.bookingId}
                      className={`border rounded-2xl p-5 relative overflow-hidden transition-all ${
                        isCancelled ? 'border-slate-200 bg-slate-50/50 opacity-85' : 'border-slate-200 bg-white hover:border-blue-900 shadow-xs'
                      }`}
                    >
                      {/* Ticket header */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3.5 mb-4">
                        <div>
                          <span className="text-[10px] font-mono tracking-widest font-bold text-slate-400 block">PNR NUMBER</span>
                          <span className="font-mono font-bold text-sm text-blue-900">{booking.bookingId}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:items-center">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            isCancelled ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'
                          }`}>
                            {booking.status}
                          </span>
                          <span className="text-[10px] font-mono bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 border border-slate-200">
                            {booking.classType} Class
                          </span>
                        </div>
                      </div>

                      {/* Journey Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs mb-4">
                        <div>
                          <span className="text-[9px] font-mono text-slate-400 block font-bold">ROUTE SEGMENT</span>
                          <span className="font-semibold text-slate-800 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {booking.source} → {booking.destination}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-mono text-slate-400 block font-bold">DATE OF JOURNEY</span>
                          <span className="font-mono font-bold text-slate-800">{booking.journeyDate}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-mono text-slate-400 block font-bold">FAID TOTAL</span>
                          <span className="font-mono font-bold text-slate-800">INR {booking.fare}</span>
                        </div>
                      </div>

                      {/* Passengers seating details */}
                      <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-3 mb-4 space-y-2">
                        {booking.passengers.map((p, pIdx) => (
                          <div key={pIdx} className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-600 font-medium">{p.name} ({p.age}, {p.gender})</span>
                            <span className="font-mono text-slate-800 font-semibold">
                              {p.assignedSeat ? `Coach ${p.assignedSeat.coach} / Seat ${p.assignedSeat.seatNumber} (${p.assignedSeat.berthType})` : 'Waiting List'}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Action options */}
                      {!isCancelled && (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleCancelTicketClick(booking)}
                            className="px-3.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            Cancel Reservation
                          </button>
                          <button
                            onClick={() => downloadPDFTicket(booking)}
                            className="bg-blue-900 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-800 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" /> PDF Ticket
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Column: Saved Passengers & Favorite Routes */}
        <div className="space-y-6">
          {/* Saved Passengers Manager */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100">
              <Users className="w-5 h-5 text-blue-900" />
              <h2 className="font-display font-bold text-sm text-slate-900">Saved Passengers</h2>
            </div>

            {/* List */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 mb-5">
              {(user.savedPassengers || []).map((p, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-slate-800 block">{p.name}</span>
                    <span className="text-slate-500 text-[10px]">{p.age} yrs | {p.gender} | Preference: {p.berthPreference}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteSavedPassenger(idx)}
                    className="p-1 hover:bg-red-50 text-red-600 rounded-lg transition-colors cursor-pointer"
                    aria-label="Delete Passenger"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {(user.savedPassengers || []).length === 0 && (
                <span className="text-xs text-slate-400 text-center block py-4">No saved passengers stored yet</span>
              )}
            </div>

            {/* Add Passenger form */}
            <form onSubmit={handleAddSavedPassenger} className="space-y-3 pt-3 border-t border-slate-100">
              <span className="text-[10px] font-mono tracking-wider uppercase font-bold text-slate-400 block">Add New Passenger</span>
              <input
                type="text"
                placeholder="Passenger Full Name"
                value={newPassengerName}
                onChange={(e) => setNewPassengerName(e.target.value)}
                required
                className="w-full bg-white border border-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-hidden focus:border-blue-900"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Age"
                  value={newPassengerAge}
                  onChange={(e) => setNewPassengerAge(e.target.value)}
                  required
                  className="bg-white border border-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-hidden focus:border-blue-900"
                />
                <select
                  value={newPassengerGender}
                  onChange={(e) => setNewPassengerGender(e.target.value)}
                  className="bg-white border border-slate-200 text-xs rounded-lg px-2 py-2 focus:outline-hidden focus:border-blue-900"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <select
                value={newPassengerPreference}
                onChange={(e) => setNewPassengerPreference(e.target.value as any)}
                className="w-full bg-white border border-slate-200 text-xs rounded-lg px-2.5 py-2 focus:outline-hidden focus:border-blue-900"
              >
                <option value="No Preference">No Preference</option>
                <option value="Lower">Lower Berth</option>
                <option value="Middle">Middle Berth</option>
                <option value="Upper">Upper Berth</option>
                <option value="Side Lower">Side Lower</option>
                <option value="Side Upper">Side Upper</option>
              </select>

              <button
                type="submit"
                className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Save Passenger
              </button>
            </form>
          </div>

          {/* Favorite Routes */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100">
              <Heart className="w-5 h-5 text-red-600 fill-red-100" />
              <h2 className="font-display font-bold text-sm text-slate-900">Favorite Routes</h2>
            </div>

            {/* List */}
            <div className="space-y-2 mb-4">
              {(user.favoriteRoutes || []).map((route, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold bg-blue-50 text-blue-900 px-2 py-0.5 rounded-sm text-[10px]">{route.source}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-mono font-bold bg-blue-50 text-blue-900 px-2 py-0.5 rounded-sm text-[10px]">{route.destination}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navigate(`/?source=${route.source}&destination=${route.destination}`)}
                      className="p-1 text-blue-900 hover:bg-blue-50 rounded-lg transition-colors text-[11px] font-bold cursor-pointer"
                    >
                      Book
                    </button>
                    <button
                      onClick={() => handleDeleteFavoriteRoute(idx)}
                      className="p-1 hover:bg-red-50 text-red-600 rounded-lg transition-colors cursor-pointer"
                      aria-label="Delete Favorite"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {(user.favoriteRoutes || []).length === 0 && (
                <span className="text-xs text-slate-400 text-center block py-4">No favorite routes saved yet</span>
              )}
            </div>

            {/* Quick Add Route form */}
            <form onSubmit={handleAddFavoriteRoute} className="space-y-2 pt-2 border-t border-slate-100">
              <span className="text-[10px] font-mono tracking-wider uppercase font-bold text-slate-400 block">Add Fav Segment</span>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={favSource}
                  onChange={(e) => setFavSource(e.target.value)}
                  className="bg-white border border-slate-200 text-xs rounded-lg px-2 py-2 focus:outline-hidden focus:border-blue-900"
                >
                  <option value="">From</option>
                  {stations.slice(0, 15).map(s => <option key={s.code} value={s.code}>{s.code} - {s.name.slice(0, 12)}</option>)}
                </select>
                <select
                  value={favDest}
                  onChange={(e) => setFavDest(e.target.value)}
                  className="bg-white border border-slate-200 text-xs rounded-lg px-2 py-2 focus:outline-hidden focus:border-blue-900"
                >
                  <option value="">To</option>
                  {stations.slice(0, 15).map(s => <option key={s.code} value={s.code}>{s.code} - {s.name.slice(0, 12)}</option>)}
                </select>
              </div>
              <button
                type="submit"
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer border border-slate-300"
              >
                + Pin Route Segment
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ================= CANCELLATION MODAL ENGINE ================= */}
      <AnimatePresence>
        {cancellingBooking && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl relative"
            >
              <h2 className="font-display font-bold text-lg text-slate-900 mb-2">Cancel Reservation Ticket</h2>
              <p className="text-xs text-slate-500 mb-4">
                Verify passengers and select cancellation preferences. Cancelled segment berths return instantly to active inventory.
              </p>

              {/* Cancellation options selection */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Who are you cancelling?</label>
                  <select
                    value={selectedPassengerIdx !== null ? String(selectedPassengerIdx) : 'all'}
                    onChange={(e) => setSelectedPassengerIdx(e.target.value === 'all' ? null : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-hidden"
                  >
                    <option value="all">Complete Ticket Cancellation (All Passengers)</option>
                    {cancellingBooking.passengers.map((p, idx) => (
                      <option key={idx} value={idx}>Partial Cancel: {p.name} ({p.assignedSeat?.coach} Coach / Seat {p.assignedSeat?.seatNumber})</option>
                    ))}
                  </select>
                </div>

                {/* Refund Estimate */}
                <div className="bg-red-50 text-red-800 border border-red-100 rounded-2xl p-4 text-xs space-y-1.5">
                  <span className="font-bold block uppercase text-[9px] tracking-wider font-mono">Refund Statement Policy</span>
                  <div className="flex justify-between">
                    <span>Base segment pricing refund:</span>
                    <span className="font-mono font-bold">
                      INR {selectedPassengerIdx !== null ? Math.round(cancellingBooking.fare / cancellingBooking.passengers.length) : cancellingBooking.fare}
                    </span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Cancellation Fee (15%):</span>
                    <span className="font-mono text-red-700">
                      - INR {selectedPassengerIdx !== null ? Math.round((cancellingBooking.fare / cancellingBooking.passengers.length) * 0.15) : Math.round(cancellingBooking.fare * 0.15)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-red-200 pt-1.5 text-slate-900 text-xs">
                    <span>Refunded Amount Total:</span>
                    <span className="font-mono text-green-700">
                      INR {selectedPassengerIdx !== null ? Math.round((cancellingBooking.fare / cancellingBooking.passengers.length) * 0.85) : Math.round(cancellingBooking.fare * 0.85)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Form buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCancellingBooking(null)}
                  disabled={cancellationProcessing}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-3 rounded-xl transition-all cursor-pointer text-center"
                >
                  Close Window
                </button>
                <button
                  type="button"
                  onClick={handleExecuteCancellation}
                  disabled={cancellationProcessing}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  {cancellationProcessing ? 'Processing...' : 'Confirm Cancel Ticket'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
