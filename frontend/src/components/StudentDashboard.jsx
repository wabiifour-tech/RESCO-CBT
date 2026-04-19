import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import { LogOut, BookOpen, Clock, Trophy, ChevronRight, AlertCircle, CheckCircle, XCircle, ArrowLeft, Timer } from 'lucide-react';

export default function StudentDashboard() {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('exams');
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [examDetail, setExamDetail] = useState(null);
  const [takingExam, setTakingExam] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [examResult, setExamResult] = useState(null);

  const fetchExams = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/exams/available');
      setExams(data.exams || []);
    } catch { toast.error('Failed to fetch exams'); }
    finally { setLoading(false); }
  }, []);

  const fetchResults = useCallback(async () => {
    try {
      const { data } = await api.get('/results/student');
      setResults(data.results || []);
    } catch { toast.error('Failed to fetch results'); }
  }, []);

  useEffect(() => { fetchExams(); fetchResults(); }, [fetchExams, fetchResults]);

  // Timer
  useEffect(() => {
    if (!takingExam || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timer); handleSubmit(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [takingExam, timeLeft]);

  const formatTimer = (s) => {
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
    return `${h > 0 ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const startExam = async (examId) => {
    try {
      const { data } = await api.get(`/exams/${examId}/questions`);
      setExamDetail(data.exam);
      setQuestions(data.questions);
      setAnswers({});
      setTimeLeft(data.exam.duration * 60);
      setTakingExam(true);
      setExamResult(null);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to load exam'); }
  };

  const handleSubmit = async (auto = false) => {
    if (submitting) return;
    if (!auto && !window.confirm('Are you sure you want to submit?')) return;
    setSubmitting(true);
    try {
      const startTime = Date.now() - (examDetail.duration * 60 * 1000 - timeLeft * 1000);
      const timeSpent = Math.round((Date.now() - startTime) / 1000);
      const formattedAnswers = questions.map(q => ({ questionId: q.id, selected: answers[q.id] || null }));
      const { data } = await api.post('/results/submit', { examId: examDetail.id, answers: formattedAnswers, timeSpent });
      setExamResult(data.result);
      toast.success(data.result.passed ? 'Congratulations! You passed!' : 'Exam submitted. Better luck next time!');
      fetchResults();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to submit'); }
    finally { setSubmitting(false); }
  };

  const exitExam = () => { setTakingExam(false); setExamDetail(null); setExamResult(null); fetchExams(); };

  // === EXAM TAKING VIEW ===
  if (takingExam && !examResult) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header with Timer */}
        <div className={`sticky top-0 z-10 px-4 py-3 shadow-md ${timeLeft < 60 ? 'bg-red-600' : 'bg-primary-700'}`}>
          <div className="max-w-5xl mx-auto flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <button onClick={exitExam} className="hover:bg-white/10 p-1 rounded"><ArrowLeft className="w-5 h-5" /></button>
              <div><h2 className="font-bold text-lg">{examDetail?.title}</h2><p className="text-xs opacity-80">{examDetail?.subject} | {examDetail?.type}</p></div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm">{Object.values(answers).filter(Boolean).length}/{questions.length} answered</span>
              <div className="flex items-center gap-2 bg-white/20 rounded-lg px-4 py-2">
                <Timer className="w-5 h-5" />
                <span className="text-xl font-mono font-bold">{formatTimer(timeLeft)}</span>
              </div>
              <button onClick={() => handleSubmit()} disabled={submitting} className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg font-medium flex items-center gap-2">
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="max-w-5xl mx-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Question Nav */}
            <div className="lg:col-span-1">
              <div className="card sticky top-20">
                <h3 className="font-semibold text-gray-700 mb-3">Questions</h3>
                <div className="grid grid-cols-5 lg:grid-cols-4 gap-2">
                  {questions.map((q, i) => (
                    <a key={q.id} href={`#q-${i}`}
                      className={`w-full aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
                        answers[q.id] ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {i + 1}
                    </a>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-3 h-3 bg-primary-600 rounded" /> Answered
                  <div className="w-3 h-3 bg-gray-100 rounded ml-2" /> Unanswered
                </div>
              </div>
            </div>

            {/* Question Content */}
            <div className="lg:col-span-3 space-y-4">
              {questions.map((q, i) => (
                <div key={q.id} id={`q-${i}`} className="card scroll-mt-24">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="bg-primary-100 text-primary-700 text-sm font-bold px-3 py-1 rounded-full">{i + 1}</span>
                    <div>
                      <p className="text-gray-800 font-medium">{q.question}</p>
                      <p className="text-sm text-gray-400 mt-1">{q.marks} mark{q.marks > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 ml-10">
                    {q.options.map((opt) => (
                      <button key={opt.key} onClick={() => setAnswers({ ...answers, [q.id]: opt.key })}
                        className={`p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
                          answers[q.id] === opt.key
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}>
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                          answers[q.id] === opt.key ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {opt.key}
                        </span>
                        <span>{opt.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={() => handleSubmit()} disabled={submitting}
                className="w-full btn-success py-3 text-lg flex items-center justify-center gap-2">
                {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Submit Exam'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === RESULT VIEW ===
  if (takingExam && examResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card max-w-lg w-full text-center">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${examResult.passed ? 'bg-green-100' : 'bg-red-100'}`}>
            {examResult.passed ? <CheckCircle className="w-10 h-10 text-green-600" /> : <XCircle className="w-10 h-10 text-red-600" />}
          </div>
          <h2 className="text-2xl font-bold text-gray-800">{examResult.passed ? 'Passed!' : 'Not Passed'}</h2>
          <p className="text-gray-500 mt-1">{examDetail?.title}</p>
          <div className="grid grid-cols-3 gap-4 my-6">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-primary-600">{examResult.score}</p>
              <p className="text-xs text-gray-500">Score</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-primary-600">{examResult.percentage}%</p>
              <p className="text-xs text-gray-500">Percentage</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-primary-600">{examResult.totalMarks}</p>
              <p className="text-xs text-gray-500">Total Marks</p>
            </div>
          </div>

          {examResult.showDetails === false && (
            <p className="text-sm text-yellow-600 bg-yellow-50 p-3 rounded-lg mb-4">
              {examResult.message || 'Detailed answers will be available after the exam closes.'}
            </p>
          )}

          {examResult.answers && (
            <div className="text-left space-y-3 max-h-64 overflow-y-auto mb-4">
              {examResult.answers.map((a, i) => (
                <div key={i} className={`p-3 rounded-lg text-sm ${a.correct ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <p className="font-medium">{i + 1}. {a.question}</p>
                  <div className="flex gap-4 mt-1 text-xs">
                    <span>Your answer: <b>{a.selected || 'None'}</b></span>
                    <span>Correct: <b>{a.correctAnswer}</b></span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={exitExam} className="btn-primary px-8">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  // === MAIN DASHBOARD ===
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Nav */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800">RESCO CBT</h1>
              <p className="text-xs text-gray-500">Student Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Welcome, <b>{user?.firstName}</b></span>
            <button onClick={() => { logout(); window.location.href = '/'; }} className="text-gray-400 hover:text-red-500"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="card flex items-center gap-4"><div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center"><BookOpen className="w-6 h-6 text-blue-600" /></div><div><p className="text-2xl font-bold">{exams.filter(e => e.isOpen && !e.hasTaken).length}</p><p className="text-sm text-gray-500">Available Exams</p></div></div>
          <div className="card flex items-center gap-4"><div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center"><Trophy className="w-6 h-6 text-green-600" /></div><div><p className="text-2xl font-bold">{results.filter(r => r.percentage >= 50).length}</p><p className="text-sm text-gray-500">Exams Passed</p></div></div>
          <div className="card flex items-center gap-4"><div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center"><Clock className="w-6 h-6 text-purple-600" /></div><div><p className="text-2xl font-bold">{results.length}</p><p className="text-sm text-gray-500">Total Attempts</p></div></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {['exams', 'results'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${activeTab === tab ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
              {tab === 'exams' ? 'Available Exams' : 'My Results'}
            </button>
          ))}
        </div>

        {activeTab === 'exams' && (
          loading ? <div className="text-center py-12 text-gray-400">Loading exams...</div> :
          exams.length === 0 ? <div className="card text-center py-12"><AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No exams available right now.</p></div> :
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exams.map(exam => (
              <div key={exam.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <span className={`badge ${exam.isOpen ? 'badge-green' : 'badge-gray'}`}>{exam.isOpen ? 'Open' : 'Closed'}</span>
                  <span className={`badge ${exam.type === 'EXAM' ? 'badge-red' : 'badge-blue'}`}>{exam.type}</span>
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">{exam.title}</h3>
                <p className="text-sm text-gray-500 mb-3">{exam.assignment?.subject} | {exam.assignment?.className}</p>
                <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{exam.duration} min</span>
                  <span>{exam._count?.questions || 0} questions</span>
                  <span>{exam.totalMarks} marks</span>
                </div>
                {exam.hasTaken ? (
                  <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                    <CheckCircle className="w-4 h-4" /> Completed
                  </div>
                ) : exam.isOpen ? (
                  <button onClick={() => startExam(exam.id)} className="w-full btn-primary flex items-center justify-center gap-2">
                    Start Exam <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                    <Clock className="w-4 h-4" /> Not yet available
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'results' && (
          results.length === 0 ? <div className="card text-center py-12"><Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No results yet. Take an exam!</p></div> :
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50"><tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Exam</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Subject</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Score</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Percentage</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Date</th>
              </tr></thead>
              <tbody className="divide-y">
                {results.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{r.exam?.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.exam?.assignment?.subject}</td>
                    <td className="px-4 py-3 text-sm text-center text-gray-800">{r.score}/{r.totalMarks}</td>
                    <td className="px-4 py-3 text-sm text-center font-medium">{r.percentage}%</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge ${r.percentage >= 50 ? 'badge-green' : 'badge-red'}`}>{r.percentage >= 50 ? 'Passed' : 'Failed'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{new Date(r.submittedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
