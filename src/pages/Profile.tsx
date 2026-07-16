import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, ShieldCheck, Mail, Phone, Lock, Save, ArrowLeft, Bot } from 'lucide-react';
import { motion } from 'motion/react';

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      await updateProfile({ name, phone, avatar });
      setMessage("Profile details updated successfully!");
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || err.message || "Could not save details.");
    } finally {
      setLoading(false);
    }
  };

  const avatarsList = [
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80"
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8" id="profile-view">
      {/* Back to Dashboard */}
      <button
        onClick={() => navigate('/dashboard')}
        className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5 mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs"
      >
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-6">
          <h1 className="font-display font-bold text-lg text-slate-900">Manage Your Profile Details</h1>
          <span className="text-[10px] font-mono font-bold text-green-700 bg-green-50 px-3 py-1 rounded-full uppercase tracking-wider">
            Verified Account
          </span>
        </div>

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl text-xs font-semibold mb-6">
            {message}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs font-semibold mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar selector */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Select Profile Avatar</label>
            <div className="flex flex-wrap gap-3 items-center">
              {avatar ? (
                <img src={avatar} alt="Current" className="w-16 h-16 rounded-full object-cover border-2 border-blue-900" />
              ) : (
                <div className="w-16 h-16 bg-blue-900 text-white font-display font-bold text-2xl rounded-full flex items-center justify-center">
                  {name.charAt(0)}
                </div>
              )}

              <div className="flex gap-2">
                {avatarsList.map((avUrl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAvatar(avUrl)}
                    className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-all cursor-pointer ${
                      avatar === avUrl ? 'border-blue-900 scale-105 shadow-md' : 'border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <img src={avUrl} alt={`Av-${i}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
              <input
                type="text"
                placeholder="e.g. Vanshika Paliwal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-white border border-slate-200 text-xs rounded-xl px-4 py-2.5 focus:outline-hidden focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-medium"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="tel"
                  placeholder="Indian mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full pl-11 pr-4 py-2.5 text-xs border border-slate-200 bg-slate-50 text-slate-500 rounded-xl font-medium cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Security Level</label>
              <div className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-4 py-2.5 font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-4.5 h-4.5 text-green-600" />
                Two-Factor Authentication Active
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-900 hover:bg-blue-800 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {loading ? 'Saving Profile...' : 'Save Profile Changes'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
