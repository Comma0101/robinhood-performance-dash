'use client';

import { useState, useEffect, useRef } from 'react';
import {
  createCoachSession,
  sendMessage,
  getCoachSessions,
  getCoachSession,
  deleteCoachSession,
  type CoachSession,
  type Message,
  type ContextMetaEntry,
} from '@/lib/api/coach';
import MorningReportCard from '@/components/MorningReportCard';
import {
  Plus,
  Trash2,
  MessageSquare,
  Bot,
  Calendar,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Clock,
  Send,
  X
} from 'lucide-react';

type Phase = 'pre_market' | 'kill_zone' | 'post_market' | 'general';

const PHASE_COLORS = {
  pre_market: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  kill_zone: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  post_market: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  general: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const PHASE_LABELS = {
  pre_market: 'Pre-Market',
  kill_zone: 'Kill Zone',
  post_market: 'Post-Market',
  general: 'General',
};

export default function AICoachPage() {
  const [currentSession, setCurrentSession] = useState<CoachSession | null>(null);
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [newSessionDate, setNewSessionDate] = useState(
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  );
  const [showReport, setShowReport] = useState(true);
  const [contextMeta, setContextMeta] = useState<ContextMetaEntry[] | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load sessions on mount and restore last opened session
  useEffect(() => {
    loadSessions();
  }, []);

  // Update messages when session changes
  useEffect(() => {
    if (currentSession) {
      setMessages(currentSession.messages);
    }
  }, [currentSession]);

  const loadSessions = async () => {
    try {
      const loadedSessions = await getCoachSessions();
      setSessions(loadedSessions);
      const lastId = typeof window !== 'undefined'
        ? window.localStorage.getItem('coach:lastSessionId')
        : null;
      if (lastId) {
        try {
          const s = await getCoachSession(lastId);
          setCurrentSession(s);
          setMessages(s.messages);
          setContextMeta(null);
          return;
        } catch (e) {
          // fall through to select most recent
        }
      }
      if (loadedSessions.length > 0) {
        // Auto-select most recent session
        setCurrentSession(loadedSessions[0]);
        setMessages(loadedSessions[0].messages);
        setContextMeta(null);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('coach:lastSessionId', loadedSessions[0].session_id);
        }
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    try {
      const full = await getCoachSession(sessionId);
      setCurrentSession(full);
      setMessages(full.messages);
      setContextMeta(null);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('coach:lastSessionId', sessionId);
      }
    } catch (err) {
      console.error('Failed to load session', err);
    }
  };

  const handleCreateSession = async () => {
    try {
      setLoading(true);
      setError(null);

      const session = await createCoachSession({
        related_date: newSessionDate,
      });

      setCurrentSession(session);
      setSessions([session, ...sessions]);
      setShowNewSessionForm(false);
      setMessages([]);
      setContextMeta(null);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('coach:lastSessionId', session.session_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation(); // Prevent session selection when clicking delete
    if (!confirm('Are you sure you want to delete this session?')) return;

    try {
      await deleteCoachSession(sessionId);

      // Remove from list
      const updatedSessions = sessions.filter(s => s.session_id !== sessionId);
      setSessions(updatedSessions);

      // If deleted session was active, clear it or select another
      if (currentSession?.session_id === sessionId) {
        if (updatedSessions.length > 0) {
          handleSelectSession(updatedSessions[0].session_id);
        } else {
          setCurrentSession(null);
          setMessages([]);
          setContextMeta(null);
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem('coach:lastSessionId');
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
      alert('Failed to delete session');
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !currentSession || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages([...messages, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await sendMessage(currentSession.session_id, input);

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.response,
        timestamp: response.timestamp,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setContextMeta(response.context_meta ?? null);
      // Reflect messages in the active session and sidebar list
      setCurrentSession((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, userMessage, assistantMessage] }
          : prev
      );
      setSessions((prev) =>
        prev.map((s) =>
          s.session_id === currentSession.session_id
            ? { ...s, messages: [...s.messages, userMessage, assistantMessage] }
            : s
        )
      );
      // Persist last session id for reload continuity
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('coach:lastSessionId', currentSession.session_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove the user message if failed
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-[calc(100vh-10rem)] bg-[#0B0D10] text-[#E7ECEF] overflow-hidden">
      {/* Sidebar - Session List */}
      <div className="w-80 bg-black/20 backdrop-blur-xl border-r border-white/5 flex flex-col">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Bot className="w-6 h-6 text-blue-400" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">AI Coach</h1>
          </div>

          <button
            onClick={() => setShowNewSessionForm(true)}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 flex items-center justify-center gap-2 group"
          >
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            New Session
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 mb-2">Recent Sessions</div>
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => handleSelectSession(session.session_id)}
              className={`w-full text-left p-4 rounded-xl transition-all group relative cursor-pointer border ${currentSession?.session_id === session.session_id
                ? 'bg-white/10 border-white/10 shadow-lg'
                : 'border-transparent hover:bg-white/5 hover:border-white/5'
                }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium border ${PHASE_COLORS[session.phase]}`}
                  >
                    {PHASE_LABELS[session.phase]}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(e, session.session_id)}
                  className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-red-500/10 rounded"
                  title="Delete Session"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <Calendar className="w-3 h-3" />
                {new Date(session.started_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}
                <span className="text-gray-600">•</span>
                <Clock className="w-3 h-3" />
                {new Date(session.started_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <MessageSquare className="w-3 h-3" />
                {session.messages.length} messages
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-[#0B0D10] to-[#111316]">
        {/* Header */}
        {currentSession && (
          <div className="px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-md flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${PHASE_COLORS[currentSession.phase]}`}
                  >
                    {PHASE_LABELS[currentSession.phase]}
                  </span>
                  <span className="text-gray-400 text-sm font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {currentSession.related_date || 'No date set'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1 font-mono">
                  ID: {currentSession.session_id}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentSession && contextMeta && contextMeta.length > 0 && (
          <div className="border-b border-white/5 bg-black/10 flex-shrink-0">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-blue-400">
                  <Sparkles className="w-4 h-4" />
                  Context Diagnostics
                </h3>
                <button
                  onClick={() => setContextMeta(null)}
                  className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              </div>
              <div className="space-y-3">
                {contextMeta.map((meta, idx) => (
                  <div
                    key={`${meta.name}-${idx}`}
                    className="bg-black/20 rounded-lg p-3 border border-white/5"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-200">{meta.name}</span>
                      <span className="text-gray-500 text-xs">
                        {new Date(meta.generatedAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Source: {meta.source}
                    </div>
                    <pre className="mt-2 text-[10px] bg-black/40 rounded p-2 overflow-x-auto whitespace-pre-wrap text-gray-400 font-mono border border-white/5">
                      {JSON.stringify(meta.metadata, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Morning Report Section (shown only for pre_market phase) */}
        {currentSession && currentSession.phase === 'pre_market' && (
          <div className="border-b border-white/5 bg-black/10 flex-shrink-0">
            <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors group" onClick={() => setShowReport(!showReport)}>
              <h3 className="font-semibold text-sm flex items-center gap-2 text-gray-200">
                <Bot className="w-4 h-4 text-purple-400" />
                Morning Report
              </h3>
              <button className="text-gray-500 group-hover:text-white transition-colors">
                {showReport ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
            {showReport && (
              <div className="max-h-96 overflow-y-auto custom-scrollbar p-4 bg-black/20">
                <MorningReportCard date={currentSession.related_date || undefined} />
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 min-h-0">
          {!currentSession ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Bot className="w-10 h-10 text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Welcome to AI Coach</h2>
                <p className="text-gray-400">
                  Select a session from the sidebar or start a new one to begin analyzing your trading performance.
                </p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-blue-400" />
                </div>
                <p className="text-lg font-medium text-white">
                  Start chatting with your AI trading coach
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  The coach has access to your pre-market reports, trades, and
                  performance data to provide personalized insights.
                </p>
              </div>
            </div>
          ) : (
            messages.map((message, idx) => (
              <div
                key={idx}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
              >
                <div
                  className={`max-w-3xl rounded-2xl p-5 shadow-lg ${message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-[#1A1D21] border border-white/5 text-gray-200 rounded-bl-none'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-2 opacity-70">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      {message.role === 'user' ? 'You' : 'Coach'}
                    </span>
                    <span className="text-[10px]">
                      {new Date(message.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#1A1D21] border border-white/5 rounded-2xl rounded-bl-none p-5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="flex justify-center">
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 max-w-2xl flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-full">
                  <X className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-medium text-sm">Error</div>
                  <div className="text-xs opacity-80">{error}</div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        {currentSession && (
          <div className="p-6 border-t border-white/5 bg-black/20 backdrop-blur-md">
            <div className="flex gap-3 max-w-5xl mx-auto">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask your trading coach anything..."
                className="flex-1 bg-white/5 text-white rounded-xl p-4 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-white/5 placeholder:text-gray-600 custom-scrollbar"
                rows={1}
                disabled={loading}
                style={{ minHeight: '60px' }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || loading}
                className="px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 flex items-center justify-center"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <div className="text-center text-[10px] text-gray-600 mt-3 font-medium uppercase tracking-wider">
              Press Enter to send, Shift+Enter for new line
            </div>
          </div>
        )}
      </div>

      {/* New Session Modal */}
      {showNewSessionForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1D21] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <Plus className="w-6 h-6 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Start New Session</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Session Date</label>
                <input
                  type="date"
                  value={newSessionDate}
                  onChange={(e) => setNewSessionDate(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 text-white rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setShowNewSessionForm(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 px-4 py-3 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSession}
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-4 py-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
                >
                  {loading ? 'Creating...' : 'Start Session'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
