import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../lib/api';
import { Station, Train } from '../types';
import { Search, MapPin, Calendar, Users, Star, Sparkles, Bot, ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [stations, setStations] = useState<Station[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);

  // Search form states
  const [sourceInput, setSourceInput] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [destInput, setDestInput] = useState('');
  const [destCode, setDestCode] = useState('');
  const [journeyDate, setJourneyDate] = useState('');
  const [classPreference, setClassPreference] = useState('3A');
  const [quota, setQuota] = useState('General');

  // Auto-suggestion overlay states
  const [showSourceSuggestions, setShowSourceSuggestions] = useState(false);
  const [showDestSuggestions, setShowDestSuggestions] = useState(false);

  // NLP Search State
  const [nlpQuery, setNlpQuery] = useState('');
  const [nlpLoading, setNlpLoading] = useState(false);
  const [nlpError, setNlpError] = useState('');

  // Initial fetch of station codes
  useEffect(() => {
    apiService.getStations()
      .then(res => {
        setStations(res);
        setLoadingStations(false);
      })
      .catch(err => {
        console.error("Could not fetch stations list:", err);
        setLoadingStations(false);
      });

    // Default journey date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setJourneyDate(tomorrow.toISOString().split('T')[0]);
  }, []);

  const getFilteredStations = (input: string) => {
    if (!input) return [];
    const lower = input.toLowerCase();
    return stations.filter(s =>
      s.code.toLowerCase().includes(lower) ||
      s.name.toLowerCase().includes(lower) ||
      s.city.toLowerCase().includes(lower)
    ).slice(0, 5);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceCode || !destCode) {
      alert("Please select stations from the auto-suggest dropdown options.");
      return;
    }
    // Navigate to Search Result page
    navigate(`/search?source=${sourceCode}&destination=${destCode}&date=${journeyDate}&class=${classPreference}&quota=${quota}`);
  };

  const handleNLPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlpQuery.trim()) return;

    setNlpLoading(true);
    setNlpError('');

    try {
      const res = await apiService.getNLPRecommendations(nlpQuery);
      if (res.success && res.parsed.source && res.parsed.destination) {
        // Automatically navigate to search result page using parsed parameters!
        navigate(`/search?source=${res.parsed.source}&destination=${res.parsed.destination}&date=${res.parsed.date}&class=${res.parsed.classPreference || '3A'}&quota=General&nlpQuery=${encodeURIComponent(nlpQuery)}`);
      } else {
        setNlpError(res.message || "We could not extract structured station targets. Try being more specific, e.g., 'Delhi to Mumbai central tomorrow'.");
      }
    } catch (err) {
      console.error(err);
      setNlpError("Unable to reach AI parsing service. Try the standard structured station search box above!");
    } finally {
      setNlpLoading(false);
    }
  };

  return (
    <div className="space-y-12 pb-16" id="home-view">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 text-white py-16 px-6 sm:px-12 rounded-3xl overflow-hidden mt-6 mx-4 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-red-600/10 via-transparent to-transparent opacity-80 pointer-events-none"></div>
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="max-w-3xl relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full text-xs font-semibold tracking-wide border border-white/20 text-amber-400">
            <Sparkles className="w-3.5 h-3.5" />
            RailGo Premium Booking Simulator
          </div>

          <h1 className="font-display font-bold text-4xl sm:text-5xl leading-tight tracking-tight">
            Seamless travel planning with <span className="text-amber-400">AI-Powered</span> RailGo.
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl">
            Search 50+ trains across 100+ stations. Explore live seat availability, dynamic berth configurations (Lower berth priority), automated waiting lists, and immediate ticket PDFs.
          </p>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/15 max-w-md">
            <div>
              <span className="block font-mono text-xl sm:text-2xl font-bold text-amber-400">100+</span>
              <span className="block text-slate-400 text-[10px] uppercase font-semibold tracking-wider">Stations Connected</span>
            </div>
            <div>
              <span className="block font-mono text-xl sm:text-2xl font-bold text-amber-400">50+</span>
              <span className="block text-slate-400 text-[10px] uppercase font-semibold tracking-wider">Active Trains</span>
            </div>
            <div>
              <span className="block font-mono text-xl sm:text-2xl font-bold text-amber-400">99.8%</span>
              <span className="block text-slate-400 text-[10px] uppercase font-semibold tracking-wider">Booking Success</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Reservation Search Form Box */}
      <div className="max-w-6xl mx-auto px-4 -mt-16 relative z-20">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
            <Search className="w-5 h-5 text-blue-900" />
            <h2 className="font-display font-bold text-lg text-slate-900">Book Train Tickets</h2>
          </div>

          <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {/* Source */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">From (Source)</label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="e.g. New Delhi"
                  value={sourceInput}
                  onChange={(e) => {
                    setSourceInput(e.target.value);
                    setSourceCode(''); // Reset code until matched
                    setShowSourceSuggestions(true);
                  }}
                  onFocus={() => setShowSourceSuggestions(true)}
                  className="w-full pl-11 pr-4 py-3 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-medium"
                />
              </div>

              {/* Suggestions dropdown */}
              <AnimatePresence>
                {showSourceSuggestions && sourceInput && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto"
                  >
                    {getFilteredStations(sourceInput).map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => {
                          setSourceInput(`${s.name} (${s.code})`);
                          setSourceCode(s.code);
                          setShowSourceSuggestions(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-xs transition-colors flex justify-between items-center cursor-pointer"
                      >
                        <span className="font-semibold text-slate-800">{s.name}</span>
                        <span className="text-[10px] font-mono bg-blue-50 text-blue-900 px-2 py-0.5 rounded-sm font-bold">{s.code}</span>
                      </button>
                    ))}
                    {getFilteredStations(sourceInput).length === 0 && (
                      <div className="p-3 text-[11px] text-slate-400 text-center">No matching stations found</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Destination */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">To (Destination)</label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="e.g. Mumbai"
                  value={destInput}
                  onChange={(e) => {
                    setDestInput(e.target.value);
                    setDestCode('');
                    setShowDestSuggestions(true);
                  }}
                  onFocus={() => setShowDestSuggestions(true)}
                  className="w-full pl-11 pr-4 py-3 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-medium"
                />
              </div>

              {/* Suggestions dropdown */}
              <AnimatePresence>
                {showDestSuggestions && destInput && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto"
                  >
                    {getFilteredStations(destInput).map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => {
                          setDestInput(`${s.name} (${s.code})`);
                          setDestCode(s.code);
                          setShowDestSuggestions(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-xs transition-colors flex justify-between items-center cursor-pointer"
                      >
                        <span className="font-semibold text-slate-800">{s.name}</span>
                        <span className="text-[10px] font-mono bg-blue-50 text-blue-900 px-2 py-0.5 rounded-sm font-bold">{s.code}</span>
                      </button>
                    ))}
                    {getFilteredStations(destInput).length === 0 && (
                      <div className="p-3 text-[11px] text-slate-400 text-center">No matching stations found</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Journey Date */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date of Journey</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="date"
                  value={journeyDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setJourneyDate(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-medium"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-end">
              <button
                type="submit"
                disabled={!sourceCode || !destCode || !journeyDate}
                className="w-full bg-blue-900 text-white py-3 rounded-xl hover:bg-blue-800 disabled:opacity-50 font-semibold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer h-10.5"
              >
                Search Trains
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Quick Class / Quota preference filters */}
          <div className="flex flex-wrap gap-4 mt-5 pt-5 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-400">Class:</span>
              <select
                value={classPreference}
                onChange={(e) => setClassPreference(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-hidden focus:border-blue-900"
              >
                <option value="1A">AC 1st Class (1A)</option>
                <option value="2A">AC 2-Tier (2A)</option>
                <option value="3A">AC 3-Tier (3A)</option>
                <option value="SL">Sleeper Class (SL)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-400">Quota:</span>
              <select
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-hidden focus:border-blue-900"
              >
                <option value="General">General Quota</option>
                <option value="Ladies">Ladies Quota</option>
                <option value="Tatkal">Tatkal Booking</option>
                <option value="Senior Citizen">Senior Citizen (Lower Berth Guarantee)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* AI Smart Search Feature (Natural Language Search) */}
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-md">
          <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-48 h-48 bg-amber-400/10 rounded-full blur-2xl"></div>
          
          <div className="flex items-center gap-2.5 mb-3">
            <div className="bg-amber-100 text-amber-900 p-2 rounded-xl">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-wider text-amber-800 uppercase font-bold block">Exclusive Feature</span>
              <h3 className="font-display font-bold text-base text-slate-900">AI-Powered Natural Language Search</h3>
            </div>
          </div>

          <p className="text-xs text-slate-600 mb-5 leading-relaxed max-w-2xl">
            Type your travel plan normally, and our Gemini AI will parse it into a direct train route match. Try typing: <span className="font-mono text-blue-900 bg-white/60 px-1.5 py-0.5 rounded-md border border-slate-200">"Search fast trains from Mumbai central to Jaipur next Thursday"</span>.
          </p>

          <form onSubmit={handleNLPSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Where do you want to travel, and when?"
              value={nlpQuery}
              onChange={(e) => setNlpQuery(e.target.value)}
              disabled={nlpLoading}
              className="flex-1 bg-white border border-slate-200 text-xs rounded-xl px-4 py-3 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={nlpLoading || !nlpQuery.trim()}
              className="bg-blue-900 text-white px-5 rounded-xl text-xs font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {nlpLoading ? 'AI Parsing...' : 'Search with AI'}
              <Bot className="w-4 h-4" />
            </button>
          </form>

          {nlpError && (
            <div className="mt-3.5 text-xs text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">
              {nlpError}
            </div>
          )}
        </div>
      </div>

      {/* Grid of features */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h3 className="font-display font-bold text-center text-xl text-slate-900 mb-8">
          Crafting a modern, bulletproof reservation portal
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 bg-blue-50 text-blue-900 rounded-lg flex items-center justify-center font-bold mb-4">
              1
            </div>
            <h4 className="font-display font-bold text-sm text-slate-900 mb-2">Automated Berth Allocations</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              We prioritize lower berths for senior citizens automatically. Dynamic seating cycles partition coaches from AC1, AC2, to Sleeper carriages seamlessly.
            </p>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 bg-red-50 text-red-900 rounded-lg flex items-center justify-center font-bold mb-4">
              2
            </div>
            <h4 className="font-display font-bold text-sm text-slate-900 mb-2">Real-time Cancellation & Promotion</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Instantly cancel tickets to claim refunds automatically. Cancelling tickets promotes Waiting List (WL) or RAC passengers on-the-fly.
            </p>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 bg-amber-50 text-amber-900 rounded-lg flex items-center justify-center font-bold mb-4">
              3
            </div>
            <h4 className="font-display font-bold text-sm text-slate-900 mb-2">Beautiful PDF Ticket Generation</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Download clean digital tickets with valid QR codes, transaction records, berth assignments, and active route segment details on-demand.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
