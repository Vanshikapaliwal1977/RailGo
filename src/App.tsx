import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Navbar } from './components/Navbar';
import { AIAssistant } from './components/AIAssistant';

// Pages
import { Home } from './pages/Home';
import { Auth } from './pages/Auth';
import { SearchTrains } from './pages/SearchTrains';
import { Dashboard } from './pages/Dashboard';
import { Profile } from './pages/Profile';
import { Admin } from './pages/Admin';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans" id="app-root">
          <Navbar />
          
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Auth />} />
              <Route path="/register" element={<Auth />} />
              <Route path="/search" element={<SearchTrains />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          {/* Floating Gemini-Powered Assistant */}
          <AIAssistant />
          
          {/* Humble Human-Centered Footer */}
          <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-xs text-slate-400">
            <div className="max-w-7xl mx-auto px-4">
              <p className="font-medium">© 2026 RailGo. Independent Railway Reservation Simulator.</p>
              <p className="mt-1 text-[10px]">For portfolio and educational purposes. No official railway affiliation.</p>
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
