import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import {
  LogOut, BookOpen, Users, UserCheck, UserX, UserPlus, BarChart3, Trash2,
  X, Eye, Shield, GraduationCap, TrendingUp, Clock, CheckCircle, XCircle,
  Search, Download, Settings, ChevronRight
} from 'lucide-react';

export default function AdminPanel() {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [dashStats, setDashStats] = useState({});
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Modal states
  const [showCreateStudent, setShowCreateStudent] = useState(false);
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [studentForm, setStudentForm] = useState({ email: '', password: '', firstName: '', lastName: '', className: 'JSS1', admissionNo: '' });
  const [assignForm, setAssignForm] = useState({ teacherId: '', subject: '', className: 'JSS1' });

  const fetchDashboard = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/dashboard');
      setDashStats(data);
    } catch { toast.error('Failed to load dashboard'); }
  }, []);

  const fetchTeachers = useCallback(async () => {
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (search) params.search = search;
      const { data } = await api.get('/admin/teachers', { params });
      setTeachers(data.teachers || []);
    } catch { toast.error('Failed to load teachers'); }
  }, [filterStatus, search]);

  const fetchStudents = useCallback(async () => {
    try {
      const params = search ? { search } : {};
      const { data } = await api.get('/admin/students', { params });
      setStudents(data.students || []);
    } catch { toast.error('Failed to load students'); }
  }, [search]);

  const fetchAssignments = useCallback(async () => {
    try { const { data } = await api.get('/admin/assignments'); setAssignments(data || []); }
    catch { toast.error('Failed to load assignments'); }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try { const { data } = await api.get('/admin/analytics'); setAnalytics(data); }
    catch { toast.error('Failed to load analytics'); }
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([fetchDashboard(), fetchTeachers(), fetchStudents(), fetchAssignments(), fetchAnalytics()])
      .finally(() => setLoading(false));
  }, [fetchDashboard, fetchTeachers, fetchStudents, fetchAssignments, fetchAnalytics]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleApproveTeacher = async (id) => {
    try { await api.patch(`/admin/teachers/${id}/approve`); toast.success('Teacher approved!'); refresh(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleRejectTeacher = async (id) => {
    try { await api.patch(`/admin/teachers/${id}/reject`); toast.success('Teacher rejected.'); refresh(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleDeleteTeacher = async (id) => {
    if (!window.confirm('Delete this teacher permanently?')) return;
    try { await api.delete(`/admin/teachers/${id}`); toast.success('Teacher deleted.'); refresh(); }
    catch (err) { toast.error('Failed to delete'); }
  };

  const handleDeleteStudent = async (id) => {
    if (!window.confirm('Delete this student permanently?')) return;
    try { await api.delete(`/admin/students/${id}`); toast.success('Student deleted.'); refresh(); }
    catch (err) { toast.error('Failed to delete'); }
  };

  const handleDeleteAssignment = async (id) => {
    if (!window.confirm('Delete this assignment permanently?')) return;
    try { await api.delete('/admin/assignments/' + id); toast.success('Assignment deleted.'); refresh(); }
    catch (err) { toast.error('Failed to delete'); }
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/students/create', studentForm);
      toast.success('Student created!');
      setShowCreateStudent(false);
      setStudentForm({ email: '', password: '', firstName: '', lastName: '', className: 'JSS1', admissionNo: '' });
      refresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/assignments', assignForm);
      toast.success('Assignment created!');
      setShowCreateAssignment(false);
      refresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const activeTeachers = teachers.filter(t => t.status === 'ACTIVE');
  const pendingTeachers = teachers.filter(t => t.status === 'PENDING');

  // === RENDER ===
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center"><Shield className="w-5 h-5 text-white" /></div>
            <div><h1 className="font-bold text-gray-800">RESCO CBT</h1><p className="text-xs text-gray-500">Admin Panel</p></div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Admin: <b>{user?.email}</b></span>
            <button onClick={() => { logout(); window.location.href = '/'; }} className="text-gray-400 hover:text-red-500"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { key: 'teachers', label: 'Teachers', icon: Users, badge: pendingTeachers.length },
            { key: 'students', label: 'Students', icon: GraduationCap },
            { key: 'assignments', label: 'Assignments', icon: Settings },
            { key: 'analytics', label: 'Analytics', icon: TrendingUp },
          ].map(({ key, label, icon: Icon, badge }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === key ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border'}`}>
              <Icon className="w-4 h-4" />{label}
              {badge > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{badge}</span>}
            </button>
          ))}
        </div>

        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Students', value: dashStats.totalStudents || 0, icon: GraduationCap, color: 'blue' },
                { label: 'Teachers', value: dashStats.totalTeachers || 0, icon: Users, color: 'green' },
                { label: 'Active Teachers', value: dashStats.activeTeachers || 0, icon: UserCheck, color: 'purple' },
                { label: 'Pending Approvals', value: dashStats.pendingTeachers || 0, icon: Clock, color: 'yellow' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="card flex items-center gap-4">
                  <div className={`w-12 h-12 bg-${color}-100 rounded-xl flex items-center justify-center`}><Icon className={`w-6 h-6 text-${color}-600`} /></div>
                  <div><p className="text-2xl font-bold">{value}</p><p className="text-sm text-gray-500">{label}</p></div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Exams', value: dashStats.totalExams || 0, icon: BookOpen, color: 'indigo' },
                { label: 'Published', value: dashStats.publishedExams || 0, icon: Eye, color: 'green' },
                { label: 'Total Results', value: dashStats.totalResults || 0, icon: TrendingUp, color: 'cyan' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="card flex items-center gap-4">
                  <div className={`w-12 h-12 bg-${color}-100 rounded-xl flex items-center justify-center`}><Icon className={`w-6 h-6 text-${color}-600`} /></div>
                  <div><p className="text-2xl font-bold">{value}</p><p className="text-sm text-gray-500">{label}</p></div>
                </div>
              ))}
            </div>

            {pendingTeachers.length > 0 && (
              <div className="card mb-4 border-yellow-300 bg-yellow-50">
                <h3 className="font-semibold text-yellow-800 mb-3 flex items-center gap-2"><Clock className="w-5 h-5" /> Pending Teacher Approvals</h3>
                <div className="space-y-2">
                  {pendingTeachers.map(t => (
                    <div key={t.id} className="bg-white rounded-lg p-3 flex items-center justify-between">
                      <div><p className="font-medium text-gray-800">{t.firstName} {t.lastName}</p><p className="text-sm text-gray-500">{t.email} | Subjects: {t.subjects?.join(', ')}</p></div>
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveTeacher(t.id)} className="btn-success text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Approve</button>
                        <button onClick={() => handleRejectTeacher(t.id)} className="btn-danger text-sm flex items-center gap-1"><XCircle className="w-4 h-4" /> Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TEACHERS */}
        {activeTab === 'teachers' && (
          <div>
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teachers..." className="input-field pl-10" />
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field w-auto">
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="ACTIVE">Active</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Name</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Email</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Subjects</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
                </tr></thead>
                <tbody className="divide-y">
                  {teachers.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{t.firstName} {t.lastName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.subjects?.join(', ')}</td>
                      <td className="px-4 py-3 text-center"><span className={`badge ${t.status === 'ACTIVE' ? 'badge-green' : t.status === 'PENDING' ? 'badge-yellow' : 'badge-red'}`}>{t.status}</span></td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {t.status === 'PENDING' && (
                            <>
                              <button onClick={() => handleApproveTeacher(t.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Approve"><CheckCircle className="w-4 h-4" /></button>
                              <button onClick={() => handleRejectTeacher(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Reject"><XCircle className="w-4 h-4" /></button>
                            </>
                          )}
                          <button onClick={() => handleDeleteTeacher(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STUDENTS */}
        {activeTab === 'students' && (
          <div>
            <div className="flex gap-3 mb-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students..." className="input-field pl-10" />
              </div>
              <button onClick={() => setShowCreateStudent(true)} className="btn-primary flex items-center gap-2"><UserPlus className="w-4 h-4" /> Add Student</button>
            </div>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Admission No</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Name</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Class</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Email</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
                </tr></thead>
                <tbody className="divide-y">
                  {students.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono text-gray-800">{s.admissionNo}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{s.firstName} {s.lastName}</td>
                      <td className="px-4 py-3"><span className="badge badge-blue">{s.className}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{s.user?.email || s.email || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleDeleteStudent(s.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ASSIGNMENTS */}
        {activeTab === 'assignments' && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => setShowCreateAssignment(true)} className="btn-primary flex items-center gap-2"><UserPlus className="w-4 h-4" /> New Assignment</button>
            </div>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Teacher</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Subject</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Class</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Exams</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
                </tr></thead>
                <tbody className="divide-y">
                  {assignments.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{a.teacher?.firstName} {a.teacher?.lastName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{a.subject}</td>
                      <td className="px-4 py-3"><span className="badge badge-blue">{a.className}</span></td>
                      <td className="px-4 py-3 text-sm text-center">{a._count?.exams || 0}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleDeleteAssignment(a.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ANALYTICS */}
        {activeTab === 'analytics' && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analytics.byClass && (
                <div className="card">
                  <h3 className="font-semibold mb-4 flex items-center gap-2"><GraduationCap className="w-5 h-5" /> Performance by Class</h3>
                  <div className="space-y-3">
                    {Object.entries(analytics.byClass).map(([cls, data]) => (
                      <div key={cls} className="flex items-center gap-4">
                        <span className="w-16 text-sm font-medium text-gray-700">{cls}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-4"><div className="h-4 rounded-full bg-primary-500 flex items-center justify-end pr-2" style={{ width: `${Math.min(data.average || 0, 100)}%` }}><span className="text-xs text-white font-bold">{data.average?.toFixed(1)}%</span></div></div>
                        <span className="text-sm text-gray-500 w-16 text-right">{data.count} students</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {analytics.bySubject && (
                <div className="card">
                  <h3 className="font-semibold mb-4 flex items-center gap-2"><BookOpen className="w-5 h-5" /> Performance by Subject</h3>
                  <div className="space-y-3">
                    {Object.entries(analytics.bySubject).map(([sub, data]) => (
                      <div key={sub} className="flex items-center gap-4">
                        <span className="w-24 text-sm font-medium text-gray-700">{sub}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-4"><div className="h-4 rounded-full bg-green-500 flex items-center justify-end pr-2" style={{ width: `${Math.min(data.average || 0, 100)}%` }}><span className="text-xs text-white font-bold">{data.average?.toFixed(1)}%</span></div></div>
                        <span className="text-sm text-gray-500 w-16 text-right">{data.count} exams</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {analytics.topStudents && analytics.topStudents.length > 0 && (
              <div className="card">
                <h3 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Top Performing Students</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {analytics.topStudents.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="w-8 h-8 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center font-bold text-sm">{i + 1}</span>
                      <div><p className="text-sm font-medium">{s.firstName} {s.lastName}</p><p className="text-xs text-gray-400">{s.className} | Avg: {s.average}%</p></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* CREATE STUDENT MODAL */}
      {showCreateStudent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button onClick={() => setShowCreateStudent(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-bold mb-4">Add New Student</h2>
            <form onSubmit={handleCreateStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">First Name</label><input type="text" value={studentForm.firstName} onChange={e => setStudentForm({ ...studentForm, firstName: e.target.value })} className="input-field" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label><input type="text" value={studentForm.lastName} onChange={e => setStudentForm({ ...studentForm, lastName: e.target.value })} className="input-field" required /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Admission No</label><input type="text" value={studentForm.admissionNo} onChange={e => setStudentForm({ ...studentForm, admissionNo: e.target.value })} className="input-field" placeholder="e.g. RES/2025/JSS1/003" required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Class</label><select value={studentForm.className} onChange={e => setStudentForm({ ...studentForm, className: e.target.value })} className="input-field"><option>JSS1</option><option>JSS2</option><option>JSS3</option><option>SSS1</option><option>SSS2</option><option>SSS3</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" value={studentForm.email} onChange={e => setStudentForm({ ...studentForm, email: e.target.value })} className="input-field" required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Password</label><input type="password" value={studentForm.password} onChange={e => setStudentForm({ ...studentForm, password: e.target.value })} className="input-field" minLength={6} required /></div>
              <button type="submit" className="w-full btn-primary py-3">Create Student</button>
            </form>
          </div>
        </div>
      )}

      {/* CREATE ASSIGNMENT MODAL */}
      {showCreateAssignment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button onClick={() => setShowCreateAssignment(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-bold mb-4">Create Assignment</h2>
            <form onSubmit={handleCreateAssignment} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label><select value={assignForm.teacherId} onChange={e => setAssignForm({ ...assignForm, teacherId: e.target.value })} className="input-field" required><option value="">Select teacher...</option>{activeTeachers.map(t => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Subject</label><input type="text" value={assignForm.subject} onChange={e => setAssignForm({ ...assignForm, subject: e.target.value })} className="input-field" placeholder="e.g. Mathematics" required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Class</label><select value={assignForm.className} onChange={e => setAssignForm({ ...assignForm, className: e.target.value })} className="input-field"><option>JSS1</option><option>JSS2</option><option>JSS3</option><option>SSS1</option><option>SSS2</option><option>SSS3</option></select></div>
              <button type="submit" className="w-full btn-primary py-3">Create Assignment</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
