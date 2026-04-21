import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import LiveClock from './LiveClock';
import DailyDevotional from './DailyDevotional';
import {
  LogOut, BookOpen, Users, UserCheck, UserX, UserPlus, BarChart3, Trash2,
  X, Eye, Shield, GraduationCap, TrendingUp, Clock, CheckCircle, XCircle,
  Search, Download, Settings, ChevronRight, Sparkles, School, Award,
  Upload, FileQuestion, Plus, Minus, Menu, Calendar
} from 'lucide-react';

// ─── Color Maps (avoid template-literal classNames) ────────────────────────────
const STATUS_COLORS = {
  ACTIVE:   { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  PENDING:  { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' },
  REJECTED: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
};

const STAT_CARDS = [
  { key: 'totalStudents', label: 'Total Students',  icon: GraduationCap, gradient: ['#6366f1','#8b5cf6'], lightBg: '#eef2ff' },
  { key: 'totalTeachers', label: 'Total Teachers',  icon: Users,         gradient: ['#f59e0b','#f97316'], lightBg: '#fffbeb' },
  { key: 'publishedExams', label: 'Active Exams',    icon: Clock,         gradient: ['#10b981','#059669'], lightBg: '#ecfdf5' },
  { key: 'totalResults',  label: 'Total Results',   icon: BarChart3,     gradient: ['#3b82f6','#6366f1'], lightBg: '#eff6ff' },
];

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: BarChart3 },
  { id: 'teachers',    label: 'Teachers',    icon: UserCheck },
  { id: 'students',    label: 'Students',    icon: GraduationCap },
  { id: 'exams',       label: 'Exams',       icon: BookOpen },
  { id: 'questions',   label: 'Questions',   icon: FileQuestion },
  { id: 'analytics',   label: 'Analytics',   icon: TrendingUp },
];

// ─── Keyframes injected once ──────────────────────────────────────────────────
const KEYFRAMES = `
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes growWidth {
  from { width: 0%; }
}
@keyframes pulse-ring {
  0%   { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(1.4); opacity: 0; }
}
`;

// ─── Shared Styles ────────────────────────────────────────────────────────────
const cardBase = {
  background: '#ffffff',
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
  border: '1px solid #f1f5f9',
  transition: 'box-shadow 0.25s ease, transform 0.25s ease',
};

const hoverLift = {
  boxShadow: '0 4px 16px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.06)',
  transform: 'translateY(-2px)',
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  // Tab state
  const [activeTab, setActiveTab] = useState('dashboard');

  // Data state
  const [dashboard, setDashboard] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [draftExams, setDraftExams] = useState([]);
  const [allExams, setAllExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [examQuestions, setExamQuestions] = useState([]);
  const [selectedExamInfo, setSelectedExamInfo] = useState(null);
  const [showExamModal, setShowExamModal] = useState(false);
  const [examForm, setExamForm] = useState({ subject: '', className: 'JSS1', title: '', description: '', type: 'TEST', duration: 60, totalMarks: 100, passMark: 50, startDate: '', endDate: '', resultVisibility: 'IMMEDIATE' });

  // Search
  const [teacherSearch, setTeacherSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  // Loading
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Modals
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showDatesModal, setShowDatesModal] = useState(false);
  const [datesExam, setDatesExam] = useState(null);
  const [datesForm, setDatesForm] = useState({ startDate: '', endDate: '' });
  const [uploadFile, setUploadFile] = useState(null);
  const [manualQuestions, setManualQuestions] = useState(
    Array.from({ length: 5 }, function () { return { question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 }; })
  );

  // Form data
  const [teacherForm, setTeacherForm] = useState({ firstName: '', lastName: '', username: '', password: '' });
  const [studentForm, setStudentForm] = useState({ firstName: '', lastName: '', admissionNo: '', className: '', email: '', password: '' });

  // Sidebar responsive state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ─── Fetch helpers ─────────────────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get('/admin/dashboard');
      setDashboard(res.data);
    } catch (err) {
      toast.error('Failed to load dashboard');
    }
  }, []);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/teachers');
      setTeachers(res.data.teachers || []);
    } catch (err) {
      toast.error('Failed to load teachers');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/students');
      setStudents(res.data.students || []);
    } catch (err) {
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/analytics');
      setAnalytics(res.data);
    } catch (err) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDraftExams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/questions/exams');
      setDraftExams(res.data || []);
    } catch (err) {
      toast.error('Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllExams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/exams');
      setAllExams(res.data.exams || []);
    } catch (err) {
      toast.error('Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExamQuestions = useCallback(async (examId) => {
    setLoading(true);
    try {
      const res = await api.get('/admin/questions/' + examId);
      setSelectedExamInfo(res.data.exam);
      setExamQuestions(res.data.questions || []);
    } catch (err) {
      toast.error('Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === 'dashboard') fetchDashboard();
    else if (activeTab === 'teachers') fetchTeachers();
    else if (activeTab === 'students') fetchStudents();
    else if (activeTab === 'analytics') fetchAnalytics();
    else if (activeTab === 'questions') fetchDraftExams();
    else if (activeTab === 'exams') fetchAllExams();
  }, [activeTab, fetchDashboard, fetchTeachers, fetchStudents, fetchAnalytics, fetchDraftExams, fetchAllExams]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/');
  };

  const handleCreateTeacher = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/teachers/create', {
        firstName: teacherForm.firstName,
        lastName: teacherForm.lastName,
        username: teacherForm.username,
        password: teacherForm.password,
      });
      toast.success('Teacher created successfully');
      setShowTeacherModal(false);
      setTeacherForm({ firstName: '', lastName: '', username: '', password: '' });
      fetchTeachers();
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to create teacher');
    }
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/students/create', {
        firstName: studentForm.firstName,
        lastName: studentForm.lastName,
        admissionNo: studentForm.admissionNo,
        className: studentForm.className,
        email: studentForm.email,
        password: studentForm.password,
      });
      toast.success('Student created successfully');
      setShowStudentModal(false);
      setStudentForm({ firstName: '', lastName: '', admissionNo: '', className: '', email: '', password: '' });
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create student');
    }
  };

  const handleApproveTeacher = async (id) => {
    try {
      await api.patch('/admin/teachers/' + id + '/approve');
      toast.success('Teacher approved');
      fetchTeachers();
    } catch (err) {
      toast.error('Failed to approve teacher');
    }
  };

  const handleRejectTeacher = async (id) => {
    try {
      await api.patch('/admin/teachers/' + id + '/reject');
      toast.success('Teacher rejected');
      fetchTeachers();
    } catch (err) {
      toast.error('Failed to reject teacher');
    }
  };

  const handleDeleteTeacher = async (id) => {
    if (!window.confirm('Are you sure you want to delete this teacher?')) return;
    try {
      await api.delete('/admin/teachers/' + id);
      toast.success('Teacher deleted');
      fetchTeachers();
    } catch (err) {
      toast.error('Failed to delete teacher');
    }
  };

  const handleDeleteStudent = async (id) => {
    if (!window.confirm('Are you sure you want to delete this student?')) return;
    try {
      await api.delete('/admin/students/' + id);
      toast.success('Student deleted');
      fetchStudents();
    } catch (err) {
      toast.error('Failed to delete student');
    }
  };

  // ─── Exam Handlers ────────────────────────────────────────────────────
  const openDatesModal = (exam) => {
    setDatesExam(exam);
    // Convert ISO or empty string to datetime-local format
    const toLocal = (val) => {
      if (!val) return '';
      const d = new Date(val);
      if (isNaN(d.getTime())) return '';
      // Format as YYYY-MM-DDTHH:MM for datetime-local input
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setDatesForm({ startDate: toLocal(exam.startDate), endDate: toLocal(exam.endDate) });
    setShowDatesModal(true);
  };

  const handleUpdateDates = async (e) => {
    e.preventDefault();
    if (!datesExam) return;
    try {
      const res = await api.patch('/admin/exams/' + datesExam.id + '/dates', {
        startDate: datesForm.startDate,
        endDate: datesForm.endDate,
      });
      toast.success(res.data.message);
      setShowDatesModal(false);
      setDatesExam(null);
      fetchAllExams();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to update dates';
      toast.error(msg, { duration: 6000 });
    }
  };

  const handleCreateExam = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/exams/create', examForm);
      toast.success(res.data.message);
      setShowExamModal(false);
      setExamForm({ subject: '', className: 'JSS1', title: '', description: '', type: 'TEST', duration: 60, totalMarks: 100, passMark: 50, startDate: '', endDate: '', resultVisibility: 'IMMEDIATE' });
      fetchAllExams();
      fetchDraftExams();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to create exam';
      console.error('Admin create exam error:', err.response?.data || err.message);
      toast.error(msg, { duration: 6000 });
    }
  };

  const handlePublishExam = async (id) => {
    if (!window.confirm('Publish this exam? Students will be able to take it.')) return;
    try {
      await api.patch('/admin/exams/' + id + '/publish');
      toast.success('Exam published!');
      fetchAllExams();
      fetchDraftExams();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to publish exam');
    }
  };

  const handleArchiveExam = async (id) => {
    if (!window.confirm('Archive this exam? It will no longer be available to students.')) return;
    try {
      await api.patch('/admin/exams/' + id + '/archive');
      toast.success('Exam archived.');
      fetchAllExams();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to archive exam');
    }
  };

  const handleDeleteExam = async (id) => {
    if (!window.confirm('Delete this draft exam and all its questions?')) return;
    try {
      await api.delete('/admin/exams/' + id);
      toast.success('Exam deleted.');
      fetchAllExams();
      fetchDraftExams();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete exam');
    }
  };

  // ─── Question Handlers ──────────────────────────────────────────────────────
  const handleSelectExam = (examId) => {
    setSelectedExamId(examId);
    if (examId) fetchExamQuestions(examId);
    else { setExamQuestions([]); setSelectedExamInfo(null); }
  };

  const handleCSVUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) { toast.error('Select a file first'); return; }
    if (!selectedExamId) { toast.error('Select an exam first'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('examId', String(selectedExamId));
      const res = await api.post('/admin/questions/upload', formData, {
        timeout: 120000,
      });
      const data = res.data;
      if (data.success && data.data) {
        toast.success(`Uploaded ${data.data.created}/${data.data.total} questions`);
        if (data.data.errors && data.data.errors.length > 0) {
          toast.error(`${data.data.errors.length} row(s) skipped due to errors`);
        }
      } else {
        toast.success('Questions uploaded');
      }
      setShowUploadModal(false);
      setUploadFile(null);
      fetchExamQuestions(selectedExamId);
      fetchDraftExams();
    } catch (err) {
      const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Upload failed. Check file format and try again.';
      toast.error(errMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleManualSubmit = async (e) => {
    e && e.preventDefault();
    if (!selectedExamId) { toast.error('Select an exam first'); return; }
    setUploading(true);
    try {
      const filtered = manualQuestions.filter(function (q) { return q.question.trim(); });
      const res = await api.post('/admin/questions/manual', { examId: selectedExamId, questions: filtered });
      toast.success(res.data.message);
      setShowManualModal(false);
      setManualQuestions(
        Array.from({ length: 5 }, function () { return { question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 }; })
      );
      fetchExamQuestions(selectedExamId);
      fetchDraftExams();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add questions');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await api.delete('/admin/questions/' + questionId);
      toast.success('Question deleted');
      fetchExamQuestions(selectedExamId);
      fetchDraftExams();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete question');
    }
  };

  const downloadCSVTemplate = () => {
    const csv = 'question,optionA,optionB,optionC,optionD,answer,marks\nWhat is 2+2?,2,3,4,5,C,1\nWhat is the capital of France?,London,Berlin,Paris,Madrid,C,2';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'question_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Filtered lists ────────────────────────────────────────────────────────
  const filteredTeachers = teachers.filter((t) => {
    const q = teacherSearch.toLowerCase();
    return (
      (t.firstName + ' ' + t.lastName).toLowerCase().includes(q) ||
      (t.username || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q)
    );
  });

  const filteredStudents = students.filter((s) => {
    const q = studentSearch.toLowerCase();
    return (
      (s.firstName + ' ' + s.lastName).toLowerCase().includes(q) ||
      (s.admissionNo || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    );
  });

  // ─── Render helpers ────────────────────────────────────────────────────────
  const renderStatusBadge = (status) => {
    const c = STATUS_COLORS[status] || STATUS_COLORS.PENDING;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 12px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          backgroundColor: c.bg,
          color: c.text,
          border: '1px solid ' + c.border,
        }}
      >
        {status === 'ACTIVE' && <CheckCircle size={13} />}
        {status === 'PENDING' && <Clock size={13} />}
        {status === 'REJECTED' && <XCircle size={13} />}
        {status}
      </span>
    );
  };

  const renderLoader = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '4px solid #e2e8f0', borderTopColor: '#6366f1',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      <p style={{ marginTop: 16, color: '#64748b', fontSize: 15 }}>Loading data...</p>
    </div>
  );

  // ─── Tab Content: Dashboard ─────────────────────────────────────────────────
  const renderDashboard = () => {
    if (!dashboard) return renderLoader();
    return (
      <div>
        {/* Welcome Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
          borderRadius: 20,
          padding: '32px 36px',
          marginBottom: 28,
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
          animation: 'fadeInUp 0.5s ease both',
        }}>
          <div style={{ position: 'absolute', top: -30, right: -20, opacity: 0.12, fontSize: 140 }}>
            <School />
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Sparkles size={22} />
              <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 1.5 }}>Welcome Back</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 6px 0' }}>Admin Dashboard</h1>
            <p style={{ fontSize: 15, opacity: 0.85, margin: 0 }}>
              Signed in as <span style={{ fontWeight: 600, textDecoration: 'underline' }}>{user.email}</span>
            </p>
          </div>
        </div>

        {/* Stat Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 20,
        }}>
          {STAT_CARDS.map((sc, idx) => {
            const Icon = sc.icon;
            const value = dashboard[sc.key] ?? 0;
            return (
              <div
                key={sc.key}
                style={{
                  ...cardBase,
                  padding: 24,
                  animation: 'fadeInUp 0.5s ease ' + (idx * 0.12) + 's both',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = hoverLift.boxShadow; e.currentTarget.style.transform = hoverLift.transform; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = cardBase.boxShadow; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px 0' }}>{sc.label}</p>
                    <p style={{ fontSize: 36, fontWeight: 800, color: '#1e293b', margin: 0, lineHeight: 1 }}>{value}</p>
                  </div>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: 'linear-gradient(135deg, ' + sc.gradient[0] + ', ' + sc.gradient[1] + ')',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', boxShadow: '0 4px 12px ' + sc.gradient[0] + '40',
                  }}>
                    <Icon size={26} />
                  </div>
                </div>
                <div style={{ marginTop: 16, height: 4, borderRadius: 2, backgroundColor: sc.lightBg }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    background: 'linear-gradient(90deg, ' + sc.gradient[0] + ', ' + sc.gradient[1] + ')',
                    width: Math.min(value * 2, 100) + '%',
                    animation: 'growWidth 1s ease ' + (idx * 0.12 + 0.3) + 's both',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Tab Content: Teachers ──────────────────────────────────────────────────
  const renderTeachers = () => (
    <div style={{ animation: 'fadeIn 0.35s ease both' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Manage Teachers</h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0 0' }}>{teachers.length} teacher(s) registered</p>
        </div>
        <button
          onClick={() => setShowTeacherModal(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.45)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.35)'; }}
        >
          <UserPlus size={17} /> Create Teacher
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 400 }}>
        <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input
          type="text"
          placeholder="Search teachers by name, username..."
          value={teacherSearch}
          onChange={(e) => setTeacherSearch(e.target.value)}
          style={{
            width: '100%', padding: '11px 16px 11px 42px',
            borderRadius: 12, border: '2px solid #e2e8f0',
            fontSize: 14, outline: 'none',
            transition: 'border-color 0.2s ease',
            background: '#f8fafc',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#fff'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
        />
      </div>

      {loading ? renderLoader() : (
        filteredTeachers.length === 0 ? (
          <div style={cardBase} >
            <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
              <Users size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
              <p style={{ fontSize: 15, fontWeight: 500 }}>No teachers found</p>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
          }}>
            {filteredTeachers.map((t, idx) => (
              <div
                key={t.id || idx}
                style={{
                  ...cardBase,
                  padding: 20,
                  animation: 'fadeInUp 0.4s ease ' + (idx * 0.06) + 's both',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = hoverLift.boxShadow; e.currentTarget.style.transform = hoverLift.transform; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = cardBase.boxShadow; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 12,
                      background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 700, fontSize: 16,
                    }}>
                      {(t.firstName || '?')[0] + (t.lastName || '')[0]}
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>{t.firstName} {t.lastName}</p>
                      <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0 0' }}>@{t.username || t.email}</p>
                    </div>
                  </div>
                  {renderStatusBadge(t.status)}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {(Array.isArray(t.subjects) ? t.subjects : []).map((sub, si) => (
                    <span key={si} style={{
                      padding: '3px 10px', borderRadius: 6,
                      background: '#f1f5f9', color: '#475569',
                      fontSize: 12, fontWeight: 500,
                    }}>
                      {sub}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {t.status === 'PENDING' && (
                    <button
                      onClick={() => handleApproveTeacher(t.id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '7px 14px', borderRadius: 8, border: 'none',
                        background: '#dcfce7', color: '#166534',
                        fontWeight: 600, fontSize: 13, cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#bbf7d0'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#dcfce7'; }}
                    >
                      <UserCheck size={14} /> Approve
                    </button>
                  )}
                  {t.status !== 'REJECTED' && (
                    <button
                      onClick={() => handleRejectTeacher(t.id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '7px 14px', borderRadius: 8, border: 'none',
                        background: '#fef9c3', color: '#854d0e',
                        fontWeight: 600, fontSize: 13, cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fef08a'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#fef9c3'; }}
                    >
                      <UserX size={14} /> Reject
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteTeacher(t.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '7px 14px', borderRadius: 8, border: 'none',
                      background: '#fee2e2', color: '#991b1b',
                      fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fecaca'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );

  // ─── Tab Content: Students ──────────────────────────────────────────────────
  const renderStudents = () => (
    <div style={{ animation: 'fadeIn 0.35s ease both' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Manage Students</h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0 0' }}>{students.length} student(s) enrolled</p>
        </div>
        <button
          onClick={() => setShowStudentModal(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(16,185,129,0.45)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(16,185,129,0.35)'; }}
        >
          <GraduationCap size={17} /> Create Student
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 400 }}>
        <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input
          type="text"
          placeholder="Search students by name, admission no, or email..."
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
          style={{
            width: '100%', padding: '11px 16px 11px 42px',
            borderRadius: 12, border: '2px solid #e2e8f0',
            fontSize: 14, outline: 'none',
            transition: 'border-color 0.2s ease',
            background: '#f8fafc',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = '#fff'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
        />
      </div>

      {loading ? renderLoader() : (
        filteredStudents.length === 0 ? (
          <div style={cardBase}>
            <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
              <GraduationCap size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
              <p style={{ fontSize: 15, fontWeight: 500 }}>No students found</p>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}>
            {filteredStudents.map((s, idx) => (
              <div
                key={s.id || idx}
                style={{
                  ...cardBase,
                  padding: 20,
                  animation: 'fadeInUp 0.4s ease ' + (idx * 0.06) + 's both',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = hoverLift.boxShadow; e.currentTarget.style.transform = hoverLift.transform; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = cardBase.boxShadow; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: 16,
                  }}>
                    {(s.firstName || '?')[0] + (s.lastName || '')[0]
                  }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>{s.firstName} {s.lastName}</p>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0 0' }}>{s.email}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: 8,
                    background: '#eef2ff', color: '#4338ca',
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {s.admissionNo || 'N/A'}
                  </span>
                  <span style={{
                    padding: '4px 12px', borderRadius: 8,
                    background: '#ecfdf5', color: '#065f46',
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {s.className || 'N/A'}
                  </span>
                </div>

                <button
                  onClick={() => handleDeleteStudent(s.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 14px', borderRadius: 8, border: 'none',
                    background: '#fee2e2', color: '#991b1b',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fecaca'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );

  // ─── Tab Content: Analytics ─────────────────────────────────────────────────
  const renderAnalytics = () => {
    if (!analytics) return renderLoader();

    const classPerformance = analytics.performanceByClass || analytics.classPerformance || [];
    const subjectPerformance = analytics.performanceBySubject || analytics.subjectPerformance || [];
    const passFail = analytics.passFail || {};
    const topStudents = analytics.topStudents || [];
    const examCompletionRates = analytics.examCompletionRates || [];
    const recentlyActiveExams = analytics.recentlyActiveExams || [];

    return (
      <div style={{ animation: 'fadeIn 0.35s ease both' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Performance Analytics</h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0 0' }}>Overview of student performance across classes and subjects</p>
        </div>

        {/* Pass/Fail Overview */}
        <div style={{
          ...cardBase, padding: 24, marginBottom: 24,
          animation: 'fadeInUp 0.4s ease both',
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={18} /> Pass / Fail Overview
          </h3>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>Passed</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>{passFail.passed ?? 0}</span>
              </div>
              <div style={{ height: 14, borderRadius: 7, background: '#dcfce7', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 7,
                  background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                  width: (passFail.total ? (passFail.passed / passFail.total * 100) : 0) + '%',
                  animation: 'growWidth 1s ease 0.2s both',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#991b1b' }}>Failed</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>{passFail.failed ?? 0}</span>
              </div>
              <div style={{ height: 14, borderRadius: 7, background: '#fee2e2', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 7,
                  background: 'linear-gradient(90deg, #ef4444, #dc2626)',
                  width: (passFail.total ? (passFail.failed / passFail.total * 100) : 0) + '%',
                  animation: 'growWidth 1s ease 0.4s both',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          </div>
          {passFail.total && (
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 14, marginBlockStart: 14, marginBlockEnd: 0 }}>
              Total attempts: <strong>{passFail.total}</strong> &middot; Pass rate:{' '}
              <strong>{(passFail.passed / passFail.total * 100).toFixed(1)}%</strong>
            </p>
          )}
        </div>

        {/* Performance by Class */}
        {classPerformance.length > 0 && (
          <div style={{
            ...cardBase, padding: 24, marginBottom: 24,
            animation: 'fadeInUp 0.4s ease 0.15s both',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <School size={18} /> Performance by Class
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {classPerformance.map((cp, idx) => {
                const pct = cp.averageScore !== undefined ? cp.averageScore : 0;
                const barColor = pct >= 70 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{cp.className || cp.name || 'Class'}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: barColor }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 12, borderRadius: 6, background: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 6,
                        background: barColor,
                        width: pct + '%',
                        animation: 'growWidth 1s ease ' + (idx * 0.08 + 0.3) + 's both',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Performance by Subject */}
        {subjectPerformance.length > 0 && (
          <div style={{
            ...cardBase, padding: 24,
            animation: 'fadeInUp 0.4s ease 0.3s both',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={18} /> Performance by Subject
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {subjectPerformance.map((sp, idx) => {
                const pct = sp.averageScore !== undefined ? sp.averageScore : 0;
                const barColor = pct >= 70 ? '#6366f1' : pct >= 50 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{sp.subject || sp.name || 'Subject'}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: barColor }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 12, borderRadius: 6, background: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 6,
                        background: barColor,
                        width: pct + '%',
                        animation: 'growWidth 1s ease ' + (idx * 0.08 + 0.3) + 's both',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {classPerformance.length === 0 && subjectPerformance.length === 0 && Object.keys(passFail).length === 0 && (
          <div style={cardBase}>
            <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
              <BarChart3 size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
              <p style={{ fontSize: 15, fontWeight: 500 }}>No analytics data available yet</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>Data will appear once exams are taken.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Modal Component ────────────────────────────────────────────────────────
  const renderModal = (isOpen, onClose, title, children, accentColor) => {
    if (!isOpen) return null;
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease both',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          style={{
            background: '#fff', borderRadius: 20,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            width: '90%', maxWidth: 520,
            maxHeight: '90vh', overflow: 'auto',
            animation: 'scaleIn 0.25s ease both',
          }}
        >
          {/* Modal header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 32, height: 32, borderRadius: 8,
                background: accentColor || '#6366f1',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff',
              }}>
                <UserPlus size={16} />
              </span>
              {title}
            </h3>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8, border: 'none',
                background: '#f1f5f9', color: '#64748b', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
            >
              <X size={16} />
            </button>
          </div>
          {/* Modal body */}
          <div style={{ padding: 24 }}>
            {children}
          </div>
        </div>
      </div>
    );
  };

  // ─── Form Styles ────────────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%',
    padding: '11px 16px',
    borderRadius: 10,
    border: '2px solid #e2e8f0',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s ease, background 0.2s ease',
    background: '#f8fafc',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#475569',
    marginBottom: 6,
  };

  const submitButton = (gradient, shadowColor) => ({
    width: '100%',
    padding: '13px 24px',
    borderRadius: 12,
    border: 'none',
    background: gradient,
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    boxShadow: '0 4px 14px ' + shadowColor,
    transition: 'all 0.2s ease',
  });

  // ─── Teacher Modal ──────────────────────────────────────────────────────────
  const renderTeacherModal = () => renderModal(
    showTeacherModal,
    () => setShowTeacherModal(false),
    'Create New Teacher',
    (
      <form onSubmit={handleCreateTeacher} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>First Name</label>
          <input
            type="text"
            required
            value={teacherForm.firstName}
            onChange={(e) => setTeacherForm({ ...teacherForm, firstName: e.target.value })}
            style={inputStyle}
            placeholder="Enter first name"
            onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          />
        </div>
        <div>
          <label style={labelStyle}>Last Name</label>
          <input
            type="text"
            required
            value={teacherForm.lastName}
            onChange={(e) => setTeacherForm({ ...teacherForm, lastName: e.target.value })}
            style={inputStyle}
            placeholder="Enter last name"
            onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          />
        </div>
        <div>
          <label style={labelStyle}>Username</label>
          <input
            type="text"
            required
            value={teacherForm.username}
            onChange={(e) => setTeacherForm({ ...teacherForm, username: e.target.value })}
            style={inputStyle}
            placeholder="e.g. mrjohnson"
            onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          />
        </div>
        <div>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            required
            value={teacherForm.password}
            onChange={(e) => setTeacherForm({ ...teacherForm, password: e.target.value })}
            style={inputStyle}
            placeholder="Minimum 6 characters"
            onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          />
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select
            onChange={(e) => setTeacherForm({ ...teacherForm, status: e.target.value })}
            style={{
              ...inputStyle,
              cursor: 'pointer',
              appearance: 'none',
              background: '#f8fafc url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%2364748b\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E") no-repeat right 16px center',
            }}
          >
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <button
          type="submit"
          style={submitButton('linear-gradient(135deg, #6366f1, #8b5cf6)', 'rgba(99,102,241,0.35)')}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          Create Teacher
        </button>
      </form>
    ),
    '#6366f1',
  );

  // ─── Student Modal ──────────────────────────────────────────────────────────
  const renderStudentModal = () => renderModal(
    showStudentModal,
    () => setShowStudentModal(false),
    'Create New Student',
    (
      <form onSubmit={handleCreateStudent} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>First Name</label>
          <input
            type="text"
            required
            value={studentForm.firstName}
            onChange={(e) => setStudentForm({ ...studentForm, firstName: e.target.value })}
            style={inputStyle}
            placeholder="Enter first name"
            onFocus={(e) => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          />
        </div>
        <div>
          <label style={labelStyle}>Last Name</label>
          <input
            type="text"
            required
            value={studentForm.lastName}
            onChange={(e) => setStudentForm({ ...studentForm, lastName: e.target.value })}
            style={inputStyle}
            placeholder="Enter last name"
            onFocus={(e) => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          />
        </div>
        <div>
          <label style={labelStyle}>Admission Number</label>
          <input
            type="text"
            required
            value={studentForm.admissionNo}
            onChange={(e) => setStudentForm({ ...studentForm, admissionNo: e.target.value })}
            style={inputStyle}
            placeholder="e.g. RESCO/2024/001"
            onFocus={(e) => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          />
        </div>
        <div>
          <label style={labelStyle}>Class</label>
          <input
            type="text"
            required
            value={studentForm.className}
            onChange={(e) => setStudentForm({ ...studentForm, className: e.target.value })}
            style={inputStyle}
            placeholder="e.g. SS1A, JSS2B"
            onFocus={(e) => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            required
            value={studentForm.email}
            onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
            style={inputStyle}
            placeholder="student@resco.edu.ng"
            onFocus={(e) => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          />
        </div>
        <div>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            required
            value={studentForm.password}
            onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })}
            style={inputStyle}
            placeholder="Minimum 6 characters"
            onFocus={(e) => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          />
        </div>
        <button
          type="submit"
          style={submitButton('linear-gradient(135deg, #10b981, #059669)', 'rgba(16,185,129,0.35)')}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          Create Student
        </button>
      </form>
    ),
    '#10b981',
  );

  // ─── Tab Content: Questions ────────────────────────────────────────────────
  const renderQuestions = () => {
    const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' };
    const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.35)', transition: 'all 0.2s ease' };
    const btnSuccess = { ...btnPrimary, background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 14px rgba(16,185,129,0.35)' };
    const btnDanger = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#fee2e2', color: '#991b1b', fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s ease' };

    return (
      <div style={{ animation: 'fadeIn 0.35s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Manage Questions</h2>
            <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0 0' }}>Upload or manually add questions to DRAFT exams</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setShowUploadModal(true)} style={btnSuccess}><Upload size={16} /> Upload File</button>
            <button onClick={() => setShowManualModal(true)} style={btnPrimary}><Plus size={16} /> Add Manually</button>
          </div>
        </div>

        {/* Exam selector */}
        <div style={{ ...cardBase, padding: 20, marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 8 }}>Select a DRAFT Exam</label>
          <select
            value={selectedExamId}
            onChange={(e) => handleSelectExam(e.target.value)}
            style={{ ...inputStyle, maxWidth: 500 }}
          >
            <option value="">-- Choose an exam --</option>
            {draftExams.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.title} ({ex.subject} - {ex.className}) [{ex.questionCount} questions]</option>
            ))}
          </select>
          {draftExams.length === 0 && !loading && (
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 12, marginBlockStart: 12 }}>No DRAFT exams found. Ask a teacher to create an exam first.</p>
          )}
        </div>

        {/* Questions table */}
        {selectedExamId && selectedExamInfo && (
          <div style={{ ...cardBase, overflow: 'hidden', animation: 'fadeInUp 0.4s ease both' }}>
            <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 }}>{selectedExamInfo.title}</h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>{selectedExamInfo.subject} - {selectedExamInfo.className} &middot; {examQuestions.length} question(s)</p>
              </div>
              <a href="#" onClick={(e) => { e.preventDefault(); downloadCSVTemplate(); }} style={{ fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>Download CSV Template</a>
            </div>

            {loading ? renderLoader() : examQuestions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
                <FileQuestion size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
                <p style={{ fontSize: 15, fontWeight: 500 }}>No questions yet</p>
                <p style={{ fontSize: 13 }}>Upload a CSV or add questions manually</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>#</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Question</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>A</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>B</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>C</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>D</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Answer</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Marks</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examQuestions.map((q, idx) => (
                      <tr key={q.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#334155', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.question}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#334155' }}>{q.optionA}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#334155' }}>{q.optionB}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#334155' }}>{q.optionC}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#334155' }}>{q.optionD}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: q.answer === 'C' ? '#dcfce7' : q.answer === 'A' ? '#dbeafe' : q.answer === 'B' ? '#fef9c3' : '#fee2e2', color: q.answer === 'C' ? '#166534' : q.answer === 'A' ? '#1e40af' : q.answer === 'B' ? '#854d0e' : '#991b1b', fontWeight: 700, fontSize: 13 }}>{q.answer}</span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{q.marks}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <button onClick={() => handleDeleteQuestion(q.id)} style={btnDanger}><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Upload CSV Modal */}
        {showUploadModal && (
          <div onClick={function(e) { if (e.target === e.currentTarget) setShowUploadModal(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
            <div style={{ ...cardBase, padding: 28, maxWidth: 540, width: '100%', position: 'relative', animation: 'scaleIn 0.25s ease both' }}>
              <button onClick={() => setShowUploadModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 20px 0' }}>Upload Questions</h2>
              <form onSubmit={handleCSVUpload} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Select DRAFT Exam <span style={{ color: '#ef4444' }}>*</span></label>
                  <select
                    value={selectedExamId}
                    onChange={(e) => { setSelectedExamId(e.target.value); if (e.target.value) fetchExamQuestions(e.target.value); }}
                    style={inputStyle}
                    required
                  >
                    <option value="">-- Choose an exam --</option>
                    {draftExams.map((ex) => (
                      <option key={ex.id} value={ex.id}>{ex.title} ({ex.subject} - {ex.className}) [{ex.questionCount} questions]</option>
                    ))}
                  </select>
                  {draftExams.length === 0 && (
                    <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 6 }}>No DRAFT exams found. Go to the Exams tab to create one first.</p>
                  )}
                </div>
                <div style={{ border: '2px dashed #d1d5db', borderRadius: 12, padding: '28px 16px', textAlign: 'center', background: '#fafbfc' }}>
                  <Upload size={32} style={{ margin: '0 auto 8px', color: '#94a3b8' }} />
                  <input type="file" accept=".csv,.pdf,.docx,.txt" onChange={(e) => setUploadFile(e.target.files[0])} style={{ display: 'none' }} id="admin-csv-upload" />
                  <label htmlFor="admin-csv-upload" style={{ cursor: 'pointer', color: '#6366f1', fontWeight: 600, fontSize: 14, textDecoration: 'underline' }}>
                    {uploadFile ? uploadFile.name : 'Click to select file (CSV, PDF, DOCX, TXT)'}
                  </label>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>CSV: question,optionA,optionB,optionC,optionD,answer,marks &middot; PDF/DOCX/TXT: numbered questions with A-D options and Answer line</p>
                </div>
                <button type="submit" disabled={uploading} style={{ ...btnSuccess, width: '100%', justifyContent: 'center', opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? 'Uploading...' : 'Upload Questions'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Manual Add — Table-based Inline Editor */}
        {showManualModal && (
          <div onClick={function(e) { if (e.target === e.currentTarget) { setShowManualModal(false); setManualQuestions(Array.from({ length: 5 }, function () { return { question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 }; })); } }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
            <div style={{ ...cardBase, padding: 28, maxWidth: '96vw', width: '96vw', maxHeight: '92vh', overflowY: 'auto', position: 'relative', animation: 'scaleIn 0.25s ease both' }}>
              <button onClick={() => { setShowManualModal(false); setManualQuestions(Array.from({ length: 5 }, function () { return { question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 }; })); }} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 20px 0' }}>Add Questions Manually</h2>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Select DRAFT Exam <span style={{ color: '#ef4444' }}>*</span></label>
                <select
                  value={selectedExamId}
                  onChange={(e) => { setSelectedExamId(e.target.value); if (e.target.value) fetchExamQuestions(e.target.value); }}
                  style={inputStyle}
                  required
                >
                  <option value="">-- Choose an exam --</option>
                  {draftExams.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.title} ({ex.subject} - {ex.className}) [{ex.questionCount} questions]</option>
                  ))}
                </select>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0', minWidth: 36 }}>#</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0', minWidth: 180 }}>Question Text</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0', minWidth: 100 }}>Option A</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0', minWidth: 100 }}>Option B</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0', minWidth: 100 }}>Option C</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0', minWidth: 100 }}>Option D</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0', minWidth: 80 }}>Answer</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0', minWidth: 60 }}>Marks</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0', minWidth: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualQuestions.map(function (q, idx) {
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '4px 6px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 12 }}>{idx + 1}</td>
                          <td style={{ padding: '4px 6px' }}><input value={q.question} onChange={function (e) { var updated = [...manualQuestions]; updated[idx] = { ...updated[idx], question: e.target.value }; setManualQuestions(updated); }} placeholder="Type question..." style={{ ...inputStyle, fontSize: 12, padding: '8px 10px' }} /></td>
                          <td style={{ padding: '4px 6px' }}><input value={q.optionA} onChange={function (e) { var updated = [...manualQuestions]; updated[idx] = { ...updated[idx], optionA: e.target.value }; setManualQuestions(updated); }} placeholder="A" style={{ ...inputStyle, fontSize: 12, padding: '8px 10px' }} /></td>
                          <td style={{ padding: '4px 6px' }}><input value={q.optionB} onChange={function (e) { var updated = [...manualQuestions]; updated[idx] = { ...updated[idx], optionB: e.target.value }; setManualQuestions(updated); }} placeholder="B" style={{ ...inputStyle, fontSize: 12, padding: '8px 10px' }} /></td>
                          <td style={{ padding: '4px 6px' }}><input value={q.optionC} onChange={function (e) { var updated = [...manualQuestions]; updated[idx] = { ...updated[idx], optionC: e.target.value }; setManualQuestions(updated); }} placeholder="C" style={{ ...inputStyle, fontSize: 12, padding: '8px 10px' }} /></td>
                          <td style={{ padding: '4px 6px' }}><input value={q.optionD} onChange={function (e) { var updated = [...manualQuestions]; updated[idx] = { ...updated[idx], optionD: e.target.value }; setManualQuestions(updated); }} placeholder="D" style={{ ...inputStyle, fontSize: 12, padding: '8px 10px' }} /></td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            <select value={q.answer} onChange={function (e) { var updated = [...manualQuestions]; updated[idx] = { ...updated[idx], answer: e.target.value }; setManualQuestions(updated); }} style={{ ...inputStyle, fontSize: 12, padding: '6px 8px', textAlign: 'center' }}>
                              <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                            </select>
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}><input type="number" min="1" value={q.marks} onChange={function (e) { var updated = [...manualQuestions]; updated[idx] = { ...updated[idx], marks: parseInt(e.target.value) || 1 }; setManualQuestions(updated); }} style={{ ...inputStyle, fontSize: 12, padding: '6px 8px', textAlign: 'center', width: 50 }} /></td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            <button type="button" onClick={function () { setManualQuestions(manualQuestions.filter(function (_, i) { return i !== idx; })); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, borderRadius: 4 }}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="button" onClick={function () { setManualQuestions([...manualQuestions, { question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 }]); }} style={{ ...btnPrimary, justifyContent: 'center', flex: 1 }}><Plus size={16} /> Add Row</button>
                <button type="button" onClick={handleManualSubmit} disabled={uploading} style={{ ...btnSuccess, justifyContent: 'center', flex: 2, opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? 'Saving...' : 'Save All (' + manualQuestions.filter(function (q) { return q.question.trim(); }).length + ' questions)'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Tab Content: Exams ─────────────────────────────────────────────────
  const renderExams = () => {
    const btnGrad = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, border: 'none', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s ease' };
    const statusColor = (s) => s === 'PUBLISHED' ? { bg: '#dcfce7', text: '#166534' } : s === 'ARCHIVED' ? { bg: '#f3f4f6', text: '#374151' } : { bg: '#fef9c3', text: '#854d0e' };

    let listContent;
    if (loading) {
      listContent = renderLoader();
    } else if (allExams.length === 0) {
      listContent = (
        <div style={cardBase}><div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}><BookOpen size={40} style={{ marginBottom: 12, opacity: 0.5 }} /><p style={{ fontSize: 15, fontWeight: 500 }}>No exams yet</p><p style={{ fontSize: 13, marginTop: 6 }}>Create your first exam using the button above.</p></div></div>
      );
    } else {
      listContent = (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
          {allExams.map((ex, idx) => {
            const sc = statusColor(ex.status);
            return (
              <div key={ex.id} style={{ ...cardBase, padding: 20, animation: 'fadeInUp 0.4s ease ' + (idx * 0.06) + 's both' }} onMouseEnter={(e) => { e.currentTarget.style.boxShadow = hoverLift.boxShadow; e.currentTarget.style.transform = hoverLift.transform; }} onMouseLeave={(e) => { e.currentTarget.style.boxShadow = cardBase.boxShadow; e.currentTarget.style.transform = 'translateY(0)'; }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 }}>{ex.title}</h3>
                  <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: sc.bg, color: sc.text }}>{ex.status}</span>
                </div>
                {ex.description && <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px 0' }}>{ex.description}</p>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, fontSize: 12 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 6, background: '#eef2ff', color: '#4338ca', fontWeight: 600 }}>{ex.subject || 'N/A'}</span>
                  <span style={{ padding: '3px 10px', borderRadius: 6, background: '#ecfdf5', color: '#065f46', fontWeight: 600 }}>{ex.className || 'N/A'}</span>
                  <span style={{ padding: '3px 10px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>{ex.type || 'TEST'}</span>
                  <span style={{ padding: '3px 10px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>{ex.duration}min</span>
                  <span style={{ padding: '3px 10px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>{ex.totalMarks} marks</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>By {ex.teacherName} &middot; {ex.questionCount} Qs &middot; {ex.resultCount} results</div>

                {/* Schedule Info */}
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: (ex.startDate || ex.endDate) ? 4 : 0 }}>
                    <Calendar size={13} style={{ color: '#6366f1' }} />
                    <span style={{ fontWeight: 600, color: '#475569' }}>Schedule:</span>
                    {(ex.startDate || ex.endDate) ? (
                      <span style={{ color: '#334155' }}>
                        {ex.startDate ? 'Starts ' + new Date(ex.startDate).toLocaleString() : 'No start set'}
                        {ex.startDate && ex.endDate ? ' · ' : ''}
                        {ex.endDate ? 'Ends ' + new Date(ex.endDate).toLocaleString() : 'No end set'}
                      </span>
                    ) : (
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>No schedule set — always open to students</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(ex.status === 'DRAFT' || ex.status === 'PUBLISHED') && (
                    <button onClick={() => openDatesModal(ex)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#eef2ff', color: '#4338ca', fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.2s ease' }}><Calendar size={14} /> Edit Schedule</button>
                  )}
                  {ex.status === 'DRAFT' && (
                    <button onClick={() => handlePublishExam(ex.id)} style={{ ...btnGrad, background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 4px 14px rgba(34,197,94,0.35)', fontSize: 12, padding: '7px 14px' }}>Publish</button>
                  )}
                  {ex.status === 'PUBLISHED' && (
                    <button onClick={() => handleArchiveExam(ex.id)} style={{ ...btnGrad, background: '#f3f4f6', color: '#374151', boxShadow: 'none', fontSize: 12, padding: '7px 14px' }}>Archive</button>
                  )}
                  {ex.status === 'DRAFT' && (
                    <button onClick={() => handleDeleteExam(ex.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#fee2e2', color: '#991b1b', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}><Trash2 size={14} /> Delete</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div style={{ animation: 'fadeIn 0.35s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Manage Exams</h2>
            <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0 0' }}>Create exams and manage their lifecycle</p>
          </div>
          <button onClick={() => setShowExamModal(true)} style={{ ...btnGrad, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}><Plus size={16} /> Create Exam</button>
        </div>

        {listContent}

        {/* Create Exam Modal */}
        {showExamModal && (
          <div onClick={function(e) { if (e.target === e.currentTarget) setShowExamModal(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
            <div style={{ ...cardBase, padding: 28, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', animation: 'scaleIn 0.25s ease both' }}>
              <button onClick={() => setShowExamModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 20px 0' }}>Create New Exam</h2>
              <form onSubmit={handleCreateExam} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Subject *</label>
                    <input required value={examForm.subject} onChange={(e) => setExamForm({ ...examForm, subject: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} placeholder="e.g. Mathematics" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Class *</label>
                    <select value={examForm.className} onChange={(e) => setExamForm({ ...examForm, className: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }}>
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
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Exam Title *</label>
                  <input required value={examForm.title} onChange={(e) => setExamForm({ ...examForm, title: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} placeholder="e.g. Mathematics Mid-Term Examination" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Description</label>
                  <textarea value={examForm.description} onChange={(e) => setExamForm({ ...examForm, description: e.target.value })} rows={2} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc', resize: 'vertical' }} placeholder="Optional description" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Type</label>
                    <select value={examForm.type} onChange={(e) => setExamForm({ ...examForm, type: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }}>
                      <option value="TEST">Test</option>
                      <option value="EXAM">Examination</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Duration (minutes) *</label>
                    <input type="number" required min="1" value={examForm.duration} onChange={(e) => setExamForm({ ...examForm, duration: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Total Marks *</label>
                    <input type="number" min="1" value={examForm.totalMarks} onChange={(e) => setExamForm({ ...examForm, totalMarks: parseInt(e.target.value) || 1 })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Pass Mark *</label>
                    <input type="number" min="0" value={examForm.passMark} onChange={(e) => setExamForm({ ...examForm, passMark: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Start Date (optional)</label>
                    <input type="datetime-local" value={examForm.startDate} onChange={(e) => setExamForm({ ...examForm, startDate: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>End Date (optional)</label>
                    <input type="datetime-local" value={examForm.endDate} onChange={(e) => setExamForm({ ...examForm, endDate: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Result Visibility</label>
                  <select value={examForm.resultVisibility} onChange={(e) => setExamForm({ ...examForm, resultVisibility: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }}>
                    <option value="IMMEDIATE">Show results immediately after submission</option>
                    <option value="AFTER_CLOSE">Show results only after exam closes</option>
                  </select>
                </div>
                <button type="submit" style={{ width: '100%', padding: '13px 24px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.35)', transition: 'all 0.2s ease' }}>Create Exam</button>
              </form>
            </div>
          </div>
        )}

        {/* Edit Schedule Modal */}
        {showDatesModal && datesExam && (
          <div onClick={function(e) { if (e.target === e.currentTarget) { setShowDatesModal(false); setDatesExam(null); } }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.15)', padding: 28, maxWidth: 480, width: '100%', position: 'relative', animation: 'scaleIn 0.25s ease both' }}>
              <button onClick={() => { setShowDatesModal(false); setDatesExam(null); }} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 6px 0' }}>Edit Exam Schedule</h2>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>
                Editing schedule for: <strong style={{ color: '#4338ca' }}>{datesExam.title}</strong>
              </p>
              <form onSubmit={handleUpdateDates} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={13} /> Start Date & Time</span>
                  </label>
                  <input type="datetime-local" value={datesForm.startDate} onChange={(e) => setDatesForm({ ...datesForm, startDate: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} placeholder="Leave empty to not restrict" />
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Leave empty if students should be able to start immediately</p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={13} /> End Date & Time</span>
                  </label>
                  <input type="datetime-local" value={datesForm.endDate} onChange={(e) => setDatesForm({ ...datesForm, endDate: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} placeholder="Leave empty for no deadline" />
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Leave empty if there is no deadline for this exam</p>
                </div>
                <button type="submit" style={{ width: '100%', padding: '13px 24px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.35)', transition: 'all 0.2s ease' }}>Save Schedule</button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Tab Content Renderer ───────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':   return renderDashboard();
      case 'teachers':    return renderTeachers();
      case 'students':    return renderStudents();
      case 'exams':       return renderExams();
      case 'questions':   return renderQuestions();
      case 'analytics':   return renderAnalytics();
      default:            return renderDashboard();
    }
  };

  // ─── Main Layout ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Inject global keyframes */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
        /* Sidebar — collapsible on ALL screen sizes */
        .admin-sidebar {
          position: fixed !important;
          top: 0 !important; left: 0 !important; bottom: 0 !important;
          transform: translateX(-100%) !important;
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
          pointer-events: none !important;
        }
        .admin-sidebar.open {
          transform: translateX(0) !important;
          pointer-events: auto !important;
        }
        .admin-main-content {
          margin-left: 0 !important;
        }
        /* Hamburger always visible */
        .admin-hamburger-btn {
          display: flex !important;
        }
        /* Close button always visible inside sidebar */
        .admin-sidebar-close-btn {
          display: flex !important;
        }
      ` }} />

      {/* ─── MOBILE BACKDROP ──────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="admin-backdrop-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 99,
            animation: 'fadeInOverlay 0.2s ease both',
          }}
        />
      )}

      {/* ─── SIDEBAR ───────────────────────────────────────────────────────── */}
      <aside
        className={'admin-sidebar' + (sidebarOpen ? ' open' : '')}
        style={{
          width: 260,
          minWidth: 260,
          background: 'linear-gradient(180deg, #1e1b4b 0%, #312e81 40%, #3730a3 100%)',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.12)' : 'none',
          height: '100vh',
          overflowY: 'auto',
          zIndex: 100,
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: sidebarOpen ? 'auto' : 'none',
        }}>
        {/* Logo / Brand */}
        <div style={{
          padding: '24px 20px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          animation: 'fadeIn 0.4s ease both',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <img
              src="/resco-logo.png"
              alt="RESCO CBT"
              style={{ width: 34, height: 34, objectFit: 'contain' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextSibling.style.display = 'flex';
              }}
            />
            <div style={{ display: 'none', alignItems: 'center', justifyContent: 'center' }}>
              <School size={24} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: 0.5 }}>RESCO CBT</h1>
            <p style={{ fontSize: 11, margin: '2px 0 0 0', opacity: 0.6, fontWeight: 500 }}>Admin Panel</p>
          </div>
          {/* Mobile close button */}
          <button
            className="admin-sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(255,255,255,0.1)', border: 'none',
              color: '#fff', cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_ITEMS.map((item, idx) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  width: '100%',
                  textAlign: 'left',
                  backdropFilter: isActive ? 'blur(8px)' : 'none',
                  boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                  animation: 'slideInLeft 0.35s ease ' + (idx * 0.07) + 's both',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }
                }}
              >
                <Icon size={19} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {isActive && (
                  <ChevronRight size={15} style={{ opacity: 0.7 }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* User Info */}
        <div style={{
          padding: '16px 16px 12px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            marginBottom: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 14,
            }}>
              A
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email}
              </p>
              <p style={{ fontSize: 11, margin: '2px 0 0 0', opacity: 0.6 }}>Administrator</p>
            </div>
          </div>

          {/* Live Clock */}
          <div style={{ marginBottom: 10 }}>
            <LiveClock compact />
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%',
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(239,68,68,0.1)',
              color: '#fca5a5',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.25)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
              e.currentTarget.style.color = '#fca5a5';
            }}
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <main
        className="admin-main-content"
        style={{
          flex: 1,
          padding: 32,
          overflowY: 'auto',
          minWidth: 0,
          position: 'relative',
        }}
      >
        {/* Hamburger menu button for mobile */}
        <button
          className="admin-hamburger-btn"
          onClick={() => setSidebarOpen(true)}
          style={{
            display: 'none',
            position: 'fixed',
            top: 16,
            left: 16,
            zIndex: 50,
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #4338ca, #6366f1)',
            color: '#fff',
            border: 'none',
            boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
            cursor: 'pointer',
          }}
        >
          <Menu size={20} />
        </button>

        {/* Watermark */}
        <div className="resco-watermark">
          <img src="/resco-logo.png" alt="" />
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {renderTabContent()}
        </div>
      </main>

      {/* ─── MODALS ────────────────────────────────────────────────────────── */}
      {renderTeacherModal()}
      {renderStudentModal()}
    </div>
  );
}
