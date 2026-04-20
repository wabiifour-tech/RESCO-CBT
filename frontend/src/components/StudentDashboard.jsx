import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import LiveClock from './LiveClock';
import DailyDevotional from './DailyDevotional';
import {
  LogOut, BookOpen, Clock, Award, Star, Lightbulb,
  ChevronRight, ChevronLeft, CheckCircle, XCircle,
  Trophy, Target, Sparkles, Brain, Timer, RotateCcw, AlertTriangle, BookMarked, Monitor, ShieldCheck, Users
} from 'lucide-react';

const EXAM_TIPS = [
  "Read each question carefully before answering",
  "Manage your time wisely — don't spend too long on one question",
  "Eliminate wrong answers first to improve your chances",
  "Answer easy questions first, then come back to difficult ones",
  "Double-check your answers before submitting",
];

const EXAM_INSTRUCTIONS = [
  { icon: Monitor, title: 'Device Readiness', desc: 'Ensure your device is fully charged or plugged in. Close all other applications and browser tabs before starting the exam.' },
  { icon: ShieldCheck, title: 'Academic Integrity', desc: 'Do not open other tabs, applications, or use any unauthorized materials during the exam. All submissions are monitored.' },
  { icon: Clock, title: 'Time Management', desc: 'The exam timer starts when you begin. Keep an eye on the timer. Unanswered questions will be submitted as-is when time runs out.' },
  { icon: BookMarked, title: 'Answer Review', desc: 'You can navigate between questions freely before submitting. Use the question navigator to track your progress and review answers.' },
  { icon: AlertTriangle, title: 'Submission', desc: 'Once you click Submit, you cannot change your answers. Make sure you have reviewed all questions before submitting.' },
  { icon: Users, title: 'No Collaboration', desc: 'This is an individual assessment. Do not communicate with other students during the exam period.' },
];

const OPTION_COLORS = {
  A: { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-400', border: 'border-blue-400', fill: 'bg-blue-500' },
  B: { bg: 'bg-green-100', text: 'text-green-700', ring: 'ring-green-400', border: 'border-green-400', fill: 'bg-green-500' },
  C: { bg: 'bg-orange-100', text: 'text-orange-700', ring: 'ring-orange-400', border: 'border-orange-400', fill: 'bg-orange-500' },
  D: { bg: 'bg-purple-100', text: 'text-purple-700', ring: 'ring-purple-400', border: 'border-purple-400', fill: 'bg-purple-500' },
};

const SUBJECT_ICONS = ['📘', '🧮', '🧪', '🌍', '📝', '🎨', '🎵', '💻', '🔬', '📐'];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

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

function getSubjectLightColor(index) {
  const colors = [
    'bg-blue-50 border-blue-200',
    'bg-green-50 border-green-200',
    'bg-purple-50 border-purple-200',
    'bg-orange-50 border-orange-200',
    'bg-pink-50 border-pink-200',
    'bg-teal-50 border-teal-200',
    'bg-indigo-50 border-indigo-200',
    'bg-red-50 border-red-200',
  ];
  return colors[index % colors.length];
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  let result = '';
  if (h > 0) result = h + ':';
  result = result + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return result;
}

// Confetti particle component using pure CSS
function ConfettiParticle({ delay, left, color, size }) {
  const style = {
    position: 'fixed',
    top: '-10px',
    left: left + '%',
    width: size + 'px',
    height: size + 'px',
    backgroundColor: color,
    borderRadius: Math.random() > 0.5 ? '50%' : '2px',
    animation: 'confettiFall ' + (2 + Math.random() * 3) + 's ease-in ' + delay + 's infinite',
    zIndex: 50,
    pointerEvents: 'none',
  };
  return <div style={style} />;
}

function ConfettiEffect() {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
  const particles = [];
  for (let i = 0; i < 40; i++) {
    particles.push(
      <ConfettiParticle
        key={i}
        delay={i * 0.1}
        left={Math.random() * 100}
        color={colors[i % colors.length]}
        size={6 + Math.random() * 8}
      />
    );
  }
  return (
    <div>
      {particles}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default function StudentDashboard() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [view, setView] = useState('list');
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipIndex, setTipIndex] = useState(0);
  const [tipFade, setTipFade] = useState(true);

  // Exam taking state
  const [examDetail, setExamDetail] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [examResult, setExamResult] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const studentName = (user && user.student && (user.student.firstName || user.student.lastName))
    ? (user.student.firstName + ' ' + (user.student.lastName || '')).trim()
    : (user && user.firstName) || 'Student';

  // Fetch exams and results
  const fetchExams = useCallback(async function () {
    try {
      setLoading(true);
      const res = await api.get('/exams/available');
      setExams(res.data.exams || []);
    } catch (err) {
      toast.error('Failed to fetch exams');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResults = useCallback(async function () {
    try {
      const res = await api.get('/results/student');
      setResults(res.data.results || []);
    } catch (err) {
      toast.error('Failed to fetch results');
    }
  }, []);

  useEffect(function () {
    fetchExams();
    fetchResults();
  }, [fetchExams, fetchResults]);

  // Tip rotation
  useEffect(function () {
    const interval = setInterval(function () {
      setTipFade(false);
      setTimeout(function () {
        setTipIndex(function (prev) { return (prev + 1) % EXAM_TIPS.length; });
        setTipFade(true);
      }, 500);
    }, 5000);
    return function () { clearInterval(interval); };
  }, []);

  // Timer
  useEffect(function () {
    if (view !== 'exam' || timeLeft <= 0) return;
    timerRef.current = setInterval(function () {
      setTimeLeft(function (t) {
        if (t <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          handleSubmit(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return function () {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [view, timeLeft]);

  // Cleanup timer on unmount
  useEffect(function () {
    return function () {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startExam = async function (examId) {
    try {
      const res = await api.get('/exams/' + examId + '/questions');
      const exam = res.data.exam;
      const qs = res.data.questions;
      const examStartTime = res.data.examStartTime;

      // Shuffle options for each question
      const shuffledQuestions = qs.map(function (q) {
        const shuffled = [...q.options].sort(function () { return Math.random() - 0.5; });
        return { ...q, options: shuffled };
      });

      setExamDetail(exam);
      setQuestions(shuffledQuestions);
      setAnswers({});
      setCurrentQuestion(0);
      setTimeLeft(exam.duration * 60);
      startTimeRef.current = Date.now();
      if (examStartTime) startTimeRef.current = new Date(examStartTime).getTime();
      setExamResult(null);
      setView('exam');
    } catch (err) {
      toast.error(err.response && err.response.data && err.response.data.message ? err.response.data.message : 'Failed to load exam');
    }
  };

  const handleSubmit = async function (auto) {
    if (submitting) return;
    if (!auto) {
      setShowSubmitModal(true);
      return;
    }
    setShowSubmitModal(false);
    setSubmitting(true);

    try {
      const elapsed = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 1000) : 0;
      const formattedAnswers = questions.map(function (q) {
        return { questionId: q.id, selected: answers[q.id] || null };
      });
      const res = await api.post('/results/submit', {
        examId: examDetail.id,
        answers: formattedAnswers,
        timeSpent: elapsed,
      });
      setExamResult(res.data.result);
      if (auto) {
        toast.success("Time's up! Exam submitted automatically.");
      } else {
        toast.success(res.data.result.passed ? 'Congratulations! You passed!' : 'Exam submitted. Keep practicing!');
      }
      fetchResults();
      fetchExams();
    } catch (err) {
      toast.error(err.response && err.response.data && err.response.data.message ? err.response.data.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmSubmit = function () {
    handleSubmit(false);
  };

  const exitToDashboard = function () {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setView('list');
    setExamDetail(null);
    setQuestions([]);
    setAnswers({});
    setCurrentQuestion(0);
    setExamResult(null);
    setShowSubmitModal(false);
    fetchExams();
  };

  const selectAnswer = function (questionId, optionKey) {
    setAnswers(function (prev) {
      const next = { ...prev };
      next[questionId] = optionKey;
      return next;
    });
  };

  const goToQuestion = function (index) {
    setCurrentQuestion(index);
  };

  const prevQuestion = function () {
    setCurrentQuestion(function (prev) { return Math.max(0, prev - 1); });
  };

  const nextQuestion = function () {
    setCurrentQuestion(function (prev) { return Math.min(questions.length - 1, prev + 1); });
  };

  const handleLogout = function () {
    logout();
    navigate('/');
  };

  // Quick stats
  const totalAvailable = exams.filter(function (e) { return e.isOpen && !e.hasTaken; }).length;
  const totalTaken = results.length;
  const averageScore = totalTaken > 0 ? Math.round(results.reduce(function (sum, r) { return sum + (r.percentage || 0); }, 0) / totalTaken) : 0;
  const bestScore = totalTaken > 0 ? Math.max.apply(null, results.map(function (r) { return r.percentage || 0; })) : 0;

  // ========================
  // VIEW 3: RESULT
  // ========================
  if (view === 'exam' && examResult) {
    const passed = examResult.passed;
    const scorePercent = examResult.percentage || 0;
    const circumference = 2 * Math.PI * 80;
    const strokeDashoffset = circumference - (scorePercent / 100) * circumference;

    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        {passed && <ConfettiEffect />}
        <style>{`
          @keyframes scoreRing {
            from { stroke-dashoffset: ${circumference}; }
            to { stroke-dashoffset: ${strokeDashoffset}; }
          }
          @keyframes bounceIn {
            0% { transform: scale(0); opacity: 0; }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes slideUp {
            from { transform: translateY(30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
          .result-bounce { animation: bounceIn 0.8s ease-out; }
          .result-slide { animation: slideUp 0.6s ease-out both; }
          .result-float { animation: float 3s ease-in-out infinite; }
          .score-ring-anim { animation: scoreRing 1.5s ease-out 0.5s both; }
        `}</style>

        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="result-bounce max-w-lg w-full">
            {/* Main Result Card */}
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
              {/* Top Banner */}
              <div className={'p-8 text-center ' + (passed ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-amber-400 to-orange-500')}>
                <div className="result-float inline-block mb-4">
                  {passed
                    ? <Trophy className="w-20 h-20 text-yellow-300 drop-shadow-lg" />
                    : <RotateCcw className="w-20 h-20 text-white drop-shadow-lg" />
                  }
                </div>
                <h2 className={'text-3xl font-extrabold ' + (passed ? 'text-white' : 'text-white')}>
                  {passed ? '🎉 Amazing Job!' : '💪 Keep Going!'}
                </h2>
                <p className="text-white/80 mt-2 text-lg">{examDetail ? examDetail.title : ''}</p>
              </div>

              {/* Score Ring */}
              <div className="px-8 py-6 flex justify-center result-slide" style={{ animationDelay: '0.3s' }}>
                <div className="relative" style={{ width: '200px', height: '200px' }}>
                  <svg width="200" height="200" className="transform -rotate-90">
                    <circle cx="100" cy="100" r="80" fill="none" stroke="#E5E7EB" strokeWidth="12" />
                    <circle
                      cx="100" cy="100" r="80" fill="none"
                      stroke={passed ? '#10B981' : '#F59E0B'}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      className="score-ring-anim"
                      style={{ strokeDashoffset: circumference }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={'text-5xl font-extrabold ' + (passed ? 'text-green-600' : 'text-amber-600')}>{scorePercent}%</span>
                    <span className="text-gray-400 text-sm mt-1">{passed ? 'PASSED' : 'NOT YET'}</span>
                  </div>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="px-8 pb-6 result-slide" style={{ animationDelay: '0.6s' }}>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-4 text-center border border-blue-200">
                    <p className="text-2xl font-bold text-blue-700">{examResult.score}</p>
                    <p className="text-xs text-blue-500 font-medium mt-1">Marks Obtained</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-4 text-center border border-purple-200">
                    <p className="text-2xl font-bold text-purple-700">{examResult.totalMarks}</p>
                    <p className="text-xs text-purple-500 font-medium mt-1">Total Marks</p>
                  </div>
                  <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-2xl p-4 text-center border border-pink-200">
                    <p className="text-2xl font-bold text-pink-700">
                      {passed ? <CheckCircle className="w-8 h-8 mx-auto" /> : <XCircle className="w-8 h-8 mx-auto" />}
                    </p>
                    <p className="text-xs text-pink-500 font-medium mt-1">{passed ? 'Passed' : 'Try Again'}</p>
                  </div>
                </div>
              </div>

              {/* Encouraging Message */}
              <div className={'mx-8 mb-6 p-4 rounded-2xl text-center result-slide ' + (passed
                ? 'bg-green-50 border border-green-200'
                : 'bg-amber-50 border border-amber-200')}
                style={{ animationDelay: '0.9s' }}
              >
                <p className={'text-sm font-medium ' + (passed ? 'text-green-700' : 'text-amber-700')}>
                  {passed
                    ? '🌟 Outstanding performance! You should be proud of yourself!'
                    : '🚀 Every attempt makes you stronger. Review and try again — you\'ve got this!'
                  }
                </p>
              </div>

              {/* Answers Detail */}
              {examResult.showDetails !== false && examResult.answers && examResult.answers.length > 0 && (
                <div className="px-8 pb-6 result-slide" style={{ animationDelay: '1.1s' }}>
                  <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <BookOpen className="w-5 h-5" /> Answer Review
                  </h3>
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {examResult.answers.map(function (a, i) {
                      return (
                        <div
                          key={i}
                          className={'p-3 rounded-xl text-sm border transition-all ' + (a.correct
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                          )}
                        >
                          <p className="font-semibold text-gray-700 mb-1">
                            <span className="inline-block w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs text-center leading-6 mr-2">{i + 1}</span>
                            {a.question}
                          </p>
                          <div className="flex gap-4 mt-1 text-xs ml-8">
                            <span className={a.correct ? 'text-green-600 font-semibold' : 'text-red-500'}>
                              Your answer: <b>{a.selected || 'None'}</b>
                            </span>
                            {!a.correct && (
                              <span className="text-green-600 font-semibold">
                                Correct: <b>{a.correctAnswer}</b>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {examResult.showDetails === false && (
                <div className="px-8 pb-6">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center">
                    <p className="text-sm text-yellow-700 font-medium">
                      {examResult.message || 'Detailed answers will be available after the exam closes.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Back Button */}
              <div className="px-8 pb-8 result-slide" style={{ animationDelay: '1.3s' }}>
                <button
                  onClick={exitToDashboard}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-4 rounded-2xl text-lg transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg flex items-center justify-center gap-3"
                >
                  <Sparkles className="w-5 h-5" />
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================
  // VIEW 2: EXAM TAKING
  // ========================
  if (view === 'exam' && !examResult) {
    const q = questions[currentQuestion];
    const answeredCount = Object.values(answers).filter(Boolean).length;
    const timeWarning = timeLeft < 300;
    const timeCritical = timeLeft < 60;

    return (
      <div className="min-h-screen bg-gray-50">
        <style>{`
          @keyframes pulseTimer {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          @keyframes slideInQuestion {
            from { transform: translateX(20px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          .question-slide { animation: slideInQuestion 0.3s ease-out; }
          .timer-pulse { animation: pulseTimer 1s ease-in-out infinite; }
          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
          .modal-fade { animation: fadeIn 0.2s ease-out; }
        `}</style>

        {/* Top Bar */}
        <div className={'sticky top-0 z-30 shadow-lg transition-colors duration-500 ' + (timeCritical
          ? 'bg-gradient-to-r from-red-600 to-red-700'
          : timeWarning
            ? 'bg-gradient-to-r from-amber-500 to-orange-500'
            : 'bg-gradient-to-r from-indigo-600 to-purple-700'
        )}>
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              {/* Left: Title */}
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={exitToDashboard}
                  className="hover:bg-white/20 p-2 rounded-xl transition-colors flex-shrink-0"
                >
                  <ChevronLeft className="w-5 h-5 text-white" />
                </button>
                <div className="min-w-0">
                  <h2 className="font-bold text-white text-lg truncate">{examDetail && examDetail.title}</h2>
                  <p className="text-white/70 text-xs">{examDetail && examDetail.subject} | {examDetail && examDetail.type}</p>
                </div>
              </div>

              {/* Right: Timer + Submit */}
              <div className="flex items-center gap-3">
                <span className="text-white/80 text-sm hidden sm:block">
                  {answeredCount}/{questions.length} answered
                </span>
                <div className={'flex items-center gap-2 rounded-xl px-4 py-2 ' + (timeCritical
                  ? 'bg-white/30 timer-pulse'
                  : 'bg-white/20'
                )}>
                  <Timer className="w-5 h-5 text-white" />
                  <span className="text-xl font-mono font-bold text-white">{formatTimer(timeLeft)}</span>
                </div>
                <button
                  onClick={function () { setShowSubmitModal(true); }}
                  disabled={submitting}
                  className="bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 px-5 py-2 rounded-xl font-bold text-white transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl"
                >
                  {submitting
                    ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full inline-block animate-spin" /> Submitting</span>
                    : 'Submit'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Exam Area */}
        <div className="max-w-7xl mx-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

            {/* Sidebar: Question Navigator (Desktop) */}
            <div className="lg:col-span-1 order-2 lg:order-1">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sticky top-20">
                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-500" /> Questions
                </h3>
                <div className="grid grid-cols-5 lg:grid-cols-4 gap-2">
                  {questions.map(function (question, idx) {
                    var navClass = 'w-full aspect-square rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-200 cursor-pointer ';
                    if (idx === currentQuestion) {
                      navClass = navClass + 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md scale-110 ring-2 ring-indigo-300';
                    } else if (answers[question.id]) {
                      navClass = navClass + 'bg-gradient-to-br from-blue-400 to-blue-500 text-white shadow-sm';
                    } else {
                      navClass = navClass + 'bg-gray-100 text-gray-500 hover:bg-gray-200';
                    }
                    return (
                      <button
                        key={question.id}
                        onClick={function () { goToQuestion(idx); }}
                        className={navClass}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded bg-gray-100" /> Unanswered
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded bg-blue-400" /> Answered
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded bg-indigo-500 ring-2 ring-indigo-300" /> Current
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progress</span>
                    <span>{answeredCount}/{questions.length}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500"
                      style={{ width: (answeredCount / questions.length * 100) + '%' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Question Content */}
            <div className="lg:col-span-3 order-1 lg:order-2">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                {/* Question Header */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-indigo-100">
                  <div className="flex items-center gap-3">
                    <span className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-bold w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0">
                      {currentQuestion + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-xs text-indigo-400 font-medium">Question {currentQuestion + 1} of {questions.length}</p>
                      {q && <p className="text-xs text-gray-400 mt-0.5">{q.marks} mark{q.marks > 1 ? 's' : ''}</p>}
                    </div>
                    <Brain className="w-8 h-8 text-indigo-200 flex-shrink-0" />
                  </div>
                </div>

                {/* Question Body */}
                <div className="p-6 question-slide" key={currentQuestion}>
                  {q && (
                    <div>
                      <p className="text-xl font-semibold text-gray-800 mb-6 leading-relaxed">{q.question}</p>

                      {/* Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {q.options.map(function (opt) {
                          var isSelected = answers[q.id] === opt.key;
                          var colors = OPTION_COLORS[opt.key] || OPTION_COLORS['A'];
                          var optionClass = 'p-4 rounded-2xl border-2 text-left transition-all duration-200 flex items-center gap-4 cursor-pointer group ';
                          if (isSelected) {
                            optionClass = optionClass + 'border-transparent ' + colors.bg + ' ' + colors.text + ' shadow-lg scale-[1.02]';
                          } else {
                            optionClass = optionClass + 'border-gray-200 hover:border-gray-300 text-gray-600 hover:shadow-md hover:scale-[1.01]';
                          }
                          return (
                            <button
                              key={opt.key}
                              onClick={function () { selectAnswer(q.id, opt.key); }}
                              className={optionClass}
                            >
                              <span className={'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all duration-200 ' + (isSelected
                                ? colors.fill + ' text-white shadow-md'
                                : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                              )}>
                                {isSelected ? <CheckCircle className="w-5 h-5" /> : opt.key}
                              </span>
                              <span className="text-base font-medium">{opt.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Navigation */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
                  <button
                    onClick={prevQuestion}
                    disabled={currentQuestion === 0}
                    className={'flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-200 ' + (currentQuestion === 0
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-600 hover:bg-white hover:shadow-md'
                    )}
                  >
                    <ChevronLeft className="w-5 h-5" /> Previous
                  </button>

                  <span className="text-sm text-gray-400 font-medium hidden sm:block">
                    {answeredCount} of {questions.length} answered
                  </span>

                  {currentQuestion < questions.length - 1 ? (
                    <button
                      onClick={nextQuestion}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 shadow-md hover:shadow-lg transition-all duration-200"
                    >
                      Next <ChevronRight className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={function () { setShowSubmitModal(true); }}
                      disabled={submitting}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold bg-gradient-to-r from-green-400 to-emerald-500 text-white hover:from-green-500 hover:to-emerald-600 shadow-md hover:shadow-lg transition-all duration-200"
                    >
                      {submitting ? 'Submitting...' : 'Finish'} <Award className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Mobile Question Navigator */}
              <div className="lg:hidden mt-4">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-indigo-500" />
                    <span className="font-bold text-gray-700 text-sm">Jump to Question</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {questions.map(function (question, idx) {
                      var dotClass = 'w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-200 ';
                      if (idx === currentQuestion) {
                        dotClass = dotClass + 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md ring-2 ring-indigo-300';
                      } else if (answers[question.id]) {
                        dotClass = dotClass + 'bg-blue-400 text-white';
                      } else {
                        dotClass = dotClass + 'bg-gray-100 text-gray-500';
                      }
                      return (
                        <button
                          key={question.id}
                          onClick={function () { goToQuestion(idx); }}
                          className={dotClass}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Confirmation Modal */}
        {showSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-fade bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
              <div className="bg-gradient-to-r from-amber-400 to-orange-500 p-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-3">
                  <Lightbulb className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">Ready to Submit?</h3>
              </div>
              <div className="p-6">
                <p className="text-gray-600 text-center mb-2">Are you sure you want to submit your exam?</p>
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Questions answered</span>
                    <span className="font-bold text-gray-800">{answeredCount}/{questions.length}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Unanswered</span>
                    <span className={'font-bold ' + (questions.length - answeredCount > 0 ? 'text-red-500' : 'text-green-500')}>
                      {questions.length - answeredCount}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Time remaining</span>
                    <span className="font-bold text-gray-800">{formatTimer(timeLeft)}</span>
                  </div>
                </div>
                {questions.length - answeredCount > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-center">
                    <p className="text-sm text-amber-700 font-medium">
                      ⚠️ You have {questions.length - answeredCount} unanswered question{questions.length - answeredCount > 1 ? 's' : ''}!
                    </p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={function () { setShowSubmitModal(false); }}
                    className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={confirmSubmit}
                    disabled={submitting}
                    className="flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 shadow-lg transition-all"
                  >
                    {submitting ? 'Submitting...' : 'Yes, Submit!'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========================
  // VIEW 1: DASHBOARD / EXAM LIST
  // ========================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      <style>{`
        @keyframes fadeInUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .anim-fade-in { animation: fadeInUp 0.6s ease-out both; }
        .anim-float { animation: float 3s ease-in-out infinite; }
        .anim-pulse { animation: pulse 2s ease-in-out infinite; }
        .anim-gradient { background-size: 200% 200%; animation: gradientMove 4s ease infinite; }
        .shimmer-bg {
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
        .card-enter { animation: fadeInUp 0.5s ease-out both; }
      `}</style>

      {/* Top Navigation */}
      <header className="bg-white/80 backdrop-blur-lg shadow-sm border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-gray-800 text-lg">RESCO CBT</h1>
              <p className="text-xs text-gray-400 font-medium">Student Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LiveClock compact />
            <div className="hidden sm:flex items-center gap-2 bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-2 rounded-xl border border-indigo-100">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                {studentName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-gray-700">{studentName}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-xl transition-all duration-200"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6">

        {/* Welcome Banner */}
        <div className="anim-fade-in mb-6">
          <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 anim-gradient rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-10 -mt-10" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full -ml-8 -mb-8" />
            <div className="absolute top-4 right-4 anim-float">
              <Sparkles className="w-8 h-8 text-yellow-300" />
            </div>
            <div className="absolute bottom-4 right-16 anim-float" style={{ animationDelay: '1s' }}>
              <Star className="w-6 h-6 text-yellow-200" />
            </div>
            <div className="absolute top-8 right-24 anim-float" style={{ animationDelay: '0.5s' }}>
              <Brain className="w-6 h-6 text-pink-200" />
            </div>

            <div className="relative z-10">
              <p className="text-white/80 text-sm font-medium mb-1">{getGreeting()} 👋</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold mb-2">{studentName}!</h2>
              <p className="text-white/70 max-w-md">Ready to ace your exams? Let's make learning fun and exciting! 🚀</p>
            </div>
          </div>
        </div>

        {/* Exam Tips Ticker */}
        <div className="anim-fade-in mb-6" style={{ animationDelay: '0.1s' }}>
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-200 anim-float">
              <Lightbulb className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">💡 Exam Tip</p>
              <p className={'text-sm text-amber-800 font-medium transition-opacity duration-500 ' + (tipFade ? 'opacity-100' : 'opacity-0')}>
                {EXAM_TIPS[tipIndex]}
              </p>
            </div>
            <div className="hidden sm:flex gap-1 flex-shrink-0">
              {EXAM_TIPS.map(function (_, idx) {
                return (
                  <div
                    key={idx}
                    className={'w-2 h-2 rounded-full transition-all duration-300 ' + (idx === tipIndex ? 'bg-amber-500 scale-125' : 'bg-amber-300')}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Exam Instructions */}
        <div className="anim-fade-in mb-6" style={{ animationDelay: '0.12s' }}>
          <details style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <summary style={{ padding: '14px 20px', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none', background: 'linear-gradient(135deg, #fef3c7, #fde68a)' }}>
              <AlertTriangle size={20} style={{ color: '#d97706' }} />
              Exam Instructions & Guidelines
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#92400e', fontWeight: 600 }}>Click to expand</span>
            </summary>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {EXAM_INSTRUCTIONS.map(function (inst, i) {
                var InstIcon = inst.icon;
                return (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <InstIcon size={20} style={{ color: '#fff' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 3px 0' }}>{inst.title}</p>
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{inst.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        </div>

        {/* Daily Devotional */}
        <div className="anim-fade-in mb-6" style={{ animationDelay: '0.13s' }}>
          <DailyDevotional />
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="anim-fade-in" style={{ animationDelay: '0.15s' }}>
            <div className="bg-white rounded-2xl p-4 shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-gray-800">{totalAvailable}</p>
                  <p className="text-xs text-gray-400 font-medium">Available</p>
                </div>
              </div>
            </div>
          </div>
          <div className="anim-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="bg-white rounded-2xl p-4 shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-green-200">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-gray-800">{totalTaken}</p>
                  <p className="text-xs text-gray-400 font-medium">Taken</p>
                </div>
              </div>
            </div>
          </div>
          <div className="anim-fade-in" style={{ animationDelay: '0.25s' }}>
            <div className="bg-white rounded-2xl p-4 shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-purple-200">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-gray-800">{averageScore}%</p>
                  <p className="text-xs text-gray-400 font-medium">Average</p>
                </div>
              </div>
            </div>
          </div>
          <div className="anim-fade-in" style={{ animationDelay: '0.3s' }}>
            <div className="bg-white rounded-2xl p-4 shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-md shadow-amber-200">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-gray-800">{bestScore}%</p>
                  <p className="text-xs text-gray-400 font-medium">Best Score</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Available Exams Section */}
        <div className="anim-fade-in mb-8" style={{ animationDelay: '0.35s' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-extrabold text-gray-800 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Available Exams
            </h3>
            <span className="text-sm text-gray-400 font-medium">{exams.length} exam{exams.length !== 1 ? 's' : ''} found</span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin mb-4" />
              <p className="text-gray-400 font-medium">Loading your exams...</p>
            </div>
          ) : exams.length === 0 ? (
            <div className="bg-white rounded-3xl shadow-md border border-gray-100 p-8 sm:p-12 text-center">
              <div className="anim-float inline-block mb-4">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-3xl flex items-center justify-center mx-auto">
                  <BookOpen className="w-12 h-12 text-indigo-300" />
                </div>
              </div>
              <h4 className="text-xl font-bold text-gray-700 mb-2">No Exams Available Yet</h4>
              <p className="text-gray-400 max-w-sm mx-auto">Don't worry! Your teacher will create new exams soon. Keep studying and be ready! 📚</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {exams.map(function (exam, idx) {
                var subjectIdx = idx;
                var gradient = getSubjectColor(subjectIdx);
                var lightBg = getSubjectLightColor(subjectIdx);
                var icon = getSubjectIcon(subjectIdx);

                return (
                  <div
                    key={exam.id}
                    className="card-enter bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group"
                    style={{ animationDelay: (idx * 0.08) + 's' }}
                  >
                    {/* Card Header with gradient */}
                    <div className={'bg-gradient-to-r ' + gradient + ' p-4 relative overflow-hidden'}>
                      <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-6 -mt-6" />
                      <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{icon}</span>
                          <div>
                            <p className="text-white font-bold text-base leading-tight">{exam.title}</p>
                            <p className="text-white/70 text-xs mt-0.5">{exam.assignment ? exam.assignment.subject : ''} | {exam.assignment ? exam.assignment.className : ''}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4">
                      {/* Info Row */}
                      <div className="flex items-center gap-3 text-xs text-gray-400 mb-4 flex-wrap">
                        <span className="flex items-center gap-1 bg-gray-50 px-3 py-1.5 rounded-lg font-medium">
                          <Clock className="w-3.5 h-3.5 text-blue-400" />
                          {exam.duration} min
                        </span>
                        <span className="flex items-center gap-1 bg-gray-50 px-3 py-1.5 rounded-lg font-medium">
                          <Target className="w-3.5 h-3.5 text-purple-400" />
                          {exam.totalMarks} marks
                        </span>
                        <span className="flex items-center gap-1 bg-gray-50 px-3 py-1.5 rounded-lg font-medium">
                          <BookOpen className="w-3.5 h-3.5 text-green-400" />
                          {exam._count && exam._count.questions ? exam._count.questions : 0} Qs
                        </span>
                      </div>

                      {/* Status + Action */}
                      {exam.hasTaken ? (
                        <div className={'flex items-center gap-2 p-3 rounded-xl text-sm font-semibold ' + lightBg + ' border'}>
                          <CheckCircle className="w-5 h-5 text-green-500" />
                          <span className="text-green-700">Completed</span>
                        </div>
                      ) : exam.isOpen ? (
                        <button
                          onClick={function () { startExam(exam.id); }}
                          className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-3.5 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300 anim-pulse group-hover:animate-none"
                        >
                          <Sparkles className="w-4 h-4" />
                          Start Exam
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 p-3 rounded-xl text-sm font-semibold bg-gray-50 border border-gray-200 text-gray-500">
                          <Clock className="w-5 h-5 text-gray-400" />
                          <span>Not yet available</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Results History Section */}
        {results.length > 0 && (
          <div className="anim-fade-in mb-8" style={{ animationDelay: '0.4s' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-extrabold text-gray-800 flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                Recent Results
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.slice(0, 6).map(function (r, idx) {
                var passed = r.percentage >= 50;
                return (
                  <div
                    key={r.id}
                    className="card-enter bg-white rounded-2xl shadow-md border border-gray-100 p-4 hover:shadow-lg transition-all duration-300"
                    style={{ animationDelay: (idx * 0.08) + 's' }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-gray-800 text-sm truncate">{r.exam && r.exam.title}</h4>
                        <p className="text-xs text-gray-400 mt-0.5">{r.exam && r.exam.assignment ? r.exam.assignment.subject : ''}</p>
                      </div>
                      <div className={'flex-shrink-0 ml-2 px-3 py-1 rounded-lg text-xs font-bold ' + (passed
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                      )}>
                        {passed ? 'Passed' : 'Failed'}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Score</span>
                          <span className="font-bold text-gray-700">{r.score}/{r.totalMarks}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={'h-full rounded-full transition-all duration-1000 ' + (passed ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-red-400 to-pink-500')}
                            style={{ width: (r.percentage || 0) + '%' }}
                          />
                        </div>
                      </div>
                      <span className={'text-lg font-extrabold ' + (passed ? 'text-green-600' : 'text-red-500')}>
                        {r.percentage}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 mt-2">
                      {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Motivational Footer */}
        <div className="anim-fade-in text-center pb-8" style={{ animationDelay: '0.5s' }}>
          <div className="inline-flex items-center gap-2 bg-white rounded-full px-6 py-3 shadow-sm border border-gray-100">
            <Star className="w-5 h-5 text-yellow-400" />
            <span className="text-sm text-gray-500 font-medium">Keep learning, keep growing! Every exam makes you stronger. 🌟</span>
            <Star className="w-5 h-5 text-yellow-400" />
          </div>
        </div>
      </main>
    </div>
  );
}
