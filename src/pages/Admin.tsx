import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Analytics, Train, User as UserType } from '../types';
import { ShieldAlert, Plus, Edit, Trash, RefreshCw, AlertTriangle, Users, DollarSign, Calendar, Train as TrainIcon, Ban, Activity, Check, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [trainsList, setTrainsList] = useState<Train[]>([]);
  const [usersList, setUsersList] = useState<Omit<UserType, 'passwordHash' | 'savedPassengers' | 'favoriteRoutes'>[]>([]);
  const [loading, setLoading] = useState(true);

  // New train form states
  const [showAddTrain, setShowAddTrain] = useState(false);
  const [newTrainName, setNewTrainName] = useState('');
  const [newTrainNo, setNewTrainNo] = useState('');
  const [newSource, setNewSource] = useState('NDLS');
  const [newDest, setNewDest] = useState('BCT');
  const [newSLFare, setNewSLFare] = useState('320');
  const [new3AFare, setNew3AFare] = useState('860');
  const [newRunningDays, setNewRunningDays] = useState<string[]>(['Mon', 'Wed', 'Fri']);

  // Edit train status state
  const [updatingTrainId, setUpdatingTrainId] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'Active' | 'Cancelled' | 'Delayed'>('Active');
  const [updateDelay, setUpdateDelay] = useState('0');

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/');
      return;
    }
    fetchAdminData();
  }, [user]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const stats = await apiService.getAnalytics();
      setAnalytics(stats);

      const tList = await apiService.searchTrains({ source: 'NDLS', destination: 'BCT', date: '2026-07-20' }); // seeding baseline search
      setTrainsList(tList);

      const uList = await apiService.getUsersList();
      setUsersList(uList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTrain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrainName || !newTrainNo) {
      alert("Name and Number are required.");
      return;
    }

    const payload: Partial<Train> = {
      trainNumber: newTrainNo,
      trainName: newTrainName,
      source: newSource,
      destination: newDest,
      intermediateStations: [newSource, newDest],
      arrivalTimes: { [newSource]: '00:00', [newDest]: '18:30' },
      departureTimes: { [newSource]: '08:00', [newDest]: '00:00' },
      distance: 1380,
      classesAvailable: ['SL', '3A'],
      seatCapacity: { SL: 80, '3A': 60 },
      fareByClass: { SL: Number(newSLFare), '3A': Number(new3AFare) },
      runningDays: newRunningDays,
      status: 'Active'
    };

    try {
      await apiService.addTrain(payload);
      alert("Train added successfully to central database!");
      setShowAddTrain(false);
      setNewTrainName('');
      setNewTrainNo('');
      fetchAdminData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTrain = async (id: string) => {
    if (!confirm("Are you sure you want to retire this train from active service?")) return;
    try {
      await apiService.deleteTrain(id);
      alert("Train deleted successfully.");
      fetchAdminData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingTrainId) return;

    try {
      await apiService.updateTrain(updatingTrainId, {
        status: updateStatus,
        delayMinutes: Number(updateDelay)
      });
      alert("Train status updated. Passengers notified automatically!");
      setUpdatingTrainId(null);
      fetchAdminData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSuspendUser = async (id: string) => {
    if (!confirm("Do you want to toggle suspension status for this passenger?")) return;
    try {
      const res = await apiService.suspendUser(id);
      alert(res.message);
      fetchAdminData();
    } catch (err) {
      console.error(err);
    }
  };

  if (!user || user.role !== 'admin') return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" id="admin-view">
      <div className="flex justify-between items-center border-b border-slate-200 pb-5 mb-8">
        <div>
          <span className="text-[10px] font-mono tracking-widest font-bold text-red-600 uppercase">RailConnect AI Admin Console</span>
          <h1 className="font-display font-bold text-2xl text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-blue-900" />
            Central Railway Hub Control
          </h1>
        </div>
        <button
          onClick={fetchAdminData}
          className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
          title="Refresh Data"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="w-8 h-8 text-blue-900 animate-spin" />
          <span className="text-xs text-slate-500 font-medium">Securing connection to railway telemetry databases...</span>
        </div>
      ) : (
        <div className="space-y-10">
          {/* ================= ANALYTICS CARDS GRID ================= */}
          {analytics && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs">
                <span className="text-[10px] font-mono tracking-wider text-slate-400 font-bold uppercase">Total Ticketing Revenue</span>
                <span className="block font-mono text-3xl font-bold text-blue-950 mt-1 flex items-center">
                  <DollarSign className="w-8 h-8 text-slate-400" />
                  INR {analytics.totalRevenue}
                </span>
                <span className="text-[10px] text-green-600 font-semibold block mt-1">● Up 12.4% from last week</span>
              </div>

              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs">
                <span className="text-[10px] font-mono tracking-wider text-slate-400 font-bold uppercase">Assigned PNR Bookings</span>
                <span className="block font-mono text-3xl font-bold text-blue-950 mt-1 flex items-center">
                  <Calendar className="w-8 h-8 text-slate-400" />
                  {analytics.totalBookings}
                </span>
                <span className="text-[10px] text-slate-500 block mt-1">Active scheduling slots filled</span>
              </div>

              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs">
                <span className="text-[10px] font-mono tracking-wider text-slate-400 font-bold uppercase">Registered Passengers</span>
                <span className="block font-mono text-3xl font-bold text-blue-950 mt-1 flex items-center">
                  <Users className="w-8 h-8 text-slate-400" />
                  {analytics.totalUsers}
                </span>
                <span className="text-[10px] text-slate-500 block mt-1">Syncing passenger profiles</span>
              </div>
            </div>
          )}

          {/* ================= MANAGE TRAINS MODULE ================= */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100 mb-6">
              <div className="flex items-center gap-2">
                <TrainIcon className="w-5 h-5 text-blue-900" />
                <h2 className="font-display font-bold text-sm text-slate-900">Active Train Telemetry Schedule</h2>
              </div>
              <button
                onClick={() => setShowAddTrain(!showAddTrain)}
                className="bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Train Segment
              </button>
            </div>

            {/* Expandable Add Train Form */}
            <AnimatePresence>
              {showAddTrain && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onSubmit={handleCreateTrain}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 space-y-4 overflow-hidden"
                >
                  <span className="text-[10px] font-mono tracking-wider font-bold text-slate-400 uppercase block">Inbound Train Creation</span>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Train Number</label>
                      <input
                        type="text"
                        placeholder="e.g. 12951"
                        value={newTrainNo}
                        onChange={(e) => setNewTrainNo(e.target.value)}
                        required
                        className="w-full bg-white border border-slate-200 text-xs rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Train Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Rajdhani Exp"
                        value={newTrainName}
                        onChange={(e) => setNewTrainName(e.target.value)}
                        required
                        className="w-full bg-white border border-slate-200 text-xs rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Source Code</label>
                      <input
                        type="text"
                        value={newSource}
                        onChange={(e) => setNewSource(e.target.value.toUpperCase())}
                        required
                        className="w-full bg-white border border-slate-200 text-xs rounded-lg px-3 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Destination Code</label>
                      <input
                        type="text"
                        value={newDest}
                        onChange={(e) => setNewDest(e.target.value.toUpperCase())}
                        required
                        className="w-full bg-white border border-slate-200 text-xs rounded-lg px-3 py-2 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Sleeper SL Base Fare (INR)</label>
                      <input
                        type="number"
                        value={newSLFare}
                        onChange={(e) => setNewSLFare(e.target.value)}
                        required
                        className="w-full bg-white border border-slate-200 text-xs rounded-lg px-3 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">AC 3A Base Fare (INR)</label>
                      <input
                        type="number"
                        value={new3AFare}
                        onChange={(e) => setNew3AFare(e.target.value)}
                        required
                        className="w-full bg-white border border-slate-200 text-xs rounded-lg px-3 py-2 font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bg-blue-900 text-white font-bold text-xs py-2 px-4 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
                  >
                    Commit Train Entry
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Trains telemetries table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 uppercase tracking-wider font-mono text-[9px] border-b border-slate-200">
                    <th className="p-4">Train Number / Name</th>
                    <th className="p-4">Route Segment</th>
                    <th className="p-4">Delay Telemetry</th>
                    <th className="p-4">Status Flag</th>
                    <th className="p-4 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trainsList.slice(0, 10).map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="p-4 font-semibold text-slate-800">
                        <span className="block font-mono text-[10px] text-slate-400">#{t.trainNumber}</span>
                        {t.trainName}
                      </td>
                      <td className="p-4 font-semibold text-slate-700">
                        {t.source} → {t.destination}
                      </td>
                      <td className="p-4 font-mono text-slate-500">
                        {t.status === 'Delayed' ? `${t.delayMinutes} mins late` : 'On Time'}
                      </td>
                      <td className="p-4">
                        <span className={`inline-block font-bold px-2 py-0.5 rounded-sm text-[10px] ${
                          t.status === 'Active' ? 'bg-green-50 text-green-700' : t.status === 'Cancelled' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setUpdatingTrainId(t.id);
                            setUpdateStatus(t.status);
                            setUpdateDelay(String(t.delayMinutes || 0));
                          }}
                          className="text-xs font-bold text-blue-900 hover:underline cursor-pointer"
                        >
                          Modify Status
                        </button>
                        <button
                          onClick={() => handleDeleteTrain(t.id)}
                          className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
                        >
                          Retire
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ================= MANAGE USERS MODULE ================= */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
            <div className="pb-4 border-b border-slate-100 mb-6 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-900" />
              <h2 className="font-display font-bold text-sm text-slate-900">Passenger Profile Registry</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 uppercase tracking-wider font-mono text-[9px] border-b border-slate-200">
                    <th className="p-4">Passenger Name</th>
                    <th className="p-4">Email Address</th>
                    <th className="p-4">Verified</th>
                    <th className="p-4">Role</th>
                    <th className="p-4 text-right">Security Access</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersList.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="p-4 font-semibold text-slate-800">{u.name}</td>
                      <td className="p-4 font-mono text-slate-500">{u.email}</td>
                      <td className="p-4">
                        {u.verified ? (
                          <span className="text-green-600 font-bold">Yes</span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                      <td className="p-4 font-semibold text-slate-600 uppercase text-[10px] tracking-wide">{u.role}</td>
                      <td className="p-4 text-right">
                        {u.role !== 'admin' ? (
                          <button
                            onClick={() => handleSuspendUser(u.id)}
                            className="text-xs font-bold text-red-600 hover:underline cursor-pointer flex items-center gap-1 ml-auto"
                          >
                            <Ban className="w-3.5 h-3.5" /> Toggle Suspend
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Super Administrator</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= UPDATE STATUS DIALOG ================= */}
      <AnimatePresence>
        {updatingTrainId && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.form
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onSubmit={handleUpdateStatusSubmit}
              className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4"
            >
              <h3 className="font-display font-bold text-base text-slate-900">Modify Train Status</h3>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Inbound Status</label>
                <select
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs"
                >
                  <option value="Active">Active / On-Time</option>
                  <option value="Delayed">Delayed / Late</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {updateStatus === 'Delayed' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Delay Minutes</label>
                  <input
                    type="number"
                    value={updateDelay}
                    onChange={(e) => setUpdateDelay(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-mono"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUpdatingTrainId(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-900 text-white font-bold text-xs py-2.5 rounded-xl hover:bg-blue-800 transition-all cursor-pointer"
                >
                  Save Status
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
