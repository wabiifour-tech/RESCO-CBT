import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import { LogOut, UserPlus, X, GraduationCap, BookOpen, Shield } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('STUDENT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSignup, setShowSignup] = useState(false);
  const [signupForm, setSignupForm] = useState({ email: '', password: '', firstName: '', lastName: '', subjects: '' });
  const [signupLoading, setSignupLoading] = useState(false);
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (!data.success) { setError(data.message); return; }
      // Check teacher status
      if (data.user.role === 'TEACHER' && data.user.status === 'PENDING') {
        setError('Your account is pending admin approval. Please wait.');
        return;
      }
      if (data.user.role === 'TEACHER' && data.user.status === 'REJECTED') {
        setError('Your registration was rejected. Please contact the admin.');
        return;
      }
      setUser(data.user, data.token);
      toast.success(`Welcome, ${data.user.firstName || data.user.email}!`);
      navigate(`/${data.user.role.toLowerCase()}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Check your credentials.');
    } finally { setLoading(false); }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setSignupLoading(true);
    try {
      const { data } = await api.post('/auth/teacher-signup', {
        ...signupForm,
        subjects: signupForm.subjects.split(',').map(s => s.trim()).filter(Boolean),
      });
      if (data.success) {
        toast.success(data.message || 'Registration successful! Waiting for admin approval.');
        setShowSignup(false);
        setSignupForm({ email: '', password: '', firstName: '', lastName: '', subjects: '' });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed.');
    } finally { setSignupLoading(false); }
  };

  const roles = [
    { key: 'STUDENT', label: 'Student', icon: GraduationCap },
    { key: 'TEACHER', label: 'Teacher', icon: BookOpen },
    { key: 'ADMIN', label: 'Admin', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-900 flex items-center justify-center p-4">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/5 rounded-full" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-white/3 rounded-full" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur rounded-2xl mb-4">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">RESCO CBT</h1>
          <p className="text-blue-200 mt-1">Redeemer's Schools and College, Owotoro</p>
          <p className="text-blue-300 text-sm mt-1">Computer-Based Testing System</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Role Tabs */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            {roles.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setRole(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-sm font-medium transition-all ${
                  role === key ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="input-field" placeholder="you@resco.edu.ng" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="input-field" placeholder="Enter your password" required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {role === 'TEACHER' && (
            <div className="mt-4 text-center">
              <button onClick={() => setShowSignup(true)}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 mx-auto">
                <UserPlus className="w-4 h-4" /> Register as Teacher
              </button>
            </div>
          )}

          {/* Demo Credentials */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2 text-center">Demo Credentials</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="font-medium text-gray-700">Student</p>
                <p className="text-gray-500">john@resco.edu.ng</p>
                <p className="text-gray-500">student123</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="font-medium text-gray-700">Teacher</p>
                <p className="text-gray-500">adeyemi@resco.edu.ng</p>
                <p className="text-gray-500">teacher123</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="font-medium text-gray-700">Admin</p>
                <p className="text-gray-500">admin@resco.edu.ng</p>
                <p className="text-gray-500">admin123</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Teacher Signup Modal */}
      {showSignup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative">
            <button onClick={() => setShowSignup(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-gray-800 mb-1">Teacher Registration</h2>
            <p className="text-sm text-gray-500 mb-6">Fill in your details. Admin will approve your account.</p>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input type="text" value={signupForm.firstName} onChange={(e) => setSignupForm({ ...signupForm, firstName: e.target.value })}
                    className="input-field" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input type="text" value={signupForm.lastName} onChange={(e) => setSignupForm({ ...signupForm, lastName: e.target.value })}
                    className="input-field" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={signupForm.email} onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                  className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" value={signupForm.password} onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                  className="input-field" minLength={6} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subjects (comma-separated)</label>
                <input type="text" value={signupForm.subjects} onChange={(e) => setSignupForm({ ...signupForm, subjects: e.target.value })}
                  className="input-field" placeholder="Mathematics, Physics, Chemistry" required />
              </div>
              <button type="submit" disabled={signupLoading}
                className="w-full btn-primary py-3 flex items-center justify-center gap-2">
                {signupLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><UserPlus className="w-4 h-4" /> Register</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
