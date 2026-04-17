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

// 🛡️ Bulletproof AI client loader
const getAIClient = () => {
  // Vite looks for VITE_ prefix in production browsers
  let key = import.meta.env.VITE_GEMINI_API_KEY;
  
  // Fallback for local development
  if (!key || key === "undefined") {
    key = process?.env?.GEMINI_API_KEY;
  }

  // If no key found, return null instead of letting the SDK crash the app
  if (!key || key === "undefined" || key === "") {
    console.error("SchedulAI: API Key missing from environment.");
    return null;
  }

  try {
    return new GoogleGenAI(key);
  } catch (err) {
    console.error("SchedulAI: Constructor failed.", err);
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
  
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [examDate, setExamDate] = useState('');

  const perform3PhaseAnalysis = async (imgData: string) => {
    const ai = getAIClient();
    if (!ai) {
      setError("API KEY MISSING: Go to Render Dashboard -> Environment -> Add VITE_GEMINI_API_KEY");
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
              { text: "Analyze this syllabus and return structured JSON." },
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
      setError("AI Analysis failed. Check your API key or data format.");
      setAnalysisPhase('idle');
    } finally {
      setLoading(false);
    }
  };

  const generatePlan = async () => {
    const ai = getAIClient();
    if (!ai || !analysis) return;
    setLoading(true);
    try {
      const prompt = `Synthesize a study protocol for ${analysis.summary.subject}. Start ${startDate}, end ${examDate}. JSON.`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      setSchedule(JSON.parse(response.text));
    } catch (err) {
      setError("Synthesis failed. Check date inputs.");
    } finally {
      setLoading(false);
    }
  };

  const downloadSchedule = () => {
    if (!schedule) return;
    const doc = new jsPDF() as any;
    doc.text('SCHEDULAI PROTOCOL EXPORT', 14, 20);
    const tableData = schedule.days?.flatMap(day => 
      day.topics?.map(topic => [day.date, topic.name, topic.difficulty]) || []
    ) || [];
    autoTable(doc, { body: tableData });
    doc.save(`protocol.pdf`);
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop } as any);

  return (
    <div className="flex h-screen bg-[#05070a] text-white overflow-hidden font-sans">
      <aside className="w-64 border-r border-white/5 bg-[#080a0f] flex flex-col">
        <div className="p-8 flex items-center gap-3">
          <Zap size={22} className="text-indigo-500" />
          <span className="font-black text-xl tracking-tighter uppercase">SCHEDULAI</span>
        </div>
        <nav className="flex-1 px-4 py-8">
          <button className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[11px] font-black uppercase tracking-widest">
            <Home size={16} /> Analysis Hub
          </button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col bg-[radial-gradient(circle_at_top,_#0a0d14_0%,_#05070a_100%)]">
        <header className="h-24 border-b border-white/5 flex items-center px-10 bg-black/40 backdrop-blur-xl">
           <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500">Laboratory Stage</span>
              <h2 className="text-xl font-black uppercase tracking-tighter">Research Operation</h2>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 relative custom-scrollbar">
          <div className="max-w-4xl mx-auto">
            {!analysis && !loading && (
              <div {...getRootProps()} className="border border-white/5 bg-white/[0.01] rounded-[48px] py-32 flex flex-col items-center cursor-pointer group hover:bg-white/[0.03] transition-all">
                <input {...getInputProps()} />
                <Box size={48} className="text-indigo-500 mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-2xl font-black uppercase tracking-widest mb-2">Upload Syllabus</h3>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Select Payload (JPG/PNG)</p>
              </div>
            )}

            {loading && (
               <div className="flex flex-col items-center py-32 gap-6">
                  <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-500 animate-pulse">{analysisPhase}...</span>
               </div>
            )}

            {analysis && !schedule && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                 <div className="bg-white/[0.01] border border-white/5 p-10 rounded-[40px]">
                    <h3 className="text-3xl font-black uppercase tracking-tighter mb-4 text-white">{analysis.summary?.subject}</h3>
                    <p className="text-zinc-500 leading-relaxed">{analysis.summary?.explanation}</p>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {analysis.insights.map((ins, i) => (
                       <div key={i} className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                          <div className="flex justify-between items-center mb-2">
                             <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{ins.area}</span>
                             <span className="text-[10px] font-black text-indigo-500">{Math.round(ins.confidence * 100)}%</span>
                          </div>
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                             <div className="h-full bg-indigo-500" style={{ width: `${ins.confidence * 100}%` }} />
                          </div>
                       </div>
                    ))}
                 </div>

                 <div className="bg-[#0a0d14] p-10 rounded-[40px] border border-indigo-500/10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex gap-4 w-full md:w-auto">
                       <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 bg-white/5 border border-white/10 p-4 rounded-2xl text-xs outline-none focus:border-indigo-500" />
                       <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="flex-1 bg-white/5 border border-white/10 p-4 rounded-2xl text-xs outline-none focus:border-indigo-500" />
                    </div>
                    <button onClick={generatePlan} className="w-full md:w-auto bg-indigo-600 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:scale-105 transition-all shadow-xl shadow-indigo-600/20">Synthesize Plan</button>
                 </div>
              </motion.div>
            )}

            {schedule && (
              <div className="space-y-10 pb-20">
                 <div className="flex justify-between items-center border-b border-white/5 pb-10">
                    <h2 className="text-4xl font-black uppercase tracking-tighter">Your Protocol</h2>
                    <div className="flex gap-4">
                       <button onClick={downloadSchedule} className="bg-indigo-600 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-indigo-600/20"><Download size={14} /> PDF</button>
                       <button onClick={() => { setAnalysis(null); setSchedule(null); setImage(null); }} className="px-6 py-3 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500">RESET</button>
                    </div>
                 </div>
                 <div className="space-y-6">
                    {schedule.days?.map((day, i) => (
                       <div key={i} className="p-8 bg-white/[0.01] border border-white/5 rounded-[32px]">
                          <h4 className="text-indigo-400 font-bold uppercase tracking-widest text-xs mb-6 border-b border-white/5 pb-4">{day.date}</h4>
                          <div className="grid gap-3">
                             {day.topics?.map((t, ti) => (
                                <div key={ti} className="flex justify-between items-center p-5 bg-white/[0.02] border border-white/5 rounded-2xl group hover:bg-white/[0.05] transition-all">
                                   <div className="flex items-center gap-4">
                                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500 text-xs font-black">{ti + 1}</div>
                                      <span className="text-sm font-bold uppercase tracking-widest text-zinc-200">{t.name}</span>
                                   </div>
                                   <div className="flex gap-3">
                                      <a href={`https://youtube.com/results?search_query=${t.youtubeQuery}`} target="_blank" className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><Video size={20} /></a>
                                      <button className="p-2 text-zinc-500 hover:text-white"><FileText size={20} /></button>
                                   </div>
                                </div>
                             ))}
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur-md px-10 py-5 rounded-2xl shadow-2xl flex items-center gap-4 text-[10px] font-black uppercase tracking-widest z-[200]">
            <AlertCircle size={18} /> {error}
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        input::-webkit-calendar-picker-indicator { filter: invert(1); opacity: 0.5; }
      `}</style>
    </div>
  );
}
