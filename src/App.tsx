/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  AlertCircle, 
  FileText,
  Loader2,
  CheckCircle2,
  Home,
  Zap,
  Box,
  Sparkles,
  Search,
  Book,
  Video,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Type definitions
interface Topic {
  name: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  youtubeQuery: string;
  explanation?: string;
}

interface AnalysisResult {
  summary: { subject: string; explanation: string; };
  insights: { area: string; confidence: number; description: string; }[];
  topics: Topic[];
  sources: { title: string; url: string }[];
}

interface ScheduleData {
  title: string;
  days: { date: string; topics: Topic[]; }[];
}

// 🛡️ Safe AI client loader
const getAIClient = (manualKey?: string) => {
  // We check 3 places for the key
  const key = (manualKey || import.meta.env.VITE_GEMINI_API_KEY || "").trim();

  // If the key is too short or missing, we return null to avoid SDK crashes
  if (!key || key.length < 5 || key === 'undefined') {
    return null;
  }

  try {
    return new GoogleGenAI(key);
  } catch (err) {
    console.error("AI Init Error:", err);
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
  
  // Manual Key Override
  const [manualKey, setManualKey] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [examDate, setExamDate] = useState('');

  const perform3PhaseAnalysis = async (imgData: string) => {
    const ai = getAIClient(manualKey);
    if (!ai) {
      setError("AI OFFLINE: Environment variables not detected. Use Manual Override.");
      setShowOverride(true);
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysisPhase('summarizing');

    try {
      const base64Data = imgData.split(',')[1];
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Analyze this syllabus image and return structured JSON." },
              { inlineData: { mimeType: "image/jpeg", data: base64Data } },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.OBJECT, properties: { subject: { type: Type.STRING }, explanation: { type: Type.STRING } } },
              insights: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { area: { type: Type.STRING }, confidence: { type: Type.NUMBER }, description: { type: Type.STRING } } } },
              topics: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, difficulty: { type: Type.STRING }, youtubeQuery: { type: Type.STRING } } } },
              sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, url: { type: Type.STRING } } } }
            }
          },
        },
      });

      setAnalysisPhase('analyzing');
      await new Promise(r => setTimeout(r, 1000));
      setAnalysisPhase('grounding');
      await new Promise(r => setTimeout(r, 800));

      setAnalysis(JSON.parse(response.text));
      setAnalysisPhase('complete');
    } catch (err) {
      setError("Analysis system failure. Please check your API key.");
      setAnalysisPhase('idle');
    } finally {
      setLoading(false);
    }
  };

  const generatePlan = async () => {
    const ai = getAIClient(manualKey);
    if (!ai || !analysis) return;
    setLoading(true);
    try {
      const prompt = `Synthesize a study protocol for ${analysis.summary.subject}.`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      setSchedule(JSON.parse(response.text));
    } catch (err) {
      setError("Protocol synthesis failed.");
    } finally {
      setLoading(false);
    }
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

  const { getRootProps, getInputProps } = useDropzone({ onDrop } as any);

  return (
    <div className="flex h-screen bg-[#05070a] text-white selection:bg-indigo-500/30 overflow-hidden font-sans">
      
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-[#080a0f] flex flex-col shrink-0">
        <div className="p-8 flex items-center gap-3">
          <Zap size={22} className="text-indigo-500 fill-indigo-500" />
          <span className="font-black text-xl tracking-tighter uppercase">SCHEDULAI</span>
        </div>
        <nav className="flex-1 px-4 py-8">
          <button className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[11px] font-black uppercase tracking-widest shadow-xl shadow-indigo-500/5">
            <Home size={16} /> Analysis Hub
          </button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col relative bg-[radial-gradient(circle_at_top,_#0a0d14_0%,_#05070a_100%)]">
        
        <header className="h-24 border-b border-white/5 flex items-center justify-between px-10 bg-black/40 backdrop-blur-xl z-20">
           <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500 mb-1">Laboratory Stage</span>
              <h2 className="text-xl font-black uppercase tracking-tighter">Research Operation</h2>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar relative">
          <div className="max-w-4xl mx-auto space-y-10">
            
            <AnimatePresence>
              {/* PHASES & UPLOAD */}
              {!image && !loading && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="py-20 flex flex-col items-center">
                  <div {...getRootProps()} className="border border-white/5 bg-white/[0.01] rounded-[48px] py-32 w-full flex flex-col items-center cursor-pointer group hover:bg-white/[0.03] hover:border-white/10 transition-all border-dashed">
                    <input {...getInputProps()} />
                    <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-8 group-hover:scale-110 transition-transform">
                       <Box size={32} />
                    </div>
                    <h3 className="text-2xl font-black uppercase tracking-[0.3em] mb-2">Upload Syllabus</h3>
                    <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">JPG, PNG, PDF payloads accepted</p>
                  </div>
                </motion.div>
              )}

              {/* MANUAL KEY OVERRIDE */}
              {showOverride && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-indigo-500/5 border border-indigo-500/20 p-10 rounded-[40px] flex flex-col gap-6 backdrop-blur-md">
                   <div>
                      <h4 className="text-indigo-400 font-black text-[10px] uppercase tracking-[0.4em] mb-2">Manual Link Protocol</h4>
                      <p className="text-zinc-500 text-xs font-medium leading-relaxed">Render environment Variables are failing to inject. Please provide your Gemini API Key directly to establish a secure neural link.</p>
                   </div>
                   <div className="flex gap-4">
                      <input 
                        type="password" 
                        placeholder="PASTE API KEY (starts with AIza)"
                        value={manualKey}
                        onChange={(e) => setManualKey(e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 rounded-2xl p-5 text-sm outline-none focus:border-indigo-500 font-mono" 
                      />
                      <button 
                        onClick={() => { setShowOverride(false); if(image) perform3PhaseAnalysis(image); }}
                        className="bg-indigo-600 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-xl shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all"
                      >
                        Activate
                      </button>
                   </div>
                </motion.div>
              )}

              {loading && (
                <div className="py-32 flex flex-col items-center gap-8">
                   <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                   <span className="text-[10px] font-black uppercase tracking-[0.6em] text-zinc-500 animate-pulse">{analysisPhase}...</span>
                </div>
              )}

              {analysis && !schedule && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                   <div className="bg-white/[0.01] border border-white/5 p-12 rounded-[48px] backdrop-blur-sm">
                      <h3 className="text-4xl font-black uppercase tracking-tighter text-white mb-6 underline decoration-indigo-500/30 underline-offset-8">{analysis.summary.subject}</h3>
                      <p className="text-zinc-400 leading-relaxed font-medium">{analysis.summary.explanation}</p>
                   </div>
                   <div className="bg-[#0a0d14] p-10 rounded-[40px] border border-indigo-500/10 flex flex-col md:flex-row gap-8 items-center justify-between">
                      <div className="flex gap-4 w-full md:w-auto">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 bg-white/5 border border-white/10 p-5 rounded-3xl outline-none focus:border-indigo-500 text-xs" />
                        <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="flex-1 bg-white/5 border border-white/10 p-5 rounded-3xl outline-none focus:border-indigo-500 text-xs" />
                      </div>
                      <button onClick={generatePlan} className="w-full md:w-auto bg-indigo-600 px-10 py-5 rounded-[32px] font-black uppercase tracking-widest text-[11px] shadow-2xl shadow-indigo-600/30">Synthesize Protocol</button>
                   </div>
                 </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>

        {error && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur-md px-10 py-5 rounded-2xl shadow-2xl flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] z-[100]">
            <AlertCircle size={18} /> {error}
          </div>
        )}

      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>
    </div>
  );
}
