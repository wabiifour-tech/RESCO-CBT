import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import LiveClock from './LiveClock';
import DailyDevotional from './DailyDevotional';
import {
  LogOut, BookOpen, Plus, Upload, Eye, Edit3, Trash2, Download, ChevronDown, ChevronUp,
  X, Users, BarChart3, CheckCircle, Clock, FileText, AlertCircle
} from 'lucide-react';

export default function TeacherDashboard() {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('exams');
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [stats, setStats] = useState({ total: 0, published: 0, draft: 0 });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showAddQuestions, setShowAddQuestions] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [examResults, setExamResults] = useState(null);

  // Form states
  const [createForm, setCreateForm] = useState({ title: '', description: '', type: 'TEST', duration: 30, totalMarks: 50, passMark: 25, startDate: '', endDate: '', resultVisibility: 'IMMEDIATE', assignmentId: '' });
  const [questionForm, setQuestionForm] = useState([{ question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 }]);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadExamId, setUploadExamId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [examsRes, assignRes] = await Promise.all([
        api.get('/exams/teacher'),
        api.get('/admin/assignments'),
      ]);
      const examList = examsRes.data.exams || [];
      setExams(examList);
      setStats({ total: examList.length, published: examList.filter(e => e.status === 'PUBLISHED').length, draft: examList.filter(e => e.status === 'DRAFT').length });

      // Get assignments for this teacher
      const myAssignments = (assignRes.data || []).filter(a => a.teacherId === user?.id);
      setAssignments(myAssignments);
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  }, [user?.id]);

  const fetchResults = useCallback(async () => {
    try {
      const { data } = await api.get('/results/teacher');
      setResults(data.results || []);
    } catch { toast.error('Failed to load results'); }
  }, []);

  useEffect(() => { fetchData(); fetchResults(); }, [fetchData, fetchResults]);

  const handleCreateExam = async (e) => {
    e.preventDefault();
    try {
      await api.post('/exams', createForm);
      toast.success('Exam created successfully!');
      setShowCreate(false);
      setCreateForm({ title: '', description: '', type: 'TEST', duration: 30, totalMarks: 50, passMark: 25, startDate: '', endDate: '', resultVisibility: 'IMMEDIATE', assignmentId: '' });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create exam'); }
  };

  const handlePublishExam = async (id) => {
    try {
      await api.patch(`/exams/${id}/publish`);
      toast.success('Exam published!');
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to publish'); }
  };

  const handleAddQuestions = async (e) => {
    e.preventDefault();
    try {
      await api.post('/questions/manual', { examId: selectedExam?.id, questions: questionForm.filter(q => q.question) });
      toast.success(`${questionForm.filter(q => q.question).length} questions added!`);
      setShowAddQuestions(false);
      setSelectedExam(null);
      setQuestionForm([{ question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 }]);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add questions'); }
  };

  const handleCSVUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) { toast.error('Select a CSV file'); return; }
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('examId', uploadExamId);
      await api.post('/questions/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Questions uploaded!');
      setShowUpload(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Upload failed'); }
  };

  const handleExport = (examId, format = 'csv') => {
    const baseUrl = import.meta.env.VITE_API_URL || 'https://resco-cbt-jwtsecret.up.railway.app/api';
    window.open(baseUrl + '/results/export/' + examId + '?format=' + format, '_blank');
  };

  const viewExamResults = async (examId) => {
    try {
      const { data } = await api.get(`/results/teacher/${examId}/details`);
      setExamResults(data);
      setActiveTab('result-detail');
    } catch { toast.error('Failed to load exam results'); }
  };

  // === RENDER ===
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center"><BookOpen className="w-5 h-5 text-white" /></div>
            <div><h1 className="font-bold text-gray-800">RESCO CBT</h1><p className="text-xs text-gray-500">Teacher Portal</p></div>
          </div>
          <div className="flex items-center gap-3">
            <LiveClock compact />
            <span className="text-sm text-gray-600">Hello, <b>{user?.firstName}</b></span>
            <button onClick={() => { logout(); window.location.href = '/'; }} className="text-gray-400 hover:text-red-500"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          {[
            { icon: FileText, label: 'Total Exams', value: stats.total, color: 'blue' },
            { icon: Eye, label: 'Published', value: stats.published, color: 'green' },
            { icon: Edit3, label: 'Drafts', value: stats.draft, color: 'yellow' },
            { icon: Users, label: 'Assignments', value: assignments.length, color: 'purple' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="card flex items-center gap-4">
              <div className={`w-12 h-12 bg-${color}-100 rounded-xl flex items-center justify-center`}><Icon className={`w-6 h-6 text-${color}-600`} /></div>
              <div><p className="text-2xl font-bold">{value}</p><p className="text-sm text-gray-500">{label}</p></div>
            </div>
          ))}
        </div>

        {/* Daily Devotional */}
        <div className="mb-4">
          <DailyDevotional />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mb-4">
          {['exams', 'results', 'result-detail'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${activeTab === tab ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border'}`}>
              {tab === 'exams' ? 'My Exams' : tab === 'results' ? 'All Results' : 'Exam Details'}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Exam</button>
          <button onClick={() => setShowUpload(true)} className="btn-success flex items-center gap-2"><Upload className="w-4 h-4" /> Upload CSV</button>
        </div>

        {/* EXAMS TAB */}
        {activeTab === 'exams' && (
          loading ? <p className="text-center py-12 text-gray-400">Loading...</p> :
          exams.length === 0 ? <div className="card text-center py-12"><FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No exams yet. Create one!</p></div> :
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50"><tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Title</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Subject</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Questions</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
              </tr></thead>
              <tbody className="divide-y">
                {exams.map(exam => (
                  <tr key={exam.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><p className="text-sm font-medium text-gray-800">{exam.title}</p><p className="text-xs text-gray-400">{exam.type} | {exam.duration}min</p></td>
                    <td className="px-4 py-3 text-sm text-gray-600">{exam.assignment?.subject} ({exam.assignment?.className})</td>
                    <td className="px-4 py-3 text-sm text-center">{exam._count?.questions || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge ${exam.status === 'PUBLISHED' ? 'badge-green' : exam.status === 'DRAFT' ? 'badge-yellow' : 'badge-gray'}`}>{exam.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {exam.status === 'DRAFT' && (
                          <>
                            <button onClick={() => { setSelectedExam(exam); setShowAddQuestions(true); }} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded" title="Add Questions"><Plus className="w-4 h-4" /></button>
                            <button onClick={() => handlePublishExam(exam.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Publish"><CheckCircle className="w-4 h-4" /></button>
                          </>
                        )}
                        <button onClick={() => viewExamResults(exam.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="View Results"><BarChart3 className="w-4 h-4" /></button>
                        <button onClick={() => handleExport(exam.id, 'csv')} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded" title="Export CSV"><Download className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* RESULTS TAB */}
        {activeTab === 'results' && (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50"><tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Student</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Exam</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Score</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Percentage</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Date</th>
              </tr></thead>
              <tbody className="divide-y">
                {results.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{r.student?.firstName} {r.student?.lastName}<br /><span className="text-xs text-gray-400">{r.student?.admissionNo}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-800">{r.exam?.title}</td>
                    <td className="px-4 py-3 text-sm text-center">{r.score}/{r.totalMarks}</td>
                    <td className="px-4 py-3 text-sm text-center font-medium">{r.percentage}%</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{new Date(r.submittedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* EXAM RESULT DETAIL TAB */}
        {activeTab === 'result-detail' && examResults && (
          <div>
            <button onClick={() => setActiveTab('results')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"><ChevronUp className="w-4 h-4" /> Back to Results</button>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="card text-center"><p className="text-sm text-gray-500">Students</p><p className="text-2xl font-bold">{examResults.summary?.totalStudents}</p></div>
              <div className="card text-center"><p className="text-sm text-gray-500">Average</p><p className="text-2xl font-bold text-primary-600">{examResults.summary?.average}%</p></div>
              <div className="card text-center"><p className="text-sm text-gray-500">Pass Rate</p><p className="text-2xl font-bold text-green-600">{examResults.summary?.passRate}%</p></div>
              <div className="card text-center"><p className="text-sm text-gray-500">Questions</p><p className="text-2xl font-bold">{examResults.questionStats?.length}</p></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card">
                <h3 className="font-semibold mb-3">Student Rankings</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {examResults.results?.map((r, i) => (
                    <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <div><p className="text-sm font-medium">{r.student?.firstName} {r.student?.lastName}</p><p className="text-xs text-gray-400">{r.student?.admissionNo}</p></div>
                      </div>
                      <span className="font-bold text-sm">{r.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <h3 className="font-semibold mb-3">Question Analysis</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {examResults.questionStats?.map(qs => (
                    <div key={qs.questionId} className="p-2 rounded-lg bg-gray-50">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-sm text-gray-700 truncate flex-1 mr-2">{qs.question}</p>
                        <span className="text-xs font-medium">{qs.correctRate}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2"><div className={`h-2 rounded-full ${qs.correctRate >= 70 ? 'bg-green-500' : qs.correctRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${qs.correctRate}%` }} /></div>
                      <p className="text-xs text-gray-400 mt-1">{qs.correctCount}/{qs.totalAttempts} correct</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* CREATE EXAM MODAL */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto relative">
            <button onClick={() => setShowCreate(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-bold mb-4">Create New Exam</h2>
            <form onSubmit={handleCreateExam} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Title</label><input type="text" value={createForm.title} onChange={e => setCreateForm({ ...createForm, title: e.target.value })} className="input-field" required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })} className="input-field" rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Assignment</label><select value={createForm.assignmentId} onChange={e => setCreateForm({ ...createForm, assignmentId: e.target.value })} className="input-field" required><option value="">Select...</option>{assignments.map(a => <option key={a.id} value={a.id}>{a.subject} - {a.className}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label><select value={createForm.type} onChange={e => setCreateForm({ ...createForm, type: e.target.value })} className="input-field"><option value="TEST">Test</option><option value="EXAM">Exam</option></select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label><input type="number" value={createForm.duration} onChange={e => setCreateForm({ ...createForm, duration: parseInt(e.target.value) })} className="input-field" min="5" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Total Marks</label><input type="number" value={createForm.totalMarks} onChange={e => setCreateForm({ ...createForm, totalMarks: parseInt(e.target.value) })} className="input-field" min="1" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Pass Mark</label><input type="number" value={createForm.passMark} onChange={e => setCreateForm({ ...createForm, passMark: parseInt(e.target.value) })} className="input-field" min="1" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label><input type="datetime-local" value={createForm.startDate} onChange={e => setCreateForm({ ...createForm, startDate: e.target.value })} className="input-field" required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">End Date</label><input type="datetime-local" value={createForm.endDate} onChange={e => setCreateForm({ ...createForm, endDate: e.target.value })} className="input-field" required /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Result Visibility</label><select value={createForm.resultVisibility} onChange={e => setCreateForm({ ...createForm, resultVisibility: e.target.value })} className="input-field"><option value="IMMEDIATE">Immediate</option><option value="AFTER_CLOSE">After Exam Closes</option></select></div>
              <button type="submit" className="w-full btn-primary py-3">Create Exam</button>
            </form>
          </div>
        </div>
      )}

      {/* ADD QUESTIONS MODAL */}
      {showAddQuestions && selectedExam && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto relative">
            <button onClick={() => setShowAddQuestions(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-bold mb-1">Add Questions</h2>
            <p className="text-sm text-gray-500 mb-4">Exam: {selectedExam.title}</p>
            <form onSubmit={handleAddQuestions} className="space-y-4">
              {questionForm.map((q, i) => (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Question {i + 1}</span>
                    {questionForm.length > 1 && <button type="button" onClick={() => setQuestionForm(questionForm.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                  <textarea value={q.question} onChange={e => { const updated = [...questionForm]; updated[i] = { ...updated[i], question: e.target.value }; setQuestionForm(updated); }} className="input-field" rows={2} placeholder="Enter question..." required />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2"><span className="w-6 h-6 bg-primary-100 text-primary-700 rounded text-xs font-bold flex items-center justify-center">A</span><input type="text" value={q.optionA} onChange={e => { const updated = [...questionForm]; updated[i] = { ...updated[i], optionA: e.target.value }; setQuestionForm(updated); }} className="input-field flex-1" placeholder="Option A" required /></div>
                    <div className="flex items-center gap-2"><span className="w-6 h-6 bg-primary-100 text-primary-700 rounded text-xs font-bold flex items-center justify-center">B</span><input type="text" value={q.optionB} onChange={e => { const updated = [...questionForm]; updated[i] = { ...updated[i], optionB: e.target.value }; setQuestionForm(updated); }} className="input-field flex-1" placeholder="Option B" required /></div>
                    <div className="flex items-center gap-2"><span className="w-6 h-6 bg-primary-100 text-primary-700 rounded text-xs font-bold flex items-center justify-center">C</span><input type="text" value={q.optionC} onChange={e => { const updated = [...questionForm]; updated[i] = { ...updated[i], optionC: e.target.value }; setQuestionForm(updated); }} className="input-field flex-1" placeholder="Option C" required /></div>
                    <div className="flex items-center gap-2"><span className="w-6 h-6 bg-primary-100 text-primary-700 rounded text-xs font-bold flex items-center justify-center">D</span><input type="text" value={q.optionD} onChange={e => { const updated = [...questionForm]; updated[i] = { ...updated[i], optionD: e.target.value }; setQuestionForm(updated); }} className="input-field flex-1" placeholder="Option D" required /></div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2"><label className="text-sm text-gray-600">Answer:</label><select value={q.answer} onChange={e => { const updated = [...questionForm]; updated[i] = { ...updated[i], answer: e.target.value }; setQuestionForm(updated); }} className="input-field w-20"><option>A</option><option>B</option><option>C</option><option>D</option></select></div>
                    <div className="flex items-center gap-2"><label className="text-sm text-gray-600">Marks:</label><input type="number" value={q.marks} onChange={e => { const updated = [...questionForm]; updated[i] = { ...updated[i], marks: parseInt(e.target.value) || 1 }; setQuestionForm(updated); }} className="input-field w-20" min="1" /></div>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <button type="button" onClick={() => setQuestionForm([...questionForm, { question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', marks: 1 }])} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Question</button>
                <button type="submit" className="btn-success flex-1">Save All Questions</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV UPLOAD MODAL */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button onClick={() => setShowUpload(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-bold mb-4">Upload Questions (CSV)</h2>
            <form onSubmit={handleCSVUpload} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Select Exam</label><select value={uploadExamId} onChange={e => setUploadExamId(e.target.value)} className="input-field" required><option value="">Select draft exam...</option>{exams.filter(e => e.status === 'DRAFT').map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <input type="file" accept=".csv" onChange={e => setUploadFile(e.target.files[0])} className="hidden" id="csv-upload" />
                <label htmlFor="csv-upload" className="cursor-pointer text-primary-600 hover:text-primary-700 text-sm font-medium">{uploadFile ? uploadFile.name : 'Click to select CSV file'}</label>
                <p className="text-xs text-gray-400 mt-1">CSV format: question, optionA, optionB, optionC, optionD, answer, marks</p>
              </div>
              <button type="submit" className="w-full btn-primary py-3">Upload</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
