import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, MessageSquare, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiService } from '../lib/api';

export const AIAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([
    {
      role: 'model',
      text: 'Namaste! Welcome to **RailConnect AI Assistant** 🌟.\n\nI can suggest the fastest routes, calculate fare segments, offer packing tips, and explain Indian Railway policies (like Tatkal, Refund logic, or senior berth allotment). How can I assist you with your trip today?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    "Best trains from Delhi to Mumbai",
    "What is the senior citizen berth policy?",
    "Tell me about Refund & Cancellation policy",
    "How does RAC and WL allocation work?"
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isOpen]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;
    setInput('');
    setIsLoading(true);

    const userMsg = { role: 'user' as const, text: textToSend };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // Send message to Gemini chat API
      // Exclude initial message to save context window
      const history = messages.slice(1);
      const res = await apiService.sendAIChat(textToSend, history);
      setMessages((prev) => [...prev, { role: 'model', text: res.reply }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: "I am having difficulty connecting with my central server, but our core reservation engines are fully functional! You can search for trains and book seats right away."
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Launcher Bubble */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="bg-blue-900 text-white p-4 rounded-full shadow-2xl hover:bg-blue-800 transition-all flex items-center gap-2 group cursor-pointer"
            id="ai-assistant-toggle"
          >
            <Bot className="w-6 h-6 animate-pulse" />
            <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-medium text-sm whitespace-nowrap">
              RailConnect AI Assistant
            </span>
            <div className="absolute -top-1 -right-1 bg-red-600 w-3 h-3 rounded-full border border-white"></div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-80 sm:w-96 h-[500px] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-blue-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="bg-white/15 p-2 rounded-lg">
                  <Bot className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm tracking-wide">RailConnect AI</h3>
                  <p className="text-[10px] text-slate-300 font-mono">POWERED BY GEMINI 3.5 FLASH</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50" ref={scrollRef}>
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-blue-900 text-white rounded-br-xs'
                        : 'bg-white text-slate-800 border border-slate-200 shadow-xs rounded-bl-xs'
                    }`}
                  >
                    {/* Render basic markdown bold text */}
                    <div className="whitespace-pre-line">
                      {m.text.split('**').map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 shadow-xs rounded-2xl rounded-bl-xs p-3.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-blue-900 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-blue-900 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-2 h-2 bg-blue-900 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions Panel (only show if no user inputs sent yet or very short thread) */}
            {messages.length < 3 && (
              <div className="p-3 bg-white border-t border-slate-100 flex flex-col gap-1.5">
                <span className="text-[10px] font-mono tracking-wider uppercase text-slate-400">Suggested Prompts</span>
                <div className="flex flex-wrap gap-1">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(s)}
                      className="text-[11px] bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-950 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-colors text-left cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Footer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
              className="p-3 bg-white border-t border-slate-200 flex gap-2"
            >
              <input
                type="text"
                placeholder="Ask about trains, fares, routes..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                className="flex-1 px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-blue-900 text-white p-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
