import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import LiveClock from './LiveClock';
import DailyDevotional from './DailyDevotional';
import {
  LogOut, BookOpen, Plus, Upload, Eye, Edit3, Trash2, Download, ChevronDown, ChevronUp,
  X, Users, BarChart3, CheckCircle, Clock, FileText, AlertCircle, Sparkles, Trophy, Target,
  ChevronLeft, ChevronRight, GraduationCap, Award, Star, ClipboardList, TrendingUp
} from 'lucide-react';

const SUBJECT_ICONS = ['📘', '🧮', '🧪', '🌍', '📝', '🎨', '🎵', '💻', '🔬', '📐'];

function getSubjectIcon(index) {
  return SUBJECT_ICONS[index % SUBJECT_ICONS.length];
}

function getSubjectColor(index) {
  const colors = [
    'from-blue-500 to-blue-600',
    'from-green-500 to-emerald-600',
    'from-purple-500 to-purple-600',
    'from-orange-500 to-orange-600',
    'from-pink-500 to-pink-600',
    'from-teal-500 to-teal-600',
    'from-indigo-500 to-indigo-600',
    'from-red-500 to-red-600',
  ];
  return colors[index % colors.length];
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function TeacherDashboard() {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState({ total: 0, published: 0, draft: 0 });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showAddQuestions, setShowAddQuestions] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [examResults, setExamResults] = useState(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    title: '', description: '', type: 'TEST', duration: 30, totalMarks: 50, passMark: 25,
    startDate: '', endDate: '', resultVisibility: 'MANUAL', subject: '', className: 'JSS1'
  });
  const [questionForm, setQuestionForm] = useState(
    Array.from({ length: 5 }, function () {
      return { question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 };
    })
  );
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadExamId, setUploadExamId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const examsRes = await api.get('/exams/teacher');
      const examList = examsRes.data.exams || [];
      setExams(examList);
      setStats({
        total: examList.length,
        published: examList.filter(e => e.status === 'PUBLISHED').length,
        draft: examList.filter(e => e.status === 'DRAFT').length,
      });
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchResults = useCallback(async () => {
    try {
      const { data } = await api.get('/results/teacher');
      setResults(data.results || []);
    } catch {
      toast.error('Failed to load results');
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchResults();
  }, [fetchData, fetchResults]);

  const handleCreateExam = async (e) => {
    e.preventDefault();
    try {
      await api.post('/exams', createForm);
      toast.success('Exam created successfully!');
      setShowCreate(false);
      setCreateForm({
        title: '', description: '', type: 'TEST', duration: 30, totalMarks: 50, passMark: 25,
        startDate: '', endDate: '', resultVisibility: 'MANUAL', subject: '', className: 'JSS1'
      });
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to create exam';
      console.error('Create exam error:', err.response?.data || err.message);
      toast.error(msg, { duration: 6000 });
    }
  };

  const handlePublishExam = async (id) => {
    try {
      await api.patch(`/exams/${id}/publish`);
      toast.success('Exam published!');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to publish');
    }
  };

  const handleAddQuestions = async (e) => {
    e.preventDefault();
    try {
      await api.post('/questions/manual', {
        examId: selectedExam?.id,
        questions: questionForm.filter(q => q.question),
      });
      toast.success(`${questionForm.filter(q => q.question).length} questions added!`);
      setShowAddQuestions(false);
      setSelectedExam(null);
      setQuestionForm(
        Array.from({ length: 5 }, function () {
          return { question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 };
        })
      );
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add questions');
    }
  };

  const handleCSVUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error('Select a CSV file');
      return;
    }
    if (!uploadExamId) {
      toast.error('Select an exam first');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('examId', String(uploadExamId));
      const res = await api.post('/questions/upload', formData, { timeout: 120000 });
      const data = res.data;
      if (data.success && data.data) {
        toast.success(`${data.data.created}/${data.data.total} questions uploaded`);
        if (data.data.errors && data.data.errors.length > 0) {
          toast.error(`${data.data.errors.length} row(s) had errors`);
        }
      } else {
        toast.success('Questions uploaded!');
      }
      setShowUpload(false);
      setUploadFile(null);
      fetchData();
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Upload failed. Check file format and try again.';
      toast.error(errMsg);
    }
  };

  const handleExport = async (examId, format = 'csv') => {
    try {
      const res = await api.get('/results/export/' + examId + '?format=' + format, { responseType: 'blob' });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'exam_results_' + examId + '.' + format;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Export downloaded!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Export failed');
    }
  };

  const viewExamResults = async (examId) => {
    try {
      const { data } = await api.get(`/results/teacher/${examId}/details`);
      setExamResults(data);
      setActiveTab('result-detail');
    } catch {
      toast.error('Failed to load exam results');
    }
  };

  // Prepare recent results (latest 6)
  const recentResults = [...results]
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .slice(0, 6);

  // ========================
  // RESULT DETAIL VIEW
  // ========================
  if (activeTab === 'result-detail' && examResults) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="resco-watermark">
          <img src="/resco-logo.png" alt="" />
        </div>
        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .anim-fade-in { animation: fadeInUp 0.6s ease-out both; }
          .card-enter { animation: fadeInUp 0.5s ease-out both; }
        `}</style>

        {/* Header */}
        <header className="bg-white shadow-sm border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-gray-800">RESCO CBT</h1>
                <p className="text-xs text-gray-500">Teacher Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <LiveClock compact />
              <span className="text-sm text-gray-600">Hello, <b>{user?.teacher?.firstName || user?.email}</b></span>
              <button onClick={() => { logout(); window.location.href = '/'; }} className="text-gray-400 hover:text-red-500">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto p-4 sm:p-6">
          {/* Back Button */}
          <button
            onClick={() => { setActiveTab('dashboard'); setExamResults(null); }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 anim-fade-in group"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Dashboard
          </button>

          {/* Exam Title */}
          <div className="anim-fade-in mb-6">
            <h2 className="text-2xl font-extrabold text-gray-800 flex items-center gap-3">
              <BarChart3 className="w-7 h-7 text-indigo-500" />
              {examResults.exam?.title || 'Exam Results'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {examResults.exam?.subject} | {examResults.exam?.className} | {examResults.exam?.type}
            </p>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="anim-fade-in" style={{ animationDelay: '0.1s' }}>
              <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{examResults.summary?.totalStudents}</p>
                    <p className="text-xs text-gray-500 font-medium">Students</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="anim-fade-in" style={{ animationDelay: '0.15s' }}>
              <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-purple-200">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{examResults.summary?.average}%</p>
                    <p className="text-xs text-gray-500 font-medium">Average</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="anim-fade-in" style={{ animationDelay: '0.2s' }}>
              <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-green-200">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{examResults.summary?.passRate}%</p>
                    <p className="text-xs text-gray-500 font-medium">Pass Rate</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="anim-fade-in" style={{ animationDelay: '0.25s' }}>
              <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-md shadow-amber-200">
                    <ClipboardList className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{examResults.questionStats?.length}</p>
                    <p className="text-xs text-gray-500 font-medium">Questions</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Student Rankings & Question Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="anim-fade-in" style={{ animationDelay: '0.3s' }}>
              <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-indigo-100">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    Student Rankings
                  </h3>
                </div>
                <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                  {examResults.results?.map((r, i) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={
                          'w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center ' +
                          (i === 0 ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-md' :
                           i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white shadow-md' :
                           i === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-400 text-white shadow-md' :
                           'bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700')
                        }>
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {r.student?.firstName} {r.student?.lastName}
                          </p>
                          <p className="text-xs text-gray-400">{r.student?.admissionNo}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-sm text-gray-800">{r.percentage}%</span>
                        <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                          <div
                            className={'h-1.5 rounded-full ' + (r.percentage >= 50 ? 'bg-green-500' : 'bg-red-400')}
                            style={{ width: Math.min(r.percentage, 100) + '%' }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!examResults.results || examResults.results.length === 0) && (
                    <p className="text-center text-gray-400 py-8">No results yet</p>
                  )}
                </div>
              </div>
            </div>

            <div className="anim-fade-in" style={{ animationDelay: '0.35s' }}>
              <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b border-green-100">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Target className="w-5 h-5 text-green-500" />
                    Question Analysis
                  </h3>
                </div>
                <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                  {examResults.questionStats?.map(qs => (
                    <div key={qs.questionId} className="p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-sm text-gray-700 truncate flex-1 mr-3 font-medium">
                          <span className="text-gray-400 mr-1">Q{qs.questionId}.</span>
                          {qs.question}
                        </p>
                        <span className={'text-xs font-bold px-2 py-0.5 rounded-full ' + (qs.correctRate >= 70 ? 'bg-green-100 text-green-700' : qs.correctRate >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700')}>
                          {qs.correctRate}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className={'h-2.5 rounded-full transition-all duration-500 ' + (qs.correctRate >= 70 ? 'bg-green-500' : qs.correctRate >= 40 ? 'bg-yellow-500' : 'bg-red-500')}
                          style={{ width: qs.correctRate + '%' }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">
                        {qs.correctCount}/{qs.totalAttempts} students answered correctly
                      </p>
                    </div>
                  ))}
                  {(!examResults.questionStats || examResults.questionStats.length === 0) && (
                    <p className="text-center text-gray-400 py-8">No question data available</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ========================
  // MAIN DASHBOARD VIEW
  // ========================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      {/* School Logo Watermark */}
      <div className="resco-watermark">
        <img src="/resco-logo.png" alt="" />
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .anim-fade-in { animation: fadeInUp 0.6s ease-out both; }
        .anim-float { animation: float 3s ease-in-out infinite; }
        .anim-gradient { background-size: 200% 200%; animation: gradientMove 4s ease infinite; }
        .card-enter { animation: fadeInUp 0.5s ease-out both; }
      `}</style>

      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800">RESCO CBT</h1>
              <p className="text-xs text-gray-500">Teacher Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LiveClock compact />
            <span className="text-sm text-gray-600 hidden sm:inline">
              {getGreeting()}, <b>{user?.teacher?.firstName || user?.email}</b>
            </span>
            <button onClick={() => { logout(); window.location.href = '/'; }} className="text-gray-400 hover:text-red-500 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 pb-12">

        {/* ===================== SECTION 1: Quick Stats Row ===================== */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="anim-fade-in" style={{ animationDelay: '0.05s' }}>
            <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                  <FileText className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-3xl font-extrabold text-gray-800">{stats.total}</p>
                  <p className="text-sm text-gray-500 font-medium">Total Exams</p>
                </div>
              </div>
            </div>
          </div>
          <div className="anim-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-200">
                  <CheckCircle className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-3xl font-extrabold text-green-600">{stats.published}</p>
                  <p className="text-sm text-gray-500 font-medium">Published</p>
                </div>
              </div>
            </div>
          </div>
          <div className="anim-fade-in" style={{ animationDelay: '0.15s' }}>
            <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-200">
                  <Edit3 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-3xl font-extrabold text-amber-600">{stats.draft}</p>
                  <p className="text-sm text-gray-500 font-medium">Drafts</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===================== SECTION 2: Quick Actions Bar ===================== */}
        <div className="anim-fade-in mb-6" style={{ animationDelay: '0.2s' }}>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 transform hover:scale-[1.03] hover:shadow-lg shadow-indigo-200"
            >
              <Plus className="w-5 h-5" />
              New Exam
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 transform hover:scale-[1.03] hover:shadow-lg shadow-green-200"
            >
              <Upload className="w-5 h-5" />
              Upload Questions
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className="flex items-center gap-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 transform hover:scale-[1.03] hover:shadow-lg shadow-blue-200"
            >
              <Eye className="w-5 h-5" />
              View Results
            </button>
          </div>
        </div>

        {/* ===================== SECTION 3: Daily Devotional ===================== */}
        <div className="anim-fade-in mb-6" style={{ animationDelay: '0.25s' }}>
          <DailyDevotional />
        </div>

        {/* ===================== SECTION 4: My Exams ===================== */}
        <div className="anim-fade-in mb-8" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-extrabold text-gray-800 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              My Exams
            </h3>
            <span className="text-sm text-gray-400 font-medium">{exams.length} total</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="flex items-center gap-3 text-gray-400">
                <div className="w-6 h-6 border-3 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                <span className="font-medium">Loading exams...</span>
              </div>
            </div>
          ) : exams.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-12 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-10 h-10 text-gray-300" />
              </div>
              <p className="text-gray-500 font-semibold text-lg mb-1">No exams yet</p>
              <p className="text-gray-400 text-sm mb-4">Create your first exam to get started!</p>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-2.5 px-5 rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md"
              >
                <Plus className="w-4 h-4" /> Create Exam
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {exams.map((exam, idx) => {
                const colorIdx = idx % 8;
                const gradientColor = getSubjectColor(colorIdx);
                const subjectIcon = getSubjectIcon(colorIdx);
                const qCount = exam._count?.questions || 0;

                return (
                  <div
                    key={exam.id}
                    className="card-enter bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group"
                    style={{ animationDelay: (idx * 0.06) + 's' }}
                  >
                    {/* Card Header Gradient Strip */}
                    <div className={'bg-gradient-to-r ' + gradientColor + ' px-5 py-4'}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white">
                          <span className="text-xl">{subjectIcon}</span>
                          <span className="text-sm font-bold text-white/90 uppercase tracking-wide">
                            {exam.subject || exam.type}
                          </span>
                        </div>
                        <span className={
                          'text-xs font-bold px-3 py-1 rounded-full ' +
                          (exam.status === 'PUBLISHED'
                            ? 'bg-white/25 text-white border border-white/30'
                            : 'bg-yellow-400/90 text-yellow-900 border border-yellow-300')
                        }>
                          {exam.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                        </span>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-5">
                      <h4 className="font-bold text-gray-800 text-lg mb-1 group-hover:text-indigo-600 transition-colors leading-snug">
                        {exam.title}
                      </h4>
                      <p className="text-sm text-gray-400 mb-3">
                        {exam.className} | {exam.type} | {exam.description ? (exam.description.length > 50 ? exam.description.slice(0, 50) + '...' : exam.description) : 'No description'}
                      </p>

                      {/* Info Pills */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-100">
                          <ClipboardList className="w-3 h-3" /> {qCount} Qs
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg border border-purple-100">
                          <Clock className="w-3 h-3" /> {exam.duration}min
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg border border-amber-100">
                          <Target className="w-3 h-3" /> {exam.totalMarks} marks
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2">
                        {exam.status === 'DRAFT' && (
                          <>
                            <button
                              onClick={() => { setSelectedExam(exam); setShowAddQuestions(true); }}
                              className="flex items-center gap-1.5 text-xs font-semibold bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-3 py-2 rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-sm hover:shadow-md"
                            >
                              <Plus className="w-3.5 h-3.5" /> Questions
                            </button>
                            <button
                              onClick={() => handlePublishExam(exam.id)}
                              className="flex items-center gap-1.5 text-xs font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white px-3 py-2 rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-sm hover:shadow-md"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Publish
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => viewExamResults(exam.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-3 py-2 rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all shadow-sm hover:shadow-md"
                        >
                          <BarChart3 className="w-3.5 h-3.5" /> Results
                        </button>
                        <button
                          onClick={() => handleExport(exam.id, 'csv')}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-gray-100 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-200 transition-all"
                        >
                          <Download className="w-3.5 h-3.5" /> Export
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===================== SECTION 5: Recent Results ===================== */}
        {recentResults.length > 0 && (
          <div className="anim-fade-in mb-8" style={{ animationDelay: '0.35s' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-extrabold text-gray-800 flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                Recent Results
              </h3>
              <button
                onClick={() => setActiveTab('results')}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 group"
              >
                View All <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {recentResults.map((r, idx) => {
                const passed = r.passed;
                const pct = r.percentage || 0;

                return (
                  <div
                    key={r.id}
                    className="card-enter bg-white rounded-2xl shadow-md border border-gray-100 p-4 hover:shadow-lg transition-all duration-300"
                    style={{ animationDelay: (idx * 0.06) + 's' }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={
                          'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ' +
                          (passed ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-md shadow-green-200' : 'bg-gradient-to-br from-red-400 to-rose-500 text-white shadow-md shadow-red-200')
                        }>
                          {passed ? <Trophy className="w-5 h-5" /> : <X className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">
                            {r.student?.firstName} {r.student?.lastName}
                          </p>
                          <p className="text-xs text-gray-400">{r.student?.admissionNo}</p>
                        </div>
                      </div>
                      <span className={
                        'text-xs font-bold px-2.5 py-1 rounded-full ' +
                        (passed ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')
                      }>
                        {passed ? 'Passed' : 'Failed'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-3 font-medium">{r.exam?.title}</p>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-800">{r.score}/{r.totalMarks}</span>
                      <span className={'text-sm font-extrabold ' + (passed ? 'text-green-600' : 'text-red-600')}>{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2">
                      <div
                        className={
                          'h-2.5 rounded-full transition-all duration-500 ' +
                          (pct >= 50 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-red-400 to-rose-500')
                        }
                        style={{ width: Math.min(pct, 100) + '%' }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">{new Date(r.submittedAt).toLocaleDateString()}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================== SECTION 6: Motivational Footer ===================== */}
        <div className="anim-fade-in text-center pt-4 pb-4" style={{ animationDelay: '0.4s' }}>
          <div className="inline-flex items-center gap-2 bg-white rounded-full px-6 py-3 shadow-sm border border-gray-100">
            <Star className="w-5 h-5 text-yellow-400" />
            <span className="text-sm text-gray-500 font-medium">
              Empowering minds, shaping futures — one exam at a time. 🌟
            </span>
            <GraduationCap className="w-5 h-5 text-indigo-400" />
          </div>
        </div>

        {/* ===================== ALL RESULTS TABLE VIEW ===================== */}
        {activeTab === 'results' && (
          <div className="anim-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-extrabold text-gray-800 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-500" />
                All Results
              </h3>
              <button
                onClick={() => setActiveTab('dashboard')}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1 group"
              >
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                Back to Dashboard
              </button>
            </div>
            {results.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-12 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="w-10 h-10 text-gray-300" />
                </div>
                <p className="text-gray-500 font-semibold text-lg mb-1">No results yet</p>
                <p className="text-gray-400 text-sm">Results will appear here once students take exams.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-500">Student</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-500">Exam</th>
                        <th className="text-center px-4 py-3 text-sm font-semibold text-gray-500">Score</th>
                        <th className="text-center px-4 py-3 text-sm font-semibold text-gray-500">Percentage</th>
                        <th className="text-right px-4 py-3 text-sm font-semibold text-gray-500">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {results.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-800">{r.student?.firstName} {r.student?.lastName}</p>
                            <p className="text-xs text-gray-400">{r.student?.admissionNo}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 font-medium">{r.exam?.title}</td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className="font-bold text-gray-800">{r.score}</span>
                            <span className="text-gray-400">/{r.totalMarks}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={"inline-block px-3 py-1 rounded-full text-xs font-bold " + (r.percentage >= 50 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
                              {r.percentage}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-500">{new Date(r.submittedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ===================== MODALS ===================== */}

      {/* CREATE EXAM MODAL */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto relative">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Create New Exam</h2>
                </div>
                <button onClick={() => setShowCreate(false)} className="text-white/70 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateExam} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Subject *</label>
                  <input
                    type="text"
                    value={createForm.subject}
                    onChange={e => setCreateForm({ ...createForm, subject: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    required
                    placeholder="e.g. Mathematics"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Class *</label>
                  <select
                    value={createForm.className}
                    onChange={e => setCreateForm({ ...createForm, className: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="JSS1">JSS1</option>
                    <option value="JSS2">JSS2</option>
                    <option value="JSS3">JSS3</option>
                    <option value="SSS1">SSS1</option>
                    <option value="SSS2">SSS2</option>
                    <option value="SSS3">SSS3</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Title *</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={e => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Type</label>
                  <select
                    value={createForm.type}
                    onChange={e => setCreateForm({ ...createForm, type: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="TEST">Test</option>
                    <option value="EXAM">Exam</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Duration (min) *</label>
                  <input
                    type="number"
                    value={createForm.duration}
                    onChange={e => setCreateForm({ ...createForm, duration: parseInt(e.target.value) })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    min="5"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Total Marks *</label>
                  <input
                    type="number"
                    value={createForm.totalMarks}
                    onChange={e => setCreateForm({ ...createForm, totalMarks: parseInt(e.target.value) })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    min="1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Pass Mark *</label>
                  <input
                    type="number"
                    value={createForm.passMark}
                    onChange={e => setCreateForm({ ...createForm, passMark: parseInt(e.target.value) })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    min="1"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Date</label>
                  <input
                    type="datetime-local"
                    value={createForm.startDate}
                    onChange={e => setCreateForm({ ...createForm, startDate: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Date</label>
                  <input
                    type="datetime-local"
                    value={createForm.endDate}
                    onChange={e => setCreateForm({ ...createForm, endDate: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Result Visibility</label>
                <select
                  value={createForm.resultVisibility}
                  onChange={e => setCreateForm({ ...createForm, resultVisibility: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all bg-white"
                >
                  <option value="MANUAL">Manual (Teacher releases)</option>
                  <option value="IMMEDIATE">Immediate</option>
                  <option value="AFTER_CLOSE">After Exam Closes</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-3.5 rounded-xl transition-all duration-300 transform hover:scale-[1.01] hover:shadow-lg shadow-indigo-200 mt-2"
              >
                Create Exam
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ADD QUESTIONS MODAL — Table-based Inline Editor */}
      {showAddQuestions && selectedExam && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[96vw] w-[96vw] max-h-[92vh] overflow-y-auto relative">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-5 rounded-t-2xl sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Add Questions</h2>
                    <p className="text-white/80 text-sm">Exam: {selectedExam.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAddQuestions(false);
                    setQuestionForm(
                      Array.from({ length: 5 }, function () {
                        return { question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 };
                      })
                    );
                  }}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-center text-xs font-bold text-gray-500 w-10 border-b-2 border-gray-200">#</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 border-b-2 border-gray-200 min-w-[180px]">Question</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 border-b-2 border-gray-200 min-w-[100px]">Option A</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 border-b-2 border-gray-200 min-w-[100px]">Option B</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 border-b-2 border-gray-200 min-w-[100px]">Option C</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 border-b-2 border-gray-200 min-w-[100px]">Option D</th>
                      <th className="px-2 py-2 text-center text-xs font-bold text-gray-500 border-b-2 border-gray-200 w-[80px]">Answer</th>
                      <th className="px-2 py-2 text-center text-xs font-bold text-gray-500 border-b-2 border-gray-200 w-[60px]">Marks</th>
                      <th className="px-2 py-2 text-center text-xs font-bold text-gray-500 border-b-2 border-gray-200 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {questionForm.map((q, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-2 py-1 text-center text-gray-500 font-semibold text-xs">{i + 1}</td>
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            value={q.question}
                            onChange={e => {
                              const updated = [...questionForm];
                              updated[i] = { ...updated[i], question: e.target.value };
                              setQuestionForm(updated);
                            }}
                            className="input-field text-xs !py-1.5"
                            placeholder="Type question..."
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            value={q.optionA}
                            onChange={e => {
                              const updated = [...questionForm];
                              updated[i] = { ...updated[i], optionA: e.target.value };
                              setQuestionForm(updated);
                            }}
                            className="input-field text-xs !py-1.5"
                            placeholder="A"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            value={q.optionB}
                            onChange={e => {
                              const updated = [...questionForm];
                              updated[i] = { ...updated[i], optionB: e.target.value };
                              setQuestionForm(updated);
                            }}
                            className="input-field text-xs !py-1.5"
                            placeholder="B"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            value={q.optionC}
                            onChange={e => {
                              const updated = [...questionForm];
                              updated[i] = { ...updated[i], optionC: e.target.value };
                              setQuestionForm(updated);
                            }}
                            className="input-field text-xs !py-1.5"
                            placeholder="C"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            value={q.optionD}
                            onChange={e => {
                              const updated = [...questionForm];
                              updated[i] = { ...updated[i], optionD: e.target.value };
                              setQuestionForm(updated);
                            }}
                            className="input-field text-xs !py-1.5"
                            placeholder="D"
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <select
                            value={q.answer}
                            onChange={e => {
                              const updated = [...questionForm];
                              updated[i] = { ...updated[i], answer: e.target.value };
                              setQuestionForm(updated);
                            }}
                            className="input-field text-xs !py-1 text-center w-16"
                          >
                            <option>A</option><option>B</option><option>C</option><option>D</option>
                          </select>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <input
                            type="number"
                            min="1"
                            value={q.marks}
                            onChange={e => {
                              const updated = [...questionForm];
                              updated[i] = { ...updated[i], marks: parseInt(e.target.value) || 1 };
                              setQuestionForm(updated);
                            }}
                            className="input-field text-xs !py-1.5 text-center w-14"
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => setQuestionForm(questionForm.filter((_, j) => j !== i))}
                            className="text-red-400 hover:text-red-600 p-1 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setQuestionForm([...questionForm, { question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 }])}
                  className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-2.5 px-5 rounded-xl transition-all shadow-sm hover:shadow-md"
                >
                  <Plus className="w-4 h-4" /> Add Row
                </button>
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); handleAddQuestions(e); }}
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md"
                >
                  Save All ({questionForm.filter(q => q.question).length} questions)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV UPLOAD MODAL */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full relative">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Upload className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Upload Questions (CSV)</h2>
                </div>
                <button onClick={() => setShowUpload(false)} className="text-white/70 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleCSVUpload} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Select Exam</label>
                <select
                  value={uploadExamId}
                  onChange={e => setUploadExamId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all bg-white"
                  required
                >
                  <option value="">Select draft exam...</option>
                  {exams.filter(e => e.status === 'DRAFT').map(e => (
                    <option key={e.id} value={e.id}>{e.title}</option>
                  ))}
                </select>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-green-400 transition-colors">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <input type="file" accept=".csv" onChange={e => setUploadFile(e.target.files[0])} className="hidden" id="csv-upload" />
                <label htmlFor="csv-upload" className="cursor-pointer text-green-600 hover:text-green-700 text-sm font-semibold">
                  {uploadFile ? uploadFile.name : 'Click to select CSV file'}
                </label>
                <p className="text-xs text-gray-400 mt-1">CSV format: question, optionA, optionB, optionC, optionD, answer, marks</p>
              </div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-3.5 rounded-xl transition-all duration-300 transform hover:scale-[1.01] hover:shadow-lg shadow-indigo-200"
              >
                Upload
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
