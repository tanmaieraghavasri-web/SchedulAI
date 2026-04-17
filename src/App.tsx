/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Upload, 
  Youtube, 
  AlertCircle, 
  FileText,
  Loader2,
  Trash2,
  CheckCircle2,
  Home,
  Zap,
  Box,
  Trash,
  Sparkles,
  BarChart3,
  Search,
  Book,
  Video,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Internal Components

// Type definitions
interface Topic {
  name: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  youtubeQuery: string;
  explanation?: string;
}

interface AnalysisResult {
  summary: {
    subject: string;
    explanation: string;
  };
  insights: {
    area: string;
    confidence: number;
    description: string;
  }[];
  topics: Topic[];
  sources: { title: string; url: string }[];
}

interface ScheduleData {
  title: string;
  days: {
    date: string;
    topics: Topic[];
  }[];
}

const getAIClient = () => {
  // Vite injects these at build time
  // Try standard Vite env first, then custom defined process.env as fallback
  const key = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.VITE_GEMINI_API_KEY : '');

  if (!key || key === 'undefined' || key === '""') {
    console.error("SchedulAI: VITE_GEMINI_API_KEY not found in environment.");
    return null;
  }

  try {
    return new GoogleGenAI(key);
  } catch (err) {
    console.error("SchedulAI: GoogleGenAI error:", err);
    return null;
  }
};

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'summarizing' | 'analyzing' | 'grounding' | 'complete'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  
  // Form State
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [examDate, setExamDate] = useState('');

  const perform3PhaseAnalysis = async (imgData: string) => {
    const ai = getAIClient();
    if (!ai) {
      setError("API KEY MISSING: Please set VITE_GEMINI_API_KEY in Render environment variables.");
      return;
    }
    setLoading(true);
    setError(null);
    setAnalysisPhase('summarizing');

    try {
      const base64Data = imgData.split(',')[1];
      
      // Phase 1 & 2: Summary + Insights
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: `Perform a 3-Phase Analysis on this syllabus/document.
                1. Summary: Identify the subject and provide a high-level explanation.
                2. Insights: Identify 5 key learning areas and assign confidence scores (0-1).
                3. Topics: Extract structured study topics with difficulty levels and YouTube queries.
                
                Also suggest 3 relevant academic source titles with mock URLs.
                Return result as JSON.`,
              },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.OBJECT,
                properties: {
                  subject: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ["subject", "explanation"]
              },
              insights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    area: { type: Type.STRING },
                    confidence: { type: Type.NUMBER },
                    description: { type: Type.STRING }
                  }
                }
              },
              topics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
                    youtubeQuery: { type: Type.STRING },
                    explanation: { type: Type.STRING }
                  }
                }
              },
              sources: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    url: { type: Type.STRING }
                  }
                }
              }
            },
            required: ["summary", "insights", "topics"]
          },
        },
      });

      setAnalysisPhase('analyzing');
      // Artificial delay for futuristic effect
      await new Promise(r => setTimeout(r, 1000));
      setAnalysisPhase('grounding');
      await new Promise(r => setTimeout(r, 800));

      const data = JSON.parse(response.text);
      setAnalysis(data);
      setAnalysisPhase('complete');
    } catch (err) {
      console.error(err);
      setError("Analysis system failure. Payload corrupted or inaccessible.");
      setAnalysisPhase('idle');
    } finally {
      setLoading(false);
    }
  };

  const generatePlan = async () => {
    const ai = getAIClient();
    if (!ai) {
      setError("API KEY ERR: Check Environment Variables.");
      return;
    }
    if (!analysis) return;
    setLoading(true);
    try {
      const prompt = `Generate a structured study plan for: ${analysis.summary.subject}. 
      Topics: ${analysis.topics.map(t => t.name).join(', ')}.
      Study Period: From ${startDate} to ${examDate || 'TBD'}.
      Distribute the topics logically across the available days. 
      Return as JSON with days array mapping each date to its planned topics.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              days: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING },
                    topics: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          difficulty: { type: Type.STRING },
                          youtubeQuery: { type: Type.STRING }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
      setSchedule(JSON.parse(response.text));
    } catch (err) {
      console.error(err);
      setError("Protocol synthesis failed.");
    } finally {
      setLoading(false);
    }
  };

  const downloadSchedule = () => {
    if (!schedule) return;
    
    const doc = new jsPDF() as any;
    const subject = analysis?.summary.subject || 'Study Protocol';
    
    doc.setFontSize(22);
    doc.setTextColor(5, 7, 10);
    doc.text('SCHEDULAI PROTOCOL EXPORT', 14, 20);
    
    doc.setFontSize(14);
    doc.setTextColor(79, 70, 229);
    doc.text(`SUBJECT: ${subject.toUpperCase()}`, 14, 30);
    
    const tableData = schedule.days.flatMap(day => 
      day.topics.map(topic => [
        day.date,
        topic.name.toUpperCase(),
        topic.difficulty.toUpperCase()
      ])
    );

    autoTable(doc, {
      startY: 40,
      head: [['DATE', 'RESEARCH TOPIC', 'INTENSITY']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 5 },
      alternateRowStyles: { fillColor: [249, 250, 251] }
    });

    doc.save(`protocol_${subject.toLowerCase().replace(/\s+/g, '_')}.pdf`);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setImage(result);
        perform3PhaseAnalysis(result);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'application/pdf': ['.pdf'] },
    multiple: false
  } as any);

  return (
    <div className="flex h-screen bg-[#05070a] text-white font-sans overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* 1. LEFT SIDEBAR */}
      <aside className="w-64 border-r border-white/5 bg-[#080a0f] flex flex-col shrink-0">
        <div className="p-8 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.3)]">
            <Zap size={22} className="text-white fill-white" />
          </div>
          <span className="font-black text-xl tracking-tighter uppercase">SCHEDULAI</span>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-3">
          <button 
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_30px_rgba(79,70,229,0.1)]"
          >
            <Home size={16} /> Analysis Hub
          </button>
        </nav>

        <div className="p-8 border-t border-white/5 bg-black/20">
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-black uppercase text-zinc-600 tracking-[0.3em]">Neural Link</span>
              <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> Established
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. CENTER STAGE */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[radial-gradient(circle_at_top,_#0a0d14_0%,_#05070a_100%)]">
        
        {/* Top Header */}
        <header className="h-24 border-b border-white/5 flex items-center justify-between px-10 bg-black/40 backdrop-blur-xl z-20">
          <div className="flex items-center gap-10">
            <div className="flex flex-col">
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500/80 mb-1">Laboratory Stage</h2>
              <p className="text-xl font-black uppercase tracking-tighter">Research Operation</p>
            </div>
          </div>
          
          <div className="flex items-center gap-5">
            {/* Action Group removed as per user request */}
          </div>
        </header>

        {/* Dynamic Canvas */}
        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar relative">
          <div className="max-w-4xl mx-auto space-y-10">
            
            <AnimatePresence mode="wait">
              {/* PHASES & UPLOAD */}
              {!image && (
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-20"
                >
                  <div 
                    {...getRootProps()}
                    className={`group relative w-full aspect-[16/9] border border-white/5 bg-white/[0.01] rounded-[48px] overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-all duration-700 ${
                      isDragActive ? 'bg-indigo-500/[0.03] border-indigo-500/30 shadow-[0_0_100px_rgba(79,70,229,0.1)]' : 'hover:bg-white/[0.03] hover:border-white/10'
                    }`}
                  >
                    <input {...getInputProps()} />
                    
                    <div className="w-24 h-24 rounded-3xl bg-[#080a0f] border border-white/5 flex items-center justify-center mb-8 shadow-2xl group-hover:scale-110 transition-transform">
                      <Box size={32} className="text-indigo-500" />
                    </div>
                    
                    <h3 className="text-2xl font-black uppercase tracking-[0.4em] mb-4 text-white">Select Payload</h3>
                    <p className="text-zinc-600 text-xs font-bold uppercase tracking-[0.2em] text-center mb-12 max-w-xs leading-relaxed">
                      Syllabus, Timetables, or Research Documents (PDF/JPG)
                    </p>
                    
                    <div className="flex gap-4">
                      <div className="px-6 py-3 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-widest shadow-xl">
                        Browse Files
                      </div>
                    </div>

                    {/* Futuristic Grid Overlay */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:40px_40px]" />
                  </div>
                </motion.div>
              )}

              {/* LOADING PHASE ANIMATION */}
              {loading && analysisPhase !== 'idle' && analysisPhase !== 'complete' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-32 flex flex-col items-center gap-10"
                >
                  <div className="relative w-24 h-24">
                    <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
                    <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin" />
                    <Zap size={32} className="absolute inset-0 m-auto text-indigo-500 animate-pulse" />
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.8em] text-zinc-500 animate-pulse">
                      {analysisPhase} Protocol
                    </span>
                    <div className="flex gap-1.5">
                      {['summarizing', 'analyzing', 'grounding'].map((p) => (
                        <div key={p} className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${analysisPhase === p ? 'bg-indigo-500 scale-150' : 'bg-white/10'}`} />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ANALYSIS RESULTS */}
              {analysis && analysisPhase === 'complete' && !schedule && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-8"
                >
                  {/* PHASE 1: SUMMARY */}
                  <section className="bg-white/[0.01] border border-white/5 rounded-[40px] p-10 space-y-8 relative overflow-hidden">
                    <div className="flex items-center gap-4 text-indigo-500 mb-2">
                       <Sparkles size={18} />
                       <span className="text-[10px] font-black uppercase tracking-[0.4em]">Phase 1: Intelligence Summary</span>
                    </div>
                    <div className="max-w-2xl">
                      <h3 className="text-4xl font-black tracking-tighter mb-4 text-white uppercase">{analysis.summary.subject}</h3>
                      <p className="text-zinc-500 text-[15px] leading-relaxed font-medium">{analysis.summary.explanation}</p>
                    </div>
                  </section>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* PHASE 2: INSIGHTS */}
                    <section className="bg-white/[0.01] border border-white/5 rounded-[40px] p-10 space-y-6">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 border-b border-white/5 pb-6 flex items-center gap-3">
                        <BarChart3 size={14} className="text-purple-500" /> Phase 2: Confidence Insights
                      </h4>
                      <div className="space-y-6">
                        {analysis.insights.map((ins, i) => (
                          <div key={i} className="space-y-3">
                            <div className="flex justify-between items-end">
                              <span className="text-[11px] font-bold uppercase tracking-widest text-white">{ins.area}</span>
                              <span className="text-[10px] font-black text-indigo-500 tracking-widest">{Math.round(ins.confidence * 100)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${ins.confidence * 100}%` }}
                                className="h-full bg-gradient-to-r from-indigo-600 to-purple-600" 
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* PHASE 3: GROUNDING */}
                    <section className="bg-white/[0.01] border border-white/5 rounded-[40px] p-10 space-y-6">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 border-b border-white/5 pb-6 flex items-center gap-3">
                        <Search size={14} className="text-indigo-500" /> Phase 3: Research Grounding
                      </h4>
                      <div className="space-y-4">
                        {analysis.sources.map((src, i) => (
                          <div key={i} className="flex gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group cursor-pointer">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                               <Book size={18} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[12px] font-bold text-white truncate mb-1">{src.title}</p>
                              <span className="text-[9px] text-zinc-600 font-black uppercase tracking-widest group-hover:text-indigo-400 transition-colors">Grounded Resource</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  {/* CONFIG PANEL */}
                  <div className="bg-[#0a0d14] border border-indigo-500/10 rounded-[40px] p-10 shadow-2xl flex flex-col md:flex-row gap-10 items-center">
                    <div className="flex-1 space-y-6 w-full">
                       <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-indigo-500">Configure Study Protocol</h4>
                       <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-zinc-600 mb-2 block tracking-widest">Start Date</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-bold outline-none focus:border-indigo-500" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-zinc-600 mb-2 block tracking-widest">End Date</label>
                            <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-bold outline-none focus:border-indigo-500" />
                          </div>
                       </div>
                    </div>
                    <button 
                      onClick={generatePlan}
                      className="w-full md:w-auto px-12 py-6 bg-indigo-600 text-white rounded-[32px] font-black uppercase tracking-[0.4em] text-[11px] shadow-[0_0_50px_rgba(79,70,229,0.3)] hover:scale-105 active:scale-95 transition-all"
                    >
                      Synthesize Plan
                    </button>
                  </div>
                </motion.div>
              )}

              {/* TIMELINE VIEW (SCHEDULE) */}
              {schedule && (
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-12 pb-32"
                >
                  <div className="flex justify-between items-end border-b border-white/5 pb-10">
                    <div>
                      <h2 className="text-5xl font-black tracking-tighter text-white uppercase mb-4">Protocol Schedule</h2>
                      <div className="flex gap-4">
                        <span className="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-500/10 px-4 py-2 rounded-full border border-indigo-500/20">
                           <CheckCircle2 size={12} /> Sequence Optimized
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={downloadSchedule}
                        className="px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 flex items-center gap-2 hover:scale-105 transition-all"
                      >
                        <Download size={14} /> Export Protocol
                      </button>
                      <button 
                        className="px-8 py-4 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                        onClick={() => { setSchedule(null); setAnalysis(null); setAnalysisPhase('idle'); setImage(null); }}
                      >
                        Reset Operation
                      </button>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {schedule.days.map((day, dIdx) => (
                      <div key={dIdx} className="relative pl-12 before:absolute before:left-[11px] before:top-4 before:bottom-0 before:w-px before:bg-white/5 last:before:hidden">
                        <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-[#05070a] border-2 border-indigo-500 flex items-center justify-center z-10 shadow-[0_0_15px_rgba(79,70,229,0.5)]">
                           <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        </div>
                        
                        <div className="space-y-4">
                          <h4 className="text-[12px] font-bold text-indigo-400 uppercase tracking-[0.2em]">{day.date}</h4>
                          <div className="grid gap-4">
                            {day.topics.map((t, ti) => (
                              <div key={ti} className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-white/[0.01] border border-white/5 rounded-3xl hover:bg-white/[0.03] hover:border-white/10 transition-all group overflow-hidden relative">
                                <div className="flex gap-6 items-center">
                                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-zinc-500 font-black group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-all">
                                    {ti + 1}
                                  </div>
                                  <div>
                                    <h5 className="font-black text-sm uppercase tracking-widest mb-1">{t.name}</h5>
                                    <div className="flex gap-3 items-center">
                                      <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                                        t.difficulty === 'Hard' ? 'text-red-500 bg-red-500/10' : 'text-emerald-500 bg-emerald-500/10'
                                      }`}>Lvl {t.difficulty === 'Hard' ? '5' : '2'} Research</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-3 mt-4 md:mt-0">
                                   <a 
                                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(t.youtubeQuery)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                                   >
                                      <Video size={16} />
                                   </a>
                                   <button className="p-3 bg-white/5 text-zinc-500 rounded-xl hover:text-white hover:bg-indigo-600 transition-all">
                                      <FileText size={16} />
                                   </button>
                                </div>
                                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/0 to-indigo-500/[0.05] rounded-full translate-x-1/2 -translate-y-1/2" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
          </div>
        </div>
      </main>

      {/* Global Overlays */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur-md text-white px-10 py-5 rounded-3xl shadow-2xl z-[110] flex items-center gap-4 text-xs font-black uppercase tracking-[0.2em]"
          >
            <AlertCircle size={20} /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
        input::-webkit-calendar-picker-indicator { filter: invert(1); }
      `}</style>
    </div>
  );
}

