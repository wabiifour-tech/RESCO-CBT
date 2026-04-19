import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import { LogOut, UserPlus, X, GraduationCap, BookOpen, Shield, Sparkles, BookOpenCheck } from 'lucide-react';

/* ── Inline keyframe styles for animations not in index.css ── */
const animStyles = {
  fadeInUp: {
    animation: 'fadeInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
  },
  fadeIn: {
    animation: 'fadeIn 0.6s ease-out both',
  },
  floatSlow: {
    animation: 'float 6s ease-in-out infinite',
  },
  floatMed: {
    animation: 'float 4s ease-in-out infinite 1s',
  },
  floatFast: {
    animation: 'float 5s ease-in-out infinite 0.5s',
  },
  floatBlob1: {
    animation: 'morphBlob 10s ease-in-out infinite',
  },
  floatBlob2: {
    animation: 'morphBlob 12s ease-in-out infinite 2s',
  },
  floatBlob3: {
    animation: 'morphBlob 8s ease-in-out infinite 4s',
  },
  shimmer: {
    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.25) 45%, rgba(255,255,255,0.25) 50%, transparent 55%)',
    backgroundSize: '200% 100%',
    backgroundPosition: '200% 0',
  },
  gradientText: {
    background: 'linear-gradient(135deg, #c084fc, #818cf8, #6366f1, #a78bfa)',
    backgroundSize: '200% auto',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    animation: 'animatedGradient 4s linear infinite',
  },
  sparkle1: {
    animation: 'sparkle 2s ease-in-out infinite',
  },
  sparkle2: {
    animation: 'sparkle 2s ease-in-out infinite 0.7s',
  },
  sparkle3: {
    animation: 'sparkle 2s ease-in-out infinite 1.4s',
  },
  shake: {
    animation: 'shake 0.5s ease-in-out',
  },
  scaleIn: {
    animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
  },
  slideDown: {
    animation: 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
  },
  gradientBg: {
    background: 'linear-gradient(-45deg, #7c3aed, #6366f1, #4f46e5, #8b5cf6, #a855f7, #6d28d9)',
    backgroundSize: '400% 400%',
    animation: 'animatedGradient 8s ease infinite',
  },
  glowPulse: {
    animation: 'glowPulse 3s ease-in-out infinite',
  },
  logoFloat: {
    animation: 'float 4s ease-in-out infinite',
  },
  wobble: {
    animation: 'wiggle 2s ease-in-out infinite',
  },
};

/* Inject keyframes into the document once */
const injectKeyframes = () => {
  if (document.getElementById('login-keyframes')) return;
  const style = document.createElement('style');
  style.id = 'login-keyframes';
  style.textContent = `
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(30px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      25%      { transform: translateY(-15px) rotate(1deg); }
      75%      { transform: translateY(8px) rotate(-1deg); }
    }
    @keyframes morphBlob {
      0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
      25%      { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
      50%      { border-radius: 50% 60% 30% 60% / 30% 60% 70% 40%; }
      75%      { border-radius: 60% 40% 60% 30% / 60% 40% 30% 70%; }
    }
    @keyframes sparkle {
      0%, 100% { opacity: 0.3; transform: scale(0.6) rotate(0deg); }
      50%      { opacity: 1;   transform: scale(1.2) rotate(180deg); }
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
      20%, 40%, 60%, 80%     { transform: translateX(5px); }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.9); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes animatedGradient {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes glowPulse {
      0%, 100% { box-shadow: 0 0 20px rgba(255,255,255,0.1); }
      50%      { box-shadow: 0 0 40px rgba(255,255,255,0.2), 0 0 80px rgba(139,92,246,0.15); }
    }
    @keyframes wiggle {
      0%, 100% { transform: rotate(0deg); }
      25%      { transform: rotate(-3deg); }
      75%      { transform: rotate(3deg); }
    }
  `;
  document.head.appendChild(style);
};

const roles = [
  { key: 'STUDENT', label: 'Student', icon: GraduationCap, color: 'from-violet-500 to-purple-600', ring: 'ring-violet-300', text: 'text-violet-700', bg: 'bg-violet-500' },
  { key: 'TEACHER', label: 'Teacher', icon: BookOpen, color: 'from-blue-500 to-indigo-600', ring: 'ring-blue-300', text: 'text-blue-700', bg: 'bg-blue-500' },
  { key: 'ADMIN', label: 'Admin', icon: Shield, color: 'from-emerald-500 to-green-600', ring: 'ring-emerald-300', text: 'text-emerald-700', bg: 'bg-emerald-500' },
];

export default function LoginPage() {
  const [role, setRole] = useState('STUDENT');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [signupForm, setSignupForm] = useState({
    firstName: '', lastName: '', email: '', password: '', subjects: '',
  });
  const [signupLoading, setSignupLoading] = useState(false);

  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  injectKeyframes();

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 600);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let payload;
      if (role === 'ADMIN') {
        payload = { email, password };
      } else {
        payload = { fullName: name, password };
      }

      const { data } = await api.post('/auth/login', payload);

      if (!data.success) {
        setError(data.message || 'Login failed');
        triggerShake();
        return;
      }

      // Check teacher status
      if (data.user.role === 'TEACHER' && data.user.status === 'PENDING') {
        setError('Your account is pending admin approval. Please wait.');
        triggerShake();
        return;
      }
      if (data.user.role === 'TEACHER' && data.user.status === 'REJECTED') {
        setError('Your registration was rejected. Please contact the admin.');
        triggerShake();
        return;
      }

      setUser(data.user, data.token);
      const displayName = data.user.firstName || data.user.fullName || data.user.email || '';
      toast.success(`Welcome, ${displayName}! 🎉`, {
        style: {
          background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
          color: '#fff',
          fontWeight: '700',
          borderRadius: '12px',
        },
        iconTheme: { primary: '#fbbf24', secondary: '#fff' },
      });

      const rolePath = data.user.role.toLowerCase();
      navigate(`/${rolePath}`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please check your credentials.';
      setError(msg);
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setSignupLoading(true);
    try {
      const { data } = await api.post('/auth/teacher-signup', {
        ...signupForm,
        subjects: signupForm.subjects.split(',').map((s) => s.trim()).filter(Boolean),
      });
      if (data.success) {
        toast.success(data.message || 'Registration successful! Waiting for admin approval.', {
          style: {
            background: 'linear-gradient(135deg, #059669, #10b981)',
            color: '#fff',
            fontWeight: '700',
            borderRadius: '12px',
          },
        });
        setShowSignup(false);
        setSignupForm({ firstName: '', lastName: '', email: '', password: '', subjects: '' });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed.');
    } finally {
      setSignupLoading(false);
    }
  };

  const updateSignupField = (field, value) => {
    setSignupForm((prev) => ({ ...prev, [field]: value }));
  };

  const activeRole = roles.find((r) => r.key === role);

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden" style={animStyles.gradientBg}>

      {/* ── Background Decorative Blobs ──────────────── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Blob 1 */}
        <div
          className="absolute -top-32 -right-32 w-[420px] h-[420px] bg-white/[0.06]"
          style={animStyles.floatBlob1}
        />
        {/* Blob 2 */}
        <div
          className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-white/[0.05]"
          style={animStyles.floatBlob2}
        />
        {/* Blob 3 */}
        <div
          className="absolute top-1/3 left-1/4 w-[200px] h-[200px] bg-pink-400/[0.08]"
          style={animStyles.floatBlob3}
        />
        {/* Blob 4 */}
        <div
          className="absolute bottom-1/4 right-1/3 w-[160px] h-[160px] bg-cyan-400/[0.08]"
          style={{ ...animStyles.floatBlob2, animationDelay: '3s' }}
        />

        {/* Sparkle dots */}
        <div className="absolute top-[15%] left-[10%] w-3 h-3 rounded-full bg-yellow-300/60" style={animStyles.sparkle1} />
        <div className="absolute top-[25%] right-[15%] w-2 h-2 rounded-full bg-pink-300/70" style={animStyles.sparkle2} />
        <div className="absolute bottom-[30%] left-[20%] w-2.5 h-2.5 rounded-full bg-cyan-300/60" style={animStyles.sparkle3} />
        <div className="absolute top-[60%] right-[8%] w-2 h-2 rounded-full bg-emerald-300/60" style={{ ...animStyles.sparkle1, animationDelay: '2s' }} />
        <div className="absolute bottom-[15%] right-[25%] w-3 h-3 rounded-full bg-violet-300/50" style={{ ...animStyles.sparkle2, animationDelay: '1s' }} />

        {/* Floating shapes */}
        <div className="absolute top-[10%] right-[30%] w-8 h-8 border-2 border-white/10 rotate-45 rounded-md" style={animStyles.floatSlow} />
        <div className="absolute bottom-[20%] left-[8%] w-6 h-6 border-2 border-white/10 rounded-full" style={animStyles.floatMed} />
        <div className="absolute top-[50%] right-[10%] w-5 h-5 bg-white/5 rotate-12 rounded-lg" style={animStyles.floatFast} />
      </div>

      {/* ── Main Container ────────────────────────────── */}
      <div className="relative w-full max-w-md z-10">

        {/* ── Header / Logo Section ─────────────────── */}
        <div className="text-center mb-8" style={{ ...animStyles.fadeInUp, animationDelay: '0.1s' }}>
          {/* Logo */}
          <div
            className="inline-flex items-center justify-center w-24 h-24 rounded-2xl mb-5 overflow-hidden bg-white/15 backdrop-blur-md border border-white/20"
            style={animStyles.logoFloat}
          >
            <img src="/logo.png" alt="RESCO Logo" className="w-full h-full object-contain p-2 drop-shadow-lg" />
          </div>

          {/* Title */}
          <h1 className="text-4xl font-extrabold tracking-tight mb-2" style={animStyles.gradientText}>
            RESCO CBT
          </h1>

          {/* Subtitle */}
          <p className="text-blue-200/90 text-base font-medium mb-1">
            Redeemer&apos;s Schools and College, Owotoro
          </p>

          {/* Tagline */}
          <div className="flex items-center justify-center gap-2 mt-2">
            <Sparkles className="w-4 h-4 text-yellow-300" style={animStyles.sparkle1} />
            <span className="text-blue-300/80 text-sm font-semibold tracking-wide">
              Computer-Based Testing System
            </span>
            <Sparkles className="w-4 h-4 text-yellow-300" style={animStyles.sparkle2} />
          </div>
        </div>

        {/* ── Login Card ────────────────────────────── */}
        <div
          className="bg-white/[0.12] backdrop-blur-2xl rounded-3xl border border-white/20 p-8 shadow-2xl"
          style={{ ...animStyles.fadeInUp, animationDelay: '0.3s', ...animStyles.glowPulse }}
        >
          {/* Inner card with subtle gradient */}
          <div className="bg-white/90 rounded-2xl p-6 -m-0">
            {/* Role Tabs */}
            <div className="flex bg-gray-100/80 rounded-xl p-1 mb-6 gap-1">
              {roles.map(({ key, label, icon: Icon, color, ring, text, bg }) => {
                const isActive = role === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setRole(key);
                      setError('');
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 cursor-pointer
                      ${isActive
                        ? `bg-gradient-to-r ${color} text-white shadow-lg scale-[1.02]`
                        : `text-gray-500 hover:text-gray-700 hover:bg-gray-200/60`
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Active role indicator */}
            <div className="flex items-center justify-center gap-2 mb-5">
              {(() => {
                const Icon = activeRole.icon;
                return (
                  <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200/60">
                    <Icon className="w-4 h-4" style={{ color: role === 'STUDENT' ? '#8b5cf6' : role === 'TEACHER' ? '#3b82f6' : '#10b981' }} />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      {role === 'STUDENT' ? 'Student Login' : role === 'TEACHER' ? 'Teacher Login' : 'Admin Login'}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Error Message */}
            {error && (
              <div
                className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-medium flex items-start gap-2"
                style={shaking ? animStyles.shake : undefined}
              >
                <span className="text-lg leading-none mt-[-1px]">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Full Name field (for STUDENT / TEACHER) */}
              {role !== 'ADMIN' && (
                <div style={animStyles.slideDown}>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <BookOpenCheck className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input-field pl-10"
                      placeholder="Enter your full name"
                      required
                      autoComplete="name"
                    />
                  </div>
                </div>
              )}

              {/* Email field (for ADMIN) */}
              {role === 'ADMIN' && (
                <div style={animStyles.slideDown}>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Shield className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field pl-10"
                      placeholder="admin@resco.edu.ng"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>
              )}

              {/* Password field */}
              <div style={{ ...animStyles.slideDown, animationDelay: '0.1s' }}>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-10"
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-bold text-white text-sm
                  bg-gradient-to-r from-violet-600 to-indigo-600
                  hover:from-violet-500 hover:to-indigo-500
                  active:scale-[0.97] active:shadow-inner
                  shadow-lg shadow-violet-500/30 hover:shadow-xl hover:shadow-violet-500/40
                  focus:outline-none focus:ring-4 focus:ring-violet-300
                  disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
                  transition-all duration-200 cursor-pointer
                  relative overflow-hidden"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 rounded-full border-[3px] border-white/30 border-t-white" style={{ animation: 'spin 0.8s linear infinite' }} />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {role === 'STUDENT' && <GraduationCap className="w-5 h-5" />}
                    {role === 'TEACHER' && <BookOpen className="w-5 h-5" />}
                    {role === 'ADMIN' && <Shield className="w-5 h-5" />}
                    Sign In
                  </span>
                )}
              </button>
            </form>

            {/* Teacher Registration Link */}
            {role === 'TEACHER' && (
              <div className="mt-5 text-center" style={animStyles.fadeIn}>
                <button
                  type="button"
                  onClick={() => setShowSignup(true)}
                  className="text-sm text-violet-600 hover:text-violet-700 font-bold flex items-center gap-1.5 mx-auto
                    transition-colors duration-200 hover:gap-2.5 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Register as Teacher
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────── */}
        <p className="text-center text-blue-300/50 text-xs mt-6 font-medium" style={animStyles.fadeIn}>
          © {new Date().getFullYear()} Redeemer&apos;s Schools and College, Owotoro
        </p>
      </div>

      {/* ── Teacher Signup Modal ─────────────────────── */}
      {showSignup && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowSignup(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full relative overflow-hidden"
            style={animStyles.scaleIn}
          >
            {/* Modal header accent bar */}
            <div className="h-2 bg-gradient-to-r from-blue-500 via-violet-500 to-purple-500" />

            <div className="p-8">
              {/* Close button */}
              <button
                type="button"
                onClick={() => setShowSignup(false)}
                className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Modal title */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-gray-800">Teacher Registration</h2>
                  <p className="text-sm text-gray-500 font-medium">Your account will need admin approval</p>
                </div>
              </div>

              <div className="mt-6 border-t border-gray-100 pt-6">
                <form onSubmit={handleSignup} className="space-y-4">
                  {/* Name fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">First Name</label>
                      <input
                        type="text"
                        value={signupForm.firstName}
                        onChange={(e) => updateSignupField('firstName', e.target.value)}
                        className="input-field"
                        placeholder="John"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">Last Name</label>
                      <input
                        type="text"
                        value={signupForm.lastName}
                        onChange={(e) => updateSignupField('lastName', e.target.value)}
                        className="input-field"
                        placeholder="Doe"
                        required
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Email</label>
                    <input
                      type="email"
                      value={signupForm.email}
                      onChange={(e) => updateSignupField('email', e.target.value)}
                      className="input-field"
                      placeholder="teacher@resco.edu.ng"
                      required
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Password</label>
                    <input
                      type="password"
                      value={signupForm.password}
                      onChange={(e) => updateSignupField('password', e.target.value)}
                      className="input-field"
                      placeholder="Min 6 characters"
                      minLength={6}
                      required
                    />
                  </div>

                  {/* Subjects */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Subjects (comma-separated)</label>
                    <input
                      type="text"
                      value={signupForm.subjects}
                      onChange={(e) => updateSignupField('subjects', e.target.value)}
                      className="input-field"
                      placeholder="Mathematics, Physics, Chemistry"
                      required
                    />
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={signupLoading}
                    className="w-full py-3.5 rounded-xl font-bold text-white text-sm
                      bg-gradient-to-r from-blue-500 to-indigo-600
                      hover:from-blue-400 hover:to-indigo-500
                      active:scale-[0.97]
                      shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40
                      focus:outline-none focus:ring-4 focus:ring-blue-300
                      disabled:opacity-60 disabled:cursor-not-allowed
                      transition-all duration-200 cursor-pointer"
                  >
                    {signupLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-5 h-5 rounded-full border-[3px] border-white/30 border-t-white" style={{ animation: 'spin 0.8s linear infinite' }} />
                        Registering...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <UserPlus className="w-4 h-4" />
                        Register
                      </span>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
