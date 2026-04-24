import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import LiveClock from './LiveClock';
import DailyDevotional from './DailyDevotional';
import {
  LogOut, BookOpen, Users, UserCheck, BarChart3,
  X, Eye, TrendingUp, Clock, CheckCircle, XCircle,
  Search, Download, Crown, GraduationCap, Sparkles, School, Award,
  FileText, ClipboardList, Target, ChevronRight, Menu, Lock,
  ArrowUpCircle, ArrowDownCircle, PieChart, Activity, Star, Hash,
  Plus, Upload, Edit3, Trash2, Send, Archive, FileSpreadsheet, UserPlus
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  ACTIVE:   { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  PENDING:  { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' },
  REJECTED: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  PUBLISHED: { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  DRAFT:    { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' },
  ARCHIVED: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
};

const STAT_CARDS = [
  { key: 'totalStudents', label: 'Total Students', icon: GraduationCap, gradient: ['#6366f1','#8b5cf6'], lightBg: '#eef2ff' },
  { key: 'totalTeachers', label: 'Total Teachers', icon: Users, gradient: ['#f59e0b','#f97316'], lightBg: '#fffbeb' },
  { key: 'publishedExams', label: 'Active Exams', icon: ClipboardList, gradient: ['#10b981','#059669'], lightBg: '#ecfdf5' },
  { key: 'totalResults',  label: 'Total Results', icon: BarChart3, gradient: ['#3b82f6','#6366f1'], lightBg: '#eff6ff' },
];

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: BarChart3 },
  { id: 'analytics',   label: 'Analytics',   icon: TrendingUp },
  { id: 'teachers',    label: 'Teachers',    icon: UserCheck },
  { id: 'students',    label: 'Students',    icon: GraduationCap },
  { id: 'exams',       label: 'Exams',       icon: BookOpen },
  { id: 'users',       label: 'Users',       icon: Users },
  { id: 'results',     label: 'Results',     icon: Download },
];

// ─── Keyframes ────────────────────────────────────────────────────────────────
const KEYFRAMES = `
@keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideInLeft { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes growWidth { from { width: 0%; } }
@keyframes pulse-ring { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }
@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes countUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes spin { to { transform: rotate(360deg); } }
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

const selectStyle = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#374151', background: '#fff', outline: 'none' };

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0',
  fontSize: 14, outline: 'none', transition: 'border-color 0.2s ease',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '10px 20px', borderRadius: 12, border: 'none',
  background: 'linear-gradient(135deg, #d97706, #b45309)',
  color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(217,119,6,0.35)', transition: 'all 0.2s ease',
};

const secondaryBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 10, border: '1.5px solid #d97706',
  background: '#fff', color: '#d97706', fontWeight: 600, fontSize: 12,
  cursor: 'pointer', transition: 'all 0.2s ease',
};

const dangerBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 10, border: 'none',
  background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 12,
  cursor: 'pointer', transition: 'all 0.2s ease',
};

const successBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #10b981, #059669)',
  color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer',
};

const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 100, animation: 'fadeIn 0.2s ease both',
};

const modalCard = {
  background: '#fff', borderRadius: 20, padding: 28,
  maxWidth: 640, width: '92%', maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 25px 60px rgba(0,0,0,0.2)', animation: 'scaleIn 0.3s ease both',
};

const modalCardWide = {
  ...modalCard, maxWidth: 820,
};

const emptyNewExam = {
  title: '', description: '', type: 'TEST', subject: '', className: '',
  duration: 60, totalMarks: 100, passMark: 50,
  startDate: '', endDate: '', resultVisibility: 'IMMEDIATE',
  shuffleQuestions: false, shuffleOptions: false,
};

const emptyQuestion = {
  question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1,
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function PrincipalDashboard() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Data
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);

  // Search
  const [teacherSearch, setTeacherSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [examSearch, setExamSearch] = useState('');
  const [examStatusFilter, setExamStatusFilter] = useState('');

  // Results
  const [resClasses, setResClasses] = useState([]);
  const [resSubjects, setResSubjects] = useState([]);
  const [resExams, setResExams] = useState([]);
  const [resClass, setResClass] = useState('');
  const [resSubject, setResSubject] = useState('');
  const [resExamId, setResExamId] = useState('');
  const [resLoading, setResLoading] = useState(false);
  const [resPreview, setResPreview] = useState(null);

  // Users management
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersRoleFilter, setUsersRoleFilter] = useState('');
  const [editPasswordModal, setEditPasswordModal] = useState(false);
  const [editPasswordUser, setEditPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  // Password change
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });

  // Logo management
  const [schoolLogo, setSchoolLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);

  // ─── Exam Management State ────────────────────────────────────────────────
  const [showCreateExamModal, setShowCreateExamModal] = useState(false);
  const [showEditExamModal, setShowEditExamModal] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [examForm, setExamForm] = useState({ ...emptyNewExam });
  const [examSaving, setExamSaving] = useState(false);

  // Questions modal
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [questionsExamId, setQuestionsExamId] = useState(null);
  const [questionsExamTitle, setQuestionsExamTitle] = useState('');
  const [questionsList, setQuestionsList] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [qForm, setQForm] = useState({ ...emptyQuestion });
  const [qTab, setQTab] = useState('manual');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [qSaving, setQSaving] = useState(false);
  const [questionsReadOnly, setQuestionsReadOnly] = useState(false);
  const [questionsError, setQuestionsError] = useState(null);

  // Teacher creation
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [teacherSaving, setTeacherSaving] = useState(false);
  const [teacherForm, setTeacherForm] = useState({ firstName: '', lastName: '', username: '', password: '' });
  const [teacherClassAssignments, setTeacherClassAssignments] = useState([{ className: 'JSS1', subject: '' }]);

  // Student creation
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentSaving, setStudentSaving] = useState(false);
  const [studentForm, setStudentForm] = useState({ firstName: '', lastName: '', email: '', password: '', className: 'JSS1', admissionNo: '' });

  // Principal name
  const principalName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email || 'Principal';

  // ─── Fetch helpers ───────────────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get('/principal/dashboard');
      setDashboard(res.data);
    } catch (err) { toast.error('Failed to load dashboard'); }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/principal/analytics');
      setAnalytics(res.data);
    } catch (err) { toast.error('Failed to load analytics'); }
    finally { setLoading(false); }
  }, []);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/principal/teachers');
      setTeachers(res.data.teachers || []);
    } catch (err) { toast.error('Failed to load teachers'); }
    finally { setLoading(false); }
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/principal/students');
      setStudents(res.data.students || []);
    } catch (err) { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  }, []);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/principal/exams');
      setExams(res.data.exams || []);
    } catch (err) { toast.error('Failed to load exams'); }
    finally { setLoading(false); }
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = {};
      if (usersRoleFilter) params.role = usersRoleFilter;
      if (usersSearch) params.search = usersSearch;
      const res = await api.get('/principal/users', { params });
      setUsers(res.data.users || []);
    } catch (err) { toast.error('Failed to load users'); }
    finally { setUsersLoading(false); }
  }, [usersRoleFilter, usersSearch]);

  useEffect(() => {
    if (activeTab === 'dashboard') fetchDashboard();
    else if (activeTab === 'analytics') fetchAnalytics();
    else if (activeTab === 'teachers') fetchTeachers();
    else if (activeTab === 'students') fetchStudents();
    else if (activeTab === 'exams') fetchExams();
    else if (activeTab === 'users') fetchUsers();
  }, [activeTab, fetchDashboard, fetchAnalytics, fetchTeachers, fetchStudents, fetchExams, fetchUsers]);

  // Results cascading filters
  useEffect(() => {
    if (activeTab === 'results') {
      api.get('/principal/results/filter-options').then(({ data }) => {
        setResClasses(data.classes || []);
        setResSubjects(data.subjects || []);
      }).catch(() => {});
    }
  }, [activeTab]);

  useEffect(() => {
    if (!resClass && !resSubject) { setResExams([]); return; }
    api.get(`/principal/exams?status=PUBLISHED&class=${encodeURIComponent(resClass)}&subject=${encodeURIComponent(resSubject)}&limit=200`).then(({ data }) => {
      setResExams(data.exams || []);
    }).catch(() => { setResExams([]); });
  }, [resClass, resSubject]);

  useEffect(() => {
    if (activeTab !== 'results' || !resExamId) { setResPreview(null); return; }
    setResLoading(true);
    api.get(`/principal/results/${resExamId}`).then(({ data }) => {
      setResPreview(data);
    }).catch(() => { setResPreview(null); }).finally(() => { setResLoading(false); });
  }, [activeTab, resExamId]);

  // ─── Handlers ───────────────────────────────────────────────────────────
  const handleLogout = () => { logout(); toast.success('Logged out successfully'); navigate('/'); };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pwForm.current || !pwForm.newPw || !pwForm.confirm) { toast.error('All fields required'); return; }
    if (pwForm.newPw.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (pwForm.newPw !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    try {
      const res = await api.post('/auth/change-password', { currentPassword: pwForm.current, newPassword: pwForm.newPw });
      toast.success(res.data.message || 'Password changed');
      setShowPwModal(false);
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    }
  };

  // ─── Exam CRUD Handlers ──────────────────────────────────────────────────
  const handleCreateExam = async (e) => {
    e.preventDefault();
    if (!examForm.title || !examForm.subject || !examForm.className) {
      toast.error('Title, Subject, and Class are required');
      return;
    }
    setExamSaving(true);
    try {
      const payload = {
        ...examForm,
        duration: Number(examForm.duration) || 60,
        totalMarks: Number(examForm.totalMarks) || 100,
        passMark: Number(examForm.passMark) || 50,
      };
      const res = await api.post('/exams', payload);
      toast.success('Exam created successfully!');
      setShowCreateExamModal(false);
      setExamForm({ ...emptyNewExam });
      fetchExams();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create exam');
    } finally { setExamSaving(false); }
  };

  const handleEditExam = async (e) => {
    e.preventDefault();
    if (!examForm.title || !examForm.subject || !examForm.className) {
      toast.error('Title, Subject, and Class are required');
      return;
    }
    setExamSaving(true);
    try {
      const payload = {
        ...examForm,
        duration: Number(examForm.duration) || 60,
        totalMarks: Number(examForm.totalMarks) || 100,
        passMark: Number(examForm.passMark) || 50,
      };
      const res = await api.put(`/exams/${editingExam.id}`, payload);
      toast.success('Exam updated successfully!');
      setShowEditExamModal(false);
      setEditingExam(null);
      setExamForm({ ...emptyNewExam });
      fetchExams();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update exam');
    } finally { setExamSaving(false); }
  };

  const handleDeleteExam = async (examId) => {
    if (!window.confirm('Are you sure you want to delete this exam? This action cannot be undone.')) return;
    try {
      await api.delete(`/exams/${examId}`);
      toast.success('Exam deleted successfully!');
      fetchExams();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete exam');
    }
  };

  const handlePublishExam = async (examId) => {
    if (!window.confirm('Publish this exam? Students will be able to take it once it starts.')) return;
    try {
      const res = await api.patch(`/exams/${examId}/publish`);
      toast.success(res.data.message || 'Exam published successfully!');
      fetchExams();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to publish exam');
    }
  };

  const handleArchiveExam = async (examId) => {
    if (!window.confirm('Archive this exam? It will no longer be available to students.')) return;
    try {
      const res = await api.patch(`/exams/${examId}/archive`);
      toast.success(res.data.message || 'Exam archived successfully!');
      fetchExams();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to archive exam');
    }
  };

  // ─── Questions Handlers ──────────────────────────────────────────────────
  const fetchQuestions = async (examId) => {
    setQuestionsLoading(true);
    try {
      const res = await api.get(`/questions/${examId}`);
      // Backend returns { success: true, data: { exam: {...}, questions: [...] } }
      // Axios wraps in res.data, so: res.data.data.questions
      const payload = res.data?.data;
      if (payload && Array.isArray(payload.questions)) {
        setQuestionsList(payload.questions);
      } else if (res.data?.questions && Array.isArray(res.data.questions)) {
        setQuestionsList(res.data.questions);
      } else if (Array.isArray(res.data)) {
        setQuestionsList(res.data);
      } else {
        console.warn('[fetchQuestions] Unexpected response:', res.data);
        setQuestionsList([]);
      }
      setQuestionsError(null);
    } catch (err) {
      console.error('[fetchQuestions] Error:', err.response?.status, err.response?.data);
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to load questions');
      setQuestionsList([]);
      setQuestionsError(err.response?.data?.message || err.message || 'Failed to load questions');
    } finally { setQuestionsLoading(false); }
  };

  const openQuestionsModal = (examId, examTitle, readOnly = false) => {
    setQuestionsExamId(examId);
    setQuestionsExamTitle(examTitle);
    setQuestionsReadOnly(readOnly);
    setQForm({ ...emptyQuestion });
    setEditingQuestion(null);
    setUploadFile(null);
    setQTab('manual');
    setShowQuestionsModal(true);
    fetchQuestions(examId);
  };

  const handleAddQuestion = async () => {
    if (!qForm.question || !qForm.optionA || !qForm.optionB || !qForm.optionC || !qForm.optionD) {
      toast.error('All fields are required');
      return;
    }
    setQSaving(true);
    try {
      if (editingQuestion) {
        await api.put(`/questions/${editingQuestion.id}`, {
          ...qForm, marks: Number(qForm.marks) || 1,
        });
        toast.success('Question updated!');
        setEditingQuestion(null);
      } else {
        await api.post('/questions/manual', {
          examId: questionsExamId,
          questions: [{ ...qForm, marks: Number(qForm.marks) || 1 }],
        });
        toast.success('Question added!');
      }
      setQForm({ ...emptyQuestion });
      fetchQuestions(questionsExamId);
      fetchExams();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save question');
    } finally { setQSaving(false); }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await api.delete(`/questions/${qId}`);
      toast.success('Question deleted!');
      fetchQuestions(questionsExamId);
      fetchExams();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete question');
    }
  };

  const handleUploadQuestions = async () => {
    if (!uploadFile) { toast.error('Please select a file'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('examId', questionsExamId);
      const res = await api.post('/questions/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      toast.success(res.data.message || 'Questions uploaded successfully!');
      setUploadFile(null);
      fetchQuestions(questionsExamId);
      fetchExams();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload questions');
    } finally { setUploading(false); }
  };

  // ─── Download Results Handler ────────────────────────────────────────────
  const downloadResults = (examId, format) => {
    toast.loading('Preparing download...');
    api.get(`/results/export/${examId}`, {
      params: { format },
      responseType: 'blob',
    }).then(res => {
      toast.dismiss();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `exam_results.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} downloaded successfully!`);
    }).catch(err => {
      toast.dismiss();
      toast.error(err.response?.data?.message || 'Failed to download results');
    });
  };

  // ─── Teacher CRUD Handlers ──────────────────────────────────────────────
  const handleCreateTeacher = async (e) => {
    e.preventDefault();
    const validAssignments = teacherClassAssignments.filter(a => a.className && a.subject);
    try {
      await api.post('/principal/teachers/create', {
        firstName: teacherForm.firstName,
        lastName: teacherForm.lastName,
        username: teacherForm.username,
        password: teacherForm.password,
        classAssignments: validAssignments,
      });
      toast.success('Teacher created successfully');
      setShowTeacherModal(false);
      setTeacherForm({ firstName: '', lastName: '', username: '', password: '' });
      setTeacherClassAssignments([{ className: 'JSS1', subject: '' }]);
      fetchTeachers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create teacher');
    }
  };

  const handleDeleteTeacher = async (teacherId) => {
    if (!window.confirm('Are you sure you want to delete this teacher? All their exams, questions, and results will also be deleted.')) return;
    try {
      await api.delete(`/principal/teachers/${teacherId}`);
      toast.success('Teacher deleted successfully!');
      fetchTeachers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete teacher');
    }
  };

  // ─── Student CRUD Handlers ──────────────────────────────────────────────
  const handleCreateStudent = async (e) => {
    e.preventDefault();
    if (!studentForm.firstName || !studentForm.lastName || !studentForm.email || !studentForm.password || !studentForm.className || !studentForm.admissionNo) {
      toast.error('All fields are required');
      return;
    }
    setStudentSaving(true);
    try {
      await api.post('/principal/students/create', studentForm);
      toast.success('Student created successfully!');
      setShowStudentModal(false);
      setStudentForm({ firstName: '', lastName: '', email: '', password: '', className: 'JSS1', admissionNo: '' });
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create student');
    } finally { setStudentSaving(false); }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm('Are you sure you want to delete this student? All their results will also be deleted.')) return;
    try {
      await api.delete(`/principal/students/${studentId}`);
      toast.success('Student deleted successfully!');
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete student');
    }
  };

  // ─── Logo Management ─────────────────────────────────────────────────
  useEffect(() => {
    api.get('/principal/settings/logo').then(res => {
      if (res.data && res.data.logo) setSchoolLogo(res.data.logo);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/principal/settings/logo').then(() => {
      setLogoPreview('/api/principal/settings/logo');
    }).catch(() => {
      setLogoPreview(null);
    });
  }, []);

  const handleLogoUpload = async (e) => {
    e.preventDefault();
    const fileInput = e.target.querySelector('input[type="file"]');
    if (!fileInput || !fileInput.files[0]) { toast.error('Select a file first'); return; }
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', fileInput.files[0]);
      await api.post('/principal/settings/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Logo uploaded successfully!');
      setLogoPreview('/api/principal/settings/logo');
      setShowLogoModal(false);
      window.location.reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload logo');
    } finally { setLogoUploading(false); }
  };

  const handleLogoReset = async () => {
    if (!window.confirm('Reset to default logo?')) return;
    try {
      await api.delete('/principal/settings/logo');
      toast.success('Logo reset to default');
      setLogoPreview(null);
      setShowLogoModal(false);
      window.location.reload();
    } catch (err) {
      toast.error('Failed to reset logo');
    }
  };

  const handleEditPassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    try {
      await api.put(`/principal/users/${editPasswordUser.id}/password`, { newPassword });
      toast.success('Password updated successfully!');
      setEditPasswordModal(false);
      setEditPasswordUser(null);
      setNewPassword('');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    }
  };

  // ─── Filtered lists ─────────────────────────────────────────────────────
  const filteredTeachers = teachers.filter((t) => {
    const q = teacherSearch.toLowerCase();
    return ((t.firstName || '') + ' ' + (t.lastName || '')).toLowerCase().includes(q) || (t.username || '').toLowerCase().includes(q) || (t.email || '').toLowerCase().includes(q);
  });

  const filteredStudents = students.filter((s) => {
    const q = studentSearch.toLowerCase();
    return ((s.firstName || '') + ' ' + (s.lastName || '')).toLowerCase().includes(q) || (s.admissionNo || '').toLowerCase().includes(q);
  });

  const filteredExams = exams.filter((e) => {
    const q = examSearch.toLowerCase();
    return e.title.toLowerCase().includes(q) || e.subject.toLowerCase().includes(q) || e.className.toLowerCase().includes(q);
  }).filter((e) => !examStatusFilter || e.status === examStatusFilter);

  // ─── Render helpers ─────────────────────────────────────────────────────
  const renderStatusBadge = (status) => {
    const c = STATUS_COLORS[status] || STATUS_COLORS.DRAFT;
    const Icon = status === 'ACTIVE' || status === 'PUBLISHED' ? CheckCircle : status === 'PENDING' ? Clock : XCircle;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, backgroundColor: c.bg, color: c.text, border: '1px solid ' + c.border }}>
        <Icon size={13} /> {status}
      </span>
    );
  };

  const renderLoader = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid #e2e8f0', borderTopColor: '#d97706', animation: 'spin 0.8s linear infinite' }} />
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      <p style={{ marginTop: 16, color: '#64748b', fontSize: 15 }}>Loading data...</p>
    </div>
  );

  const renderModalClose = (onClose) => (
    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <X size={18} />
    </button>
  );

  const renderSidebar = () => (
    <div style={{
      width: 260, minHeight: '100vh', background: 'linear-gradient(180deg, #1e1b4b 0%, #312e81 50%, #3730a3 100%)',
      display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, flexShrink: 0,
      boxShadow: '4px 0 20px rgba(0,0,0,0.15)', zIndex: 40,
    }}>
      {/* Logo Area */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(245,158,11,0.4)', overflow: 'hidden', padding: 4 }}>
            <img src={logoPreview || '/resco-logo.png'} alt="RESCO" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 800, color: '#fff', margin: 0 }}>REDEEMER'S SCHOOLS AND COLLEGE, OWOTORO</h2>
            <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Principal Portal</span>
          </div>
        </div>
      </div>

      {/* Nav Items */}
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '11px 14px', borderRadius: 10, border: 'none',
                background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: isActive ? '#fbbf24' : 'rgba(255,255,255,0.7)',
                fontWeight: isActive ? 600 : 500, fontSize: 14, cursor: 'pointer',
                transition: 'all 0.2s ease', marginBottom: 4, textAlign: 'left',
              }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; } }}
            >
              <Icon size={19} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User Info */}
      <div style={{ padding: '16px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15 }}>
            {principalName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{principalName}</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>Principal</p>
          </div>
        </div>
        <button onClick={() => setShowLogoModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer', width: '100%', marginBottom: 6, fontWeight: 500 }}>
          <Upload size={14} /> School Logo
        </button>
        <button onClick={() => setShowPwModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer', width: '100%', marginBottom: 6, fontWeight: 500 }}>
          <Lock size={14} /> Change Password
        </button>
        <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: 12, cursor: 'pointer', width: '100%', fontWeight: 500 }}>
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    </div>
  );

  // ─── Tab: Dashboard ─────────────────────────────────────────────────────
  const renderDashboard = () => {
    if (!dashboard) return renderLoader();
    return (
      <div>
        {/* Welcome Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #d97706 0%, #b45309 30%, #92400e 100%)',
          borderRadius: 20, padding: '32px 36px', marginBottom: 28, color: '#fff', position: 'relative', overflow: 'hidden',
          animation: 'fadeInUp 0.5s ease both',
        }}>
          <img src="/resco-logo.png" alt="" style={{ position: 'absolute', top: -20, right: -10, width: 200, height: 200, objectFit: 'contain', opacity: 0.15 }} />
          <div style={{ position: 'absolute', bottom: -20, right: 80, opacity: 0.08, fontSize: 100, animation: 'float 6s ease-in-out infinite' }}>
            <Award />
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Crown size={22} />
              <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 1.5 }}>Welcome Back</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 6px 0' }}>{principalName}</h1>
            <p style={{ fontSize: 15, opacity: 0.85, margin: 0 }}>
              Principal's Dashboard &mdash; Redeemer's Schools and College, Owotoro
            </p>
            <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.2)', fontSize: 13, fontWeight: 600 }}>
                <LiveClock size={14} />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.2)', fontSize: 13, fontWeight: 600 }}>
                <Sparkles size={14} /> {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          {STAT_CARDS.map((sc, idx) => {
            const Icon = sc.icon;
            const value = dashboard[sc.key] ?? 0;
            return (
              <div key={sc.key} style={{ ...cardBase, padding: 24, animation: 'fadeInUp 0.5s ease ' + (idx * 0.12) + 's both', cursor: 'default' }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = hoverLift.boxShadow; e.currentTarget.style.transform = hoverLift.transform; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = cardBase.boxShadow; e.currentTarget.style.transform = 'translateY(0)'; }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px 0' }}>{sc.label}</p>
                    <p style={{ fontSize: 36, fontWeight: 800, color: '#1e293b', margin: 0, lineHeight: 1 }}>{value}</p>
                  </div>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, ' + sc.gradient[0] + ', ' + sc.gradient[1] + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 12px ' + sc.gradient[0] + '40' }}>
                    <Icon size={26} />
                  </div>
                </div>
                <div style={{ marginTop: 16, height: 4, borderRadius: 2, backgroundColor: sc.lightBg }}>
                  <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, ' + sc.gradient[0] + ', ' + sc.gradient[1] + ')', width: Math.min(value * 2, 100) + '%', animation: 'growWidth 1s ease ' + (idx * 0.12 + 0.3) + 's both' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Extra Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 24 }}>
          {[
            { label: 'Avg. Score', value: dashboard.averageScore + '%', icon: Target, color: '#6366f1' },
            { label: 'Total Questions', value: dashboard.totalQuestions, icon: FileText, color: '#10b981' },
            { label: 'Draft Exams', value: dashboard.draftExams, icon: ClipboardList, color: '#f59e0b' },
            { label: 'New This Week', value: dashboard.recentRegistrations, icon: Sparkles, color: '#ec4899' },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={item.label} style={{ ...cardBase, padding: '18px 20px', animation: 'fadeInUp 0.5s ease ' + (idx * 0.1 + 0.5) + 's both', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: item.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.color }}>
                  <Icon size={22} />
                </div>
                <div>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0, fontWeight: 600 }}>{item.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: '2px 0 0' }}>{item.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Class Distribution */}
        {dashboard.classDistribution && dashboard.classDistribution.length > 0 && (
          <div style={{ ...cardBase, padding: 24, marginTop: 24, animation: 'fadeInUp 0.5s ease 0.8s both' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>
              <BarChart3 size={20} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom', color: '#d97706' }} />
              Class Distribution
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {dashboard.classDistribution.map((cls) => {
                const maxCount = Math.max(...dashboard.classDistribution.map(c => c.count), 1);
                const pct = (cls.count / maxCount) * 100;
                return (
                  <div key={cls.className}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{cls.className}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#d97706' }}>{cls.count}</span>
                    </div>
                    <div style={{ height: 10, borderRadius: 5, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 5, background: 'linear-gradient(90deg, #d97706, #f59e0b)', width: pct + '%', transition: 'width 1s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Daily Devotional */}
        <div style={{ marginTop: 24, animation: 'fadeInUp 0.5s ease 1s both' }}>
          <DailyDevotional />
        </div>
      </div>
    );
  };

  // ─── Tab: Analytics ─────────────────────────────────────────────────────
  const renderAnalytics = () => {
    if (loading || !analytics) return renderLoader();
    return (
      <div style={{ animation: 'fadeIn 0.35s ease both' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: '0 0 24px' }}>School Performance Analytics</h2>

        {/* Pass/Fail Overview */}
        <div style={{ ...cardBase, padding: 24, marginBottom: 24, animation: 'fadeInUp 0.4s ease both' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>
            <PieChart size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom', color: '#6366f1' }} />
            Overall Pass/Fail Overview
          </h3>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Passed', value: analytics.passFail.passed, total: analytics.passFail.total, color: '#10b981', bg: '#ecfdf5', icon: ArrowUpCircle },
              { label: 'Failed', value: analytics.passFail.failed, total: analytics.passFail.total, color: '#ef4444', bg: '#fef2f2', icon: ArrowDownCircle },
              { label: 'Total Results', value: analytics.passFail.total, total: analytics.passFail.total, color: '#6366f1', bg: '#eef2ff', icon: BarChart3 },
            ].map((item) => {
              const Icon = item.icon;
              const pct = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
              return (
                <div key={item.label} style={{ flex: '1 1 200px', padding: 20, borderRadius: 14, background: item.bg, border: '1px solid ' + item.color + '20' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Icon size={22} color={item.color} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{item.label}</span>
                  </div>
                  <p style={{ fontSize: 32, fontWeight: 800, color: item.color, margin: 0 }}>{item.value}</p>
                  <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>{pct}% of total</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Performance by Class */}
        <div style={{ ...cardBase, padding: 24, marginBottom: 24, animation: 'fadeInUp 0.4s ease 0.1s both' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>
            <TrendingUp size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom', color: '#f59e0b' }} />
            Performance by Class
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Class', 'Students', 'Avg. Score', 'Rating'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #e2e8f0' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.performanceByClass.map((cls, idx) => (
                  <tr key={cls.className} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1e293b' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {idx < 3 && <Star size={14} color="#f59e0b" fill="#f59e0b" />}
                        {cls.className}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#374151' }}>{cls.studentCount}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 80, height: 8, borderRadius: 4, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 4, width: Math.min(cls.averageScore, 100) + '%', background: cls.averageScore >= 70 ? '#10b981' : cls.averageScore >= 50 ? '#f59e0b' : '#ef4444' }} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 14, color: cls.averageScore >= 70 ? '#059669' : cls.averageScore >= 50 ? '#d97706' : '#dc2626' }}>
                          {cls.averageScore}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {renderStatusBadge(cls.averageScore >= 70 ? 'ACTIVE' : cls.averageScore >= 50 ? 'PENDING' : 'REJECTED')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Performance by Subject */}
        <div style={{ ...cardBase, padding: 24, marginBottom: 24, animation: 'fadeInUp 0.4s ease 0.2s both' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>
            <BookOpen size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom', color: '#10b981' }} />
            Performance by Subject
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {analytics.performanceBySubject.map((subj) => (
              <div key={subj.subject} style={{ padding: 16, borderRadius: 12, border: '1px solid #f1f5f9', background: '#fafafa' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>{subj.subject}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: subj.averageScore >= 70 ? '#059669' : subj.averageScore >= 50 ? '#d97706' : '#dc2626' }}>
                    {subj.averageScore}%
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{subj.resultCount} results</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Students */}
        <div style={{ ...cardBase, padding: 24, marginBottom: 24, animation: 'fadeInUp 0.4s ease 0.3s both' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>
            <Award size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom', color: '#ec4899' }} />
            Top 20 Students
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Rank', 'Name', 'Adm. No.', 'Class', 'Avg. Score', 'Exams'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #e2e8f0' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.topStudents.map((s, idx) => (
                  <tr key={s.studentId} style={{ borderBottom: '1px solid #f1f5f9', background: idx < 3 ? '#fffbeb' : 'transparent' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, fontWeight: 800, fontSize: 13, background: idx === 0 ? '#fbbf24' : idx === 1 ? '#d1d5db' : idx === 2 ? '#f97316' : '#f1f5f9', color: idx < 3 ? '#fff' : '#64748b' }}>
                        {s.averageScore}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e293b' }}>{s.firstName} {s.lastName}</td>
                    <td style={{ padding: '10px 14px', color: '#374151', fontFamily: 'monospace', fontSize: 13 }}>{s.admissionNo}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 6, background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 600 }}>{s.className}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: '#059669' }}>{s.averageScore}%</td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{s.examsTaken}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Exams */}
        <div style={{ ...cardBase, padding: 24, animation: 'fadeInUp 0.4s ease 0.4s both' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>
            <Activity size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom', color: '#3b82f6' }} />
            Recent Exam Activity
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Exam', 'Subject', 'Class', 'Teacher', 'Students', 'Questions'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #e2e8f0' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.recentlyActiveExams.map((exam) => (
                  <tr key={exam.examId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e293b' }}>{exam.title}</td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{exam.subject}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 6, background: '#ecfdf5', color: '#065f46', fontSize: 12, fontWeight: 600 }}>{exam.className}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{exam.teacherName}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#6366f1' }}>{exam.resultCount}</td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{exam.questionCount}</td>
                  </tr>
                ))}
                {analytics.recentlyActiveExams.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No recent exam activity</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ─── Tab: Teachers (Management) ──────────────────────────────────────────
  const renderTeachers = () => (
    <div style={{ animation: 'fadeIn 0.35s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Teachers Management</h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>{teachers.length} teacher(s) registered</p>
        </div>
        <button onClick={() => { setTeacherForm({ firstName: '', lastName: '', username: '', password: '' }); setShowTeacherModal(true); }} style={primaryBtn}>
          <UserPlus size={18} /> Create Teacher
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 400 }}>
        <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input type="text" placeholder="Search teachers..." value={teacherSearch} onChange={(e) => setTeacherSearch(e.target.value)}
          style={{ width: '100%', padding: '11px 16px 11px 42px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc', transition: 'border-color 0.2s ease' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#d97706'; e.currentTarget.style.background = '#fff'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }} />
      </div>

      {loading ? renderLoader() : filteredTeachers.length === 0 ? (
        <div style={cardBase}><div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}><Users size={40} style={{ marginBottom: 12, opacity: 0.5 }} /><p style={{ fontSize: 15, fontWeight: 500 }}>No teachers found</p></div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filteredTeachers.map((t, idx) => (
            <div key={t.id || idx} style={{ ...cardBase, padding: 20, animation: 'fadeInUp 0.4s ease ' + (idx * 0.06) + 's both' }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = hoverLift.boxShadow; e.currentTarget.style.transform = hoverLift.transform; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = cardBase.boxShadow; e.currentTarget.style.transform = 'translateY(0)'; }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg, #f59e0b, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                    {(t.firstName || '?')[0] + (t.lastName || '')[0]}
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>{t.firstName} {t.lastName}</p>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>@{t.username}</p>
                  </div>
                </div>
                {renderStatusBadge(t.status)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {(Array.isArray(t.subjects) ? t.subjects : []).map((sub, si) => (
                  <span key={si} style={{ padding: '3px 10px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontSize: 12, fontWeight: 500 }}>{sub}</span>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                <span>{t.examCount} exam(s)</span>
                <span>{t.email}</span>
              </div>
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => handleDeleteTeacher(t.id)} style={dangerBtn}>
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Tab: Students (Management) ──────────────────────────────────────────
  const renderStudents = () => (
    <div style={{ animation: 'fadeIn 0.35s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Students Management</h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>{students.length} student(s) enrolled</p>
        </div>
        <button onClick={() => { setStudentForm({ firstName: '', lastName: '', email: '', password: '', className: 'JSS1', admissionNo: '' }); setShowStudentModal(true); }} style={primaryBtn}>
          <GraduationCap size={18} /> Create Student
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 400 }}>
        <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input type="text" placeholder="Search students..." value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)}
          style={{ width: '100%', padding: '11px 16px 11px 42px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc', transition: 'border-color 0.2s ease' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#d97706'; e.currentTarget.style.background = '#fff'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }} />
      </div>

      {loading ? renderLoader() : filteredStudents.length === 0 ? (
        <div style={cardBase}><div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}><GraduationCap size={40} style={{ marginBottom: 12, opacity: 0.5 }} /><p style={{ fontSize: 15, fontWeight: 500 }}>No students found</p></div></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
                {['S/N', 'Name', 'Admission No.', 'Class', 'Email', 'Exams Taken', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((s, idx) => (
                <tr key={s.id || idx} style={{ borderBottom: '1px solid #f1f5f9', animation: 'fadeInUp 0.3s ease ' + (idx * 0.03) + 's both' }}>
                  <td style={{ padding: '12px 16px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1e293b' }}>{s.firstName} {s.lastName}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#374151' }}>{s.admissionNo}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 6, background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 600 }}>{s.className}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{s.email}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#6366f1' }}>{s.resultCount}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => handleDeleteStudent(s.id)} style={dangerBtn}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ─── Tab: Exams (Full Management) ────────────────────────────────────────
  const renderExams = () => (
    <div style={{ animation: 'fadeIn 0.35s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Exam Management</h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>{exams.length} exam(s)</p>
        </div>
        <button onClick={() => { setExamForm({ ...emptyNewExam }); setShowCreateExamModal(true); }} style={primaryBtn}>
          <Plus size={18} /> Create Exam
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', maxWidth: 700 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input type="text" placeholder="Search exams..." value={examSearch} onChange={(e) => setExamSearch(e.target.value)}
            style={{ width: '100%', padding: '11px 16px 11px 42px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#d97706'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }} />
        </div>
        <select value={examStatusFilter} onChange={(e) => setExamStatusFilter(e.target.value)} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {loading ? renderLoader() : filteredExams.length === 0 ? (
        <div style={cardBase}><div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}><BookOpen size={40} style={{ marginBottom: 12, opacity: 0.5 }} /><p style={{ fontSize: 15, fontWeight: 500 }}>No exams found</p></div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {filteredExams.map((e, idx) => (
            <div key={e.id || idx} style={{ ...cardBase, padding: 20, animation: 'fadeInUp 0.4s ease ' + (idx * 0.05) + 's both' }}
              onMouseEnter={(ev) => { ev.currentTarget.style.boxShadow = hoverLift.boxShadow; ev.currentTarget.style.transform = hoverLift.transform; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.boxShadow = cardBase.boxShadow; ev.currentTarget.style.transform = 'translateY(0)'; }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</p>
                  <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{e.teacherName || '—'}</p>
                </div>
                {renderStatusBadge(e.status)}
              </div>

              {/* Meta */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                <span style={{ padding: '3px 10px', borderRadius: 6, background: '#ecfdf5', color: '#065f46', fontSize: 12, fontWeight: 600 }}>{e.subject}</span>
                <span style={{ padding: '3px 10px', borderRadius: 6, background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 600 }}>{e.className}</span>
                <span style={{ padding: '3px 10px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontSize: 12, fontWeight: 500 }}>{e.type}</span>
              </div>

              {/* Stats Row */}
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={14} /> {e.duration}min</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FileText size={14} /> {e.questionCount || 0} Qs</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><BarChart3 size={14} /> {e.resultCount || 0} results</span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {e.status === 'DRAFT' && (
                  <>
                    <button onClick={() => openQuestionsModal(e.id, e.title)} style={secondaryBtn}>
                      <Plus size={13} /> Add Questions
                    </button>
                    <button onClick={() => { setEditingExam(e); setExamForm({ title: e.title, description: e.description || '', type: e.type, subject: e.subject, className: e.className, duration: e.duration, totalMarks: e.totalMarks, passMark: e.passMark, startDate: (e.startDate || '').slice(0, 16), endDate: (e.endDate || '').slice(0, 16), resultVisibility: e.resultVisibility || 'IMMEDIATE', shuffleQuestions: e.shuffleQuestions || false, shuffleOptions: e.shuffleOptions || false }); setShowEditExamModal(true); }} style={secondaryBtn}>
                      <Edit3 size={13} /> Edit
                    </button>
                    {(e.questionCount || 0) > 0 && (
                      <button onClick={() => handlePublishExam(e.id)} style={successBtn}>
                        <Send size={13} /> Publish
                      </button>
                    )}
                    <button onClick={() => handleDeleteExam(e.id)} style={dangerBtn}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </>
                )}
                {e.status === 'PUBLISHED' && (
                  <>
                    <button onClick={() => openQuestionsModal(e.id, e.title, true)} style={secondaryBtn}>
                      <Eye size={13} /> View Questions
                    </button>
                    <button onClick={() => handleArchiveExam(e.id)} style={{ ...secondaryBtn, borderColor: '#f59e0b', color: '#92400e' }}>
                      <Archive size={13} /> Archive
                    </button>
                  </>
                )}
                {e.status === 'ARCHIVED' && (
                  <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Archived — no actions available</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Create Exam Modal ─── */}
      {showCreateExamModal && (
        <div style={modalOverlay} onClick={(ev) => { if (ev.target === ev.currentTarget) setShowCreateExamModal(false); }}>
          <div style={modalCardWide}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Plus size={20} style={{ color: '#d97706' }} /> Create New Exam
              </h3>
              {renderModalClose(() => setShowCreateExamModal(false))}
            </div>
            <form onSubmit={handleCreateExam}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Title *</label>
                  <input type="text" value={examForm.title} onChange={(ev) => setExamForm({ ...examForm, title: ev.target.value })} placeholder="e.g. JSS1 First Term Mathematics Exam" style={inputStyle} required />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Description</label>
                  <textarea value={examForm.description} onChange={(ev) => setExamForm({ ...examForm, description: ev.target.value })} placeholder="Optional description..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Type</label>
                  <select value={examForm.type} onChange={(ev) => setExamForm({ ...examForm, type: ev.target.value })} style={selectStyle}>
                    <option value="TEST">Test</option>
                    <option value="EXAM">Exam</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Subject *</label>
                  <input type="text" value={examForm.subject} onChange={(ev) => setExamForm({ ...examForm, subject: ev.target.value })} placeholder="e.g. Mathematics" style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Class *</label>
                  <select value={examForm.className} onChange={(ev) => setExamForm({ ...examForm, className: ev.target.value })} style={selectStyle} required>
                    <option value="">Select class</option>
                    {['JSS1', 'JSS2', 'JSS3', 'SSS1', 'SSS2', 'SSS3'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Duration (minutes) *</label>
                  <input type="number" min="1" value={examForm.duration} onChange={(ev) => setExamForm({ ...examForm, duration: ev.target.value })} style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Total Marks *</label>
                  <input type="number" min="1" value={examForm.totalMarks} onChange={(ev) => setExamForm({ ...examForm, totalMarks: ev.target.value })} style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Pass Mark *</label>
                  <input type="number" min="0" value={examForm.passMark} onChange={(ev) => setExamForm({ ...examForm, passMark: ev.target.value })} style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Start Date</label>
                  <input type="datetime-local" value={examForm.startDate} onChange={(ev) => setExamForm({ ...examForm, startDate: ev.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>End Date</label>
                  <input type="datetime-local" value={examForm.endDate} onChange={(ev) => setExamForm({ ...examForm, endDate: ev.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Result Visibility</label>
                  <select value={examForm.resultVisibility} onChange={(ev) => setExamForm({ ...examForm, resultVisibility: ev.target.value })} style={selectStyle}>
                    <option value="MANUAL">Manual Release</option>
                    <option value="IMMEDIATE">Immediate</option>
                    <option value="AFTER_CLOSE">After Exam Closes</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#374151' }}>
                    <input type="checkbox" checked={examForm.shuffleQuestions} onChange={(ev) => setExamForm({ ...examForm, shuffleQuestions: ev.target.checked })} />
                    Shuffle Questions
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#374151' }}>
                    <input type="checkbox" checked={examForm.shuffleOptions} onChange={(ev) => setExamForm({ ...examForm, shuffleOptions: ev.target.checked })} />
                    Shuffle Options
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreateExamModal(false)} style={{ ...secondaryBtn, padding: '10px 20px', fontSize: 14 }}>Cancel</button>
                <button type="submit" disabled={examSaving} style={primaryBtn}>
                  {examSaving ? 'Creating...' : <><Plus size={16} /> Create Exam</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit Exam Modal ─── */}
      {showEditExamModal && (
        <div style={modalOverlay} onClick={(ev) => { if (ev.target === ev.currentTarget) setShowEditExamModal(false); }}>
          <div style={modalCardWide}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit3 size={20} style={{ color: '#d97706' }} /> Edit Exam
              </h3>
              {renderModalClose(() => setShowEditExamModal(false))}
            </div>
            <form onSubmit={handleEditExam}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Title *</label>
                  <input type="text" value={examForm.title} onChange={(ev) => setExamForm({ ...examForm, title: ev.target.value })} style={inputStyle} required />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Description</label>
                  <textarea value={examForm.description} onChange={(ev) => setExamForm({ ...examForm, description: ev.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Type</label>
                  <select value={examForm.type} onChange={(ev) => setExamForm({ ...examForm, type: ev.target.value })} style={selectStyle}>
                    <option value="TEST">Test</option>
                    <option value="EXAM">Exam</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Subject *</label>
                  <input type="text" value={examForm.subject} onChange={(ev) => setExamForm({ ...examForm, subject: ev.target.value })} style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Class *</label>
                  <select value={examForm.className} onChange={(ev) => setExamForm({ ...examForm, className: ev.target.value })} style={selectStyle} required>
                    <option value="">Select class</option>
                    {['JSS1', 'JSS2', 'JSS3', 'SSS1', 'SSS2', 'SSS3'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Duration (minutes) *</label>
                  <input type="number" min="1" value={examForm.duration} onChange={(ev) => setExamForm({ ...examForm, duration: ev.target.value })} style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Total Marks *</label>
                  <input type="number" min="1" value={examForm.totalMarks} onChange={(ev) => setExamForm({ ...examForm, totalMarks: ev.target.value })} style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Pass Mark *</label>
                  <input type="number" min="0" value={examForm.passMark} onChange={(ev) => setExamForm({ ...examForm, passMark: ev.target.value })} style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Start Date</label>
                  <input type="datetime-local" value={examForm.startDate} onChange={(ev) => setExamForm({ ...examForm, startDate: ev.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>End Date</label>
                  <input type="datetime-local" value={examForm.endDate} onChange={(ev) => setExamForm({ ...examForm, endDate: ev.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Result Visibility</label>
                  <select value={examForm.resultVisibility} onChange={(ev) => setExamForm({ ...examForm, resultVisibility: ev.target.value })} style={selectStyle}>
                    <option value="MANUAL">Manual Release</option>
                    <option value="IMMEDIATE">Immediate</option>
                    <option value="AFTER_CLOSE">After Exam Closes</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#374151' }}>
                    <input type="checkbox" checked={examForm.shuffleQuestions} onChange={(ev) => setExamForm({ ...examForm, shuffleQuestions: ev.target.checked })} />
                    Shuffle Questions
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#374151' }}>
                    <input type="checkbox" checked={examForm.shuffleOptions} onChange={(ev) => setExamForm({ ...examForm, shuffleOptions: ev.target.checked })} />
                    Shuffle Options
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowEditExamModal(false)} style={{ ...secondaryBtn, padding: '10px 20px', fontSize: 14 }}>Cancel</button>
                <button type="submit" disabled={examSaving} style={primaryBtn}>
                  {examSaving ? 'Saving...' : <><Edit3 size={16} /> Save Changes</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Questions Modal ─── */}
      {showQuestionsModal && (
        <div key={questionsExamId || 'questions-modal'} style={modalOverlay} onClick={(ev) => { if (ev.target === ev.currentTarget) setShowQuestionsModal(false); }}>
          <div style={modalCardWide}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={20} style={{ color: '#d97706' }} />
                {questionsReadOnly ? 'View Questions' : 'Manage Questions'} — {questionsExamTitle}
              </h3>
              {renderModalClose(() => setShowQuestionsModal(false))}
            </div>

            {/* Tabs (only when editable) */}
            {!questionsReadOnly && (
              <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
                {[
                  { key: 'manual', label: 'Manual Entry', icon: Edit3 },
                  { key: 'upload', label: 'File Upload', icon: Upload },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = qTab === tab.key;
                  return (
                    <button key={tab.key} onClick={() => setQTab(tab.key)} type="button"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: 'none', background: 'none', borderBottom: active ? '2px solid #d97706' : '2px solid transparent', marginBottom: '-2px', color: active ? '#d97706' : '#64748b', fontWeight: active ? 700 : 500, fontSize: 14, cursor: 'pointer' }}>
                      <Icon size={15} /> {tab.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Manual Entry Tab */}
            {!questionsReadOnly && qTab === 'manual' && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                  {editingQuestion ? 'Edit Question' : 'Add a New Question'}
                </p>
                <div style={{ display: 'grid', gap: 10 }}>
                  <textarea value={qForm.question} onChange={(ev) => setQForm({ ...qForm, question: ev.target.value })} placeholder="Type the question here..." rows={3} style={inputStyle} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input type="text" value={qForm.optionA} onChange={(ev) => setQForm({ ...qForm, optionA: ev.target.value })} placeholder="Option A" style={inputStyle} />
                    <input type="text" value={qForm.optionB} onChange={(ev) => setQForm({ ...qForm, optionB: ev.target.value })} placeholder="Option B" style={inputStyle} />
                    <input type="text" value={qForm.optionC} onChange={(ev) => setQForm({ ...qForm, optionC: ev.target.value })} placeholder="Option C" style={inputStyle} />
                    <input type="text" value={qForm.optionD} onChange={(ev) => setQForm({ ...qForm, optionD: ev.target.value })} placeholder="Option D" style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Correct Answer</label>
                      <select value={qForm.answer} onChange={(ev) => setQForm({ ...qForm, answer: ev.target.value })} style={selectStyle}>
                        {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>Option {o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Marks</label>
                      <input type="number" min="1" value={qForm.marks} onChange={(ev) => setQForm({ ...qForm, marks: ev.target.value })} style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" onClick={handleAddQuestion} disabled={qSaving} style={primaryBtn}>
                      {qSaving ? 'Saving...' : editingQuestion ? <><Edit3 size={15} /> Update Question</> : <><Plus size={15} /> Add Question</>}
                    </button>
                    {editingQuestion && (
                      <button type="button" onClick={() => { setEditingQuestion(null); setQForm({ ...emptyQuestion }); }} style={secondaryBtn}>
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Upload Tab */}
            {!questionsReadOnly && qTab === 'upload' && (
              <div style={{ marginBottom: 20, padding: 20, border: '2px dashed #d1d5db', borderRadius: 14, textAlign: 'center', background: '#fafafa' }}>
                <Upload size={32} style={{ color: '#94a3b8', marginBottom: 8 }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Upload Question File</p>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Accepted formats: CSV, PDF, DOCX, TXT</p>
                <input type="file" accept=".csv,.pdf,.docx,.txt" onChange={(ev) => setUploadFile(ev.target.files[0])} style={{ display: 'none' }} id="q-upload-input" />
                <label htmlFor="q-upload-input" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: '1.5px solid #d97706', background: '#fff', color: '#d97706', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  <Upload size={14} /> Choose File
                </label>
                {uploadFile && (
                  <p style={{ fontSize: 12, color: '#059669', marginTop: 8, fontWeight: 500 }}>{uploadFile.name}</p>
                )}
                <div style={{ marginTop: 12 }}>
                  <button type="button" onClick={handleUploadQuestions} disabled={!uploadFile || uploading} style={primaryBtn}>
                    {uploading ? 'Uploading...' : <><Upload size={15} /> Upload Questions</>}
                  </button>
                </div>
              </div>
            )}

            {/* Error display */}
            {questionsError && (
              <div style={{ padding: 20, textAlign: 'center', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 12, background: '#fef2f2', marginBottom: 16 }}>
                <p style={{ fontWeight: 600 }}>{questionsError}</p>
                <button onClick={() => { setQuestionsError(null); fetchQuestions(questionsExamId); }} style={{ marginTop: 8, padding: '6px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 13 }}>Retry</button>
              </div>
            )}

            {/* Existing Questions List */}
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
                Questions ({questionsList.length})
              </p>
              {questionsLoading ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#d97706', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 13 }}>Loading questions...</p>
                </div>
              ) : questionsList.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                  <FileText size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
                  <p style={{ fontSize: 13 }}>No questions yet</p>
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {questionsList.map((q, qIdx) => (
                    <div key={q.id || qIdx} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fafafa' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 3 }}>Q{qIdx + 1}.</p>
                          <p style={{ fontSize: 13, color: '#1e293b', fontWeight: 500, margin: 0, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{q.question || ''}</p>
                          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                            <span>A: {q.optionA || ''}</span>
                            <span>B: {q.optionB || ''}</span>
                            <span>C: {q.optionC || ''}</span>
                            <span>D: {q.optionD || ''}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: '#dcfce7', color: '#166534', fontSize: 11, fontWeight: 700 }}>
                            Ans: {q.answer || '?'}
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{q.marks || 1} mark(s)</span>
                        </div>
                      </div>
                      {!questionsReadOnly && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => { const safe = q || {}; setEditingQuestion(safe); setQForm({ question: safe.question || '', optionA: safe.optionA || '', optionB: safe.optionB || '', optionC: safe.optionC || '', optionD: safe.optionD || '', answer: safe.answer || 'A', marks: safe.marks || 1 }); }} style={{ ...secondaryBtn, padding: '4px 10px', fontSize: 11 }}>
                            <Edit3 size={12} /> Edit
                          </button>
                          <button onClick={() => handleDeleteQuestion(q.id)} style={{ ...dangerBtn, padding: '4px 10px', fontSize: 11 }}>
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );

  // ─── Tab: Results ───────────────────────────────────────────────────────
  const renderResults = () => (
    <div style={{ animation: 'fadeIn 0.35s ease both' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: '0 0 24px' }}>Examination Results</h2>

      {/* Cascading Filters */}
      <div style={{ ...cardBase, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Class</label>
            <select value={resClass} onChange={(e) => { setResClass(e.target.value); setResExamId(''); setResPreview(null); }} style={selectStyle}>
              <option value="">All Classes</option>
              {resClasses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Subject</label>
            <select value={resSubject} onChange={(e) => { setResSubject(e.target.value); setResExamId(''); setResPreview(null); }} style={selectStyle}>
              <option value="">All Subjects</option>
              {resSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Exam</label>
            <select value={resExamId} onChange={(e) => setResExamId(e.target.value)} style={selectStyle}>
              <option value="">Select an exam</option>
              {resExams.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.className})</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Results Preview */}
      {resLoading ? renderLoader() : resPreview ? (
        <div style={{ animation: 'fadeInUp 0.4s ease both' }}>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Students', value: resPreview.summary.totalStudents, color: '#6366f1' },
              { label: 'Average', value: resPreview.summary.average + '%', color: '#f59e0b' },
              { label: 'Highest', value: resPreview.summary.highest + '%', color: '#10b981' },
              { label: 'Lowest', value: resPreview.summary.lowest + '%', color: '#ef4444' },
              { label: 'Pass Rate', value: resPreview.summary.passRate + '%', color: '#059669' },
            ].map((item) => (
              <div key={item.label} style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #f1f5f9', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0, fontWeight: 600 }}>{item.label}</p>
                <p style={{ fontSize: 24, fontWeight: 800, color: item.color, margin: '6px 0 0' }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Export Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => downloadResults(resExamId, 'pdf')} style={primaryBtn}>
              <FileText size={16} /> Download PDF
            </button>
            <button onClick={() => downloadResults(resExamId, 'csv')} style={{ ...primaryBtn, background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 4px 14px rgba(5,150,105,0.35)' }}>
              <FileSpreadsheet size={16} /> Download CSV
            </button>
          </div>

          {/* Results Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)' }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
                  {['Rank', 'Name', 'Adm. No.', 'Class', 'Score', '%', 'Status', 'Time'].map((h) => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resPreview.results.map((r) => (
                  <tr key={r.studentId} style={{ borderBottom: '1px solid #f1f5f9', background: r.status === 'PASS' ? '#fff' : '#fef2f2' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: r.rank <= 3 ? '#d97706' : '#64748b' }}>{r.rank}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e293b' }}>{r.firstName} {r.lastName}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 13, color: '#374151' }}>{r.admissionNo}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 6, background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 600 }}>{r.className}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#374151' }}>{r.score}/{r.totalMarks}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: r.status === 'PASS' ? '#059669' : '#dc2626' }}>{r.percentage}%</td>
                    <td style={{ padding: '10px 14px' }}>
                      {renderStatusBadge(r.status === 'PASS' ? 'ACTIVE' : 'REJECTED')}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#64748b' }}>{r.timeSpent ? Math.floor(r.timeSpent / 60) + 'm ' + (r.timeSpent % 60) + 's' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Download Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={() => downloadResults(resExamId, 'pdf')} style={secondaryBtn}>
              <FileText size={14} /> Download PDF
            </button>
            <button onClick={() => downloadResults(resExamId, 'csv')} style={{ ...secondaryBtn, borderColor: '#059669', color: '#059669' }}>
              <FileSpreadsheet size={14} /> Download CSV
            </button>
          </div>
        </div>
      ) : (
        <div style={cardBase}>
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <ClipboardList size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: '#64748b' }}>Select a class, subject, and exam to view results</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Use the filters above to narrow down your search</p>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Password Modal ─────────────────────────────────────────────────────
  const renderPasswordModal = () => {
    if (!showPwModal) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, animation: 'fadeIn 0.2s ease both' }}
        onClick={(e) => { if (e.target === e.currentTarget) setShowPwModal(false); }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: 32, maxWidth: 420, width: '90%', boxShadow: '0 25px 60px rgba(0,0,0,0.2)', animation: 'scaleIn 0.3s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>Change Password</h3>
            <button onClick={() => setShowPwModal(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleChangePassword}>
            {[
              { label: 'Current Password', key: 'current', type: 'password' },
              { label: 'New Password', key: 'newPw', type: 'password' },
              { label: 'Confirm New Password', key: 'confirm', type: 'password' },
            ].map((f) => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}</label>
                <input type={f.type} value={pwForm[f.key]} onChange={(e) => setPwForm({ ...pwForm, [f.key]: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#d97706'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; }} />
              </div>
            ))}
            <button type="submit" style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 4 }}>
              Update Password
            </button>
          </form>
        </div>
      </div>
    );
  };

  // ─── Tab: Users (Password Management) ─────────────────────────────────────
  const renderUsers = () => {
    const filteredUsers = users.filter(u => {
      const q = usersSearch.toLowerCase();
      if (!q) return true;
      return (u.email || '').toLowerCase().includes(q) ||
        (u.firstName || '').toLowerCase().includes(q) ||
        (u.lastName || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q);
    }).filter(u => !usersRoleFilter || u.role === usersRoleFilter);

    return (
      <div style={{ animation: 'fadeIn 0.35s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>
              <Users size={22} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom', color: '#d97706' }} />
              Manage Users &amp; Passwords
            </h2>
            <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0 0' }}>View and change passwords for all users</p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', maxWidth: 700 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input type="text" placeholder="Search by name, email..." value={usersSearch} onChange={(e) => setUsersSearch(e.target.value)}
              style={{ width: '100%', padding: '11px 16px 11px 42px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#d97706'; }} onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
            />
          </div>
          <select value={usersRoleFilter} onChange={(e) => setUsersRoleFilter(e.target.value)} style={selectStyle}>
            <option value="">All Roles</option>
            <option value="STUDENT">Students</option>
            <option value="TEACHER">Teachers</option>
            <option value="ADMIN">Admins</option>
            <option value="PRINCIPAL">Principal</option>
          </select>
        </div>

        {usersLoading ? renderLoader() : filteredUsers.length === 0 ? (
          <div style={{ ...cardBase, textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
            <Users size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
            <p style={{ fontSize: 15, fontWeight: 500 }}>No users found</p>
          </div>
        ) : (
          <div style={{ ...cardBase, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Name</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email / Username</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Role</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Password</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u, idx) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', animation: 'fadeInUp 0.3s ease ' + (idx * 0.03) + 's both' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fffbeb'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: u.role === 'STUDENT' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : u.role === 'TEACHER' ? 'linear-gradient(135deg, #f59e0b, #f97316)' : 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                            {(u.firstName || '?')[0]}{(u.lastName || '')[0]}
                          </div>
                          <div>
                            <p style={{ fontWeight: 600, color: '#1e293b', margin: 0, fontSize: 13 }}>{u.firstName || ''} {u.lastName || ''}</p>
                            {u.admissionNo && <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>Adm: {u.admissionNo}</p>}
                            {u.className && <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>{u.className}</p>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>
                        {u.email || u.teacherUsername || 'N/A'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: u.role === 'PRINCIPAL' ? '#fef3c7' : u.role === 'ADMIN' ? '#dbeafe' : u.role === 'TEACHER' ? '#dcfce7' : '#f3e8ff', color: u.role === 'PRINCIPAL' ? '#92400e' : u.role === 'ADMIN' ? '#1e40af' : u.role === 'TEACHER' ? '#166534' : '#6b21a8' }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <code style={{ padding: '4px 10px', borderRadius: 6, background: u.isHashed ? '#fef2f2' : '#f0fdf4', color: u.isHashed ? '#991b1b' : '#166534', fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>
                          {u.isHashed ? '(hashed)' : u.password}
                        </code>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button onClick={() => { setEditPasswordUser(u); setNewPassword(''); setEditPasswordModal(true); }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, border: '1.5px solid #d97706', background: '#fff', color: '#d97706', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                          <Edit3 size={14} /> {u.isHashed ? 'Reset' : 'Change'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
              Showing {filteredUsers.length} of {users.length} user(s)
            </div>
          </div>
        )}

        {/* Edit Password Modal */}
        {editPasswordModal && editPasswordUser && (
          <div style={modalOverlay} onClick={() => setEditPasswordModal(false)}>
            <div style={{ ...modalCard, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>Change Password</h3>
                {renderModalClose(() => setEditPasswordModal(false))}
              </div>
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
                  <strong>User:</strong> {editPasswordUser.firstName} {editPasswordUser.lastName}
                </p>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>{editPasswordUser.email} ({editPasswordUser.role})</p>
              </div>
              <form onSubmit={handleEditPassword}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>New Password</label>
                <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password (min 6 chars)"
                  style={{ ...inputStyle, marginBottom: 16 }} autoFocus />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setEditPasswordModal(false)} style={{ ...secondaryBtn, borderColor: '#d1d5db', color: '#6b7280' }}>Cancel</button>
                  <button type="submit" style={primaryBtn}>Update Password</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Tab Content Router ─────────────────────────────────────────────────
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return renderDashboard();
      case 'analytics': return renderAnalytics();
      case 'teachers': return renderTeachers();
      case 'students': return renderStudents();
      case 'exams': return renderExams();
      case 'users': return renderUsers();
      case 'results': return renderResults();
      default: return renderDashboard();
    }
  };

  // ─── Main Render ────────────────────────────────────────────────────────
  return (
    <>
    {/* School Name Header */}
    <div style={{
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    }}>
      {schoolLogo && (
        <img src={schoolLogo} alt="School Logo" style={{ height: 40, width: 40, objectFit: 'contain', borderRadius: 8 }} />
      )}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#ffffff', letterSpacing: 0.5 }}>
          REDEEMER'S SCHOOLS AND COLLEGE, OWOTORO
        </h1>
        <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#c7d2fe', fontWeight: 500 }}>
          Computer-Based Test Platform
        </p>
      </div>
    </div>
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <style>{KEYFRAMES}</style>
      {/* Logo Background Watermark */}
      <div style={{ position: 'fixed', top: '50%', left: '55%', transform: 'translate(-50%, -50%)', opacity: 0.03, pointerEvents: 'none', zIndex: 0 }}>
        <img src="/resco-logo.png" alt="" style={{ width: 500, height: 500, objectFit: 'contain' }} />
      </div>

      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 35 }} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Desktop sidebar wrapper */}
      <div id="sidebar-desktop" style={{ display: 'none' }}>
        {renderSidebar()}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `#sidebar-desktop { display: none; } @media (min-width: 768px) { #sidebar-desktop { display: block !important; } }` }} />

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 45 }}>
          {renderSidebar()}
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, padding: '24px 28px', maxWidth: 1200, margin: '0 auto', width: '100%', position: 'relative', zIndex: 1 }}>
        {/* School Name Header */}
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', margin: 0, letterSpacing: 1 }}>REDEEMER'S SCHOOLS AND COLLEGE, OWOTORO</h1>
        </div>
        {/* Mobile Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151' }}>
            <Menu size={20} /> Menu
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LiveClock />
            <span style={{ padding: '6px 14px', borderRadius: 8, background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
              <Crown size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> Principal
            </span>
          </div>
        </div>

        {renderContent()}
      </div>

      {/* Password Modal */}
      {renderPasswordModal()}

      {/* ─── Create Teacher Modal ─── */}
      {showTeacherModal && (
        <div style={modalOverlay} onClick={(ev) => { if (ev.target === ev.currentTarget) setShowTeacherModal(false); }}>
          <div style={modalCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserPlus size={20} style={{ color: '#d97706' }} /> Create Teacher
              </h3>
              {renderModalClose(() => setShowTeacherModal(false))}
            </div>
            <form onSubmit={handleCreateTeacher}>
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>First Name *</label>
                    <input type="text" value={teacherForm.firstName} onChange={(ev) => setTeacherForm({ ...teacherForm, firstName: ev.target.value })} placeholder="e.g. John" style={inputStyle} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Last Name *</label>
                    <input type="text" value={teacherForm.lastName} onChange={(ev) => setTeacherForm({ ...teacherForm, lastName: ev.target.value })} placeholder="e.g. Smith" style={inputStyle} required />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Username *</label>
                  <input type="text" value={teacherForm.username} onChange={(ev) => setTeacherForm({ ...teacherForm, username: ev.target.value })} placeholder="e.g. jsmith" style={inputStyle} required />
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Login email will be auto-generated as: username@resco.local</p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Password *</label>
                  <input type="password" value={teacherForm.password} onChange={(ev) => setTeacherForm({ ...teacherForm, password: ev.target.value })} placeholder="Min 6 characters" style={inputStyle} required minLength={6} />
                </div>
              </div>
              {/* Class & Subject Assignments */}
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Class & Subject Assignments
                </label>
                {teacherClassAssignments.map((assignment, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <select
                      value={assignment.className}
                      onChange={(e) => {
                        const updated = [...teacherClassAssignments];
                        updated[idx] = { ...updated[idx], className: e.target.value };
                        setTeacherClassAssignments(updated);
                      }}
                      style={selectStyle}
                    >
                      {['JSS1','JSS2','JSS3','SSS1','SSS2','SSS3'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Subject (e.g. Mathematics)"
                      value={assignment.subject}
                      onChange={(e) => {
                        const updated = [...teacherClassAssignments];
                        updated[idx] = { ...updated[idx], subject: e.target.value };
                        setTeacherClassAssignments(updated);
                      }}
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#374151', background: '#fff', outline: 'none' }}
                    />
                    {teacherClassAssignments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setTeacherClassAssignments(teacherClassAssignments.filter((_, i) => i !== idx))}
                        style={{ padding: '8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fee2e2', color: '#991b1b', cursor: 'pointer', fontSize: 16, fontWeight: 700, lineHeight: 1 }}
                      >
                        -
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setTeacherClassAssignments([...teacherClassAssignments, { className: 'JSS1', subject: '' }])}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '6px 14px', borderRadius: 8, border: '1px dashed #d1d5db',
                    background: '#f9fafb', color: '#6b7280', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  }}
                >
                  <Plus size={14} /> Add Class
                </button>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowTeacherModal(false)} style={secondaryBtn}>Cancel</button>
                <button type="submit" disabled={teacherSaving} style={primaryBtn}>
                  {teacherSaving ? 'Creating...' : <><UserPlus size={15} /> Create Teacher</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Create Student Modal ─── */}
      {showStudentModal && (
        <div style={modalOverlay} onClick={(ev) => { if (ev.target === ev.currentTarget) setShowStudentModal(false); }}>
          <div style={modalCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <GraduationCap size={20} style={{ color: '#d97706' }} /> Create Student
              </h3>
              {renderModalClose(() => setShowStudentModal(false))}
            </div>
            <form onSubmit={handleCreateStudent}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>First Name *</label>
                  <input type="text" value={studentForm.firstName} onChange={(ev) => setStudentForm({ ...studentForm, firstName: ev.target.value })} placeholder="e.g. Ade" style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Last Name *</label>
                  <input type="text" value={studentForm.lastName} onChange={(ev) => setStudentForm({ ...studentForm, lastName: ev.target.value })} placeholder="e.g. Johnson" style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Email *</label>
                  <input type="email" value={studentForm.email} onChange={(ev) => setStudentForm({ ...studentForm, email: ev.target.value })} placeholder="e.g. ade@resco.local" style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Password *</label>
                  <input type="password" value={studentForm.password} onChange={(ev) => setStudentForm({ ...studentForm, password: ev.target.value })} placeholder="Min 6 characters" style={inputStyle} required minLength={6} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Class *</label>
                  <select value={studentForm.className} onChange={(ev) => setStudentForm({ ...studentForm, className: ev.target.value })} style={selectStyle} required>
                    <option value="">Select class</option>
                    {['JSS1', 'JSS2', 'JSS3', 'SSS1', 'SSS2', 'SSS3'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Admission No. *</label>
                  <input type="text" value={studentForm.admissionNo} onChange={(ev) => setStudentForm({ ...studentForm, admissionNo: ev.target.value })} placeholder="e.g. RES/2024/001" style={inputStyle} required />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowStudentModal(false)} style={secondaryBtn}>Cancel</button>
                <button type="submit" disabled={studentSaving} style={primaryBtn}>
                  {studentSaving ? 'Creating...' : <><GraduationCap size={15} /> Create Student</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logo Upload Modal */}
      {showLogoModal && (
        <div style={modalOverlay} onClick={() => setShowLogoModal(false)}>
          <div style={{ ...modalCard, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>School Logo Settings</h3>
              {renderModalClose(() => setShowLogoModal(false))}
            </div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 100, height: 100, borderRadius: 16, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', overflow: 'hidden', border: '2px dashed #d1d5db' }}>
                <img src={logoPreview || '/resco-logo.png'} alt="Current Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <p style={{ fontSize: 13, color: '#64748b' }}>Current Logo</p>
            </div>
            <form onSubmit={handleLogoUpload}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Upload New Logo (PNG, JPG, or WebP)</label>
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{ width: '100%', padding: '8px', borderRadius: 8, border: '2px solid #e2e8f0', marginBottom: 16, fontSize: 13 }} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={handleLogoReset} style={dangerBtn}>Reset to Default</button>
                <button type="submit" disabled={logoUploading} style={primaryBtn}>{logoUploading ? 'Uploading...' : 'Upload Logo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
