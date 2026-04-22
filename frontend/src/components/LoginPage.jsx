import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import { LogOut, GraduationCap, BookOpen, Shield, Sparkles, BookOpenCheck, User, Lock, ChevronLeft, ChevronRight, MapPin, Phone, Mail, Globe, Award, Hash, Crown } from 'lucide-react';
import LiveClock from './LiveClock';
import DailyDevotional from './DailyDevotional';

/* ── School info slides for the marquee ── */
const SCHOOL_FACTS = [
  { icon: Award, text: "Academic Excellence in WASSCE & NECO" },
  { icon: BookOpen, text: "Leading Faith-Based Institution in Oyo State" },
  { icon: Globe, text: "Modern ICT & Computer-Based Testing Center" },
  { icon: Sparkles, text: "Comprehensive Boarding & Day School Facilities" },
  { icon: GraduationCap, text: "Holistic Development: Academic, Moral & Spiritual" },
  { icon: MapPin, text: "Located at Owotoro, Agunrege - Ago Are Road, Saki" },
];

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
    @keyframes slideMarquee {
      0%   { transform: translateX(100%); }
      100% { transform: translateX(-100%); }
    }
    @keyframes marqueeFade {
      0%, 100% { opacity: 0; }
      10%, 90% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
};

const roles = [
  { key: 'STUDENT', label: 'Student', icon: GraduationCap, color: 'from-violet-500 to-purple-600' },
  { key: 'TEACHER', label: 'Teacher', icon: BookOpen, color: 'from-blue-500 to-indigo-600' },
  { key: 'ADMIN', label: 'Admin', icon: Shield, color: 'from-emerald-500 to-green-600' },
  { key: 'PRINCIPAL', label: 'Principal', icon: Crown, color: 'from-amber-500 to-yellow-600' },
];

export default function LoginPage() {
  const [role, setRole] = useState('STUDENT');
  const [loginField, setLoginField] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [factIndex, setFactIndex] = useState(0);
  const [studentLoginMode, setStudentLoginMode] = useState('name'); // 'name' or 'admissionNo'

  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  injectKeyframes();

  // Rotate school facts
  useEffect(() => {
    const interval = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % SCHOOL_FACTS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

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
      if (role === 'ADMIN' || role === 'PRINCIPAL') {
        payload = { email: loginField, password };
      } else if (role === 'TEACHER') {
        payload = { username: loginField, password };
      } else {
        if (studentLoginMode === 'admissionNo') {
          payload = { admissionNo: loginField, password };
        } else {
          payload = { fullName: loginField, password };
        }
      }

      const { data } = await api.post('/auth/login', payload);

      if (!data.success) {
        setError(data.message || 'Login failed');
        triggerShake();
        return;
      }

      setUser(data.user, data.token);
      const displayName = data.user.firstName
        || (data.user.student && (data.user.student.firstName + ' ' + data.user.student.lastName))
        || (data.user.teacher && (data.user.teacher.firstName + ' ' + data.user.teacher.lastName))
        || data.user.fullName
        || data.user.email || '';
      toast.success('Welcome, ' + displayName + '!', {
        style: {
          background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
          color: '#fff',
          fontWeight: '700',
          borderRadius: '12px',
        },
        iconTheme: { primary: '#fbbf24', secondary: '#fff' },
      });

      const rolePath = (data.user.role || 'STUDENT').toLowerCase();
      navigate('/' + rolePath);
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please check your credentials.';
      setError(msg);
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const activeRole = roles.find((r) => r.key === role);

  const getPlaceholder = () => {
    if (role === 'STUDENT') return studentLoginMode === 'admissionNo' ? 'Enter your admission number' : 'Enter your first and last name (e.g. John Doe)';
    if (role === 'TEACHER') return 'Enter your username';
    if (role === 'PRINCIPAL') return 'Enter principal email';
    return 'Enter admin email';
  };

  const getFieldLabel = () => {
    if (role === 'STUDENT') return studentLoginMode === 'admissionNo' ? 'Admission Number' : 'Full Name (First & Last)';
    if (role === 'TEACHER') return 'Username';
    return 'Email Address';
  };

  const getFieldIcon = () => {
    if (role === 'STUDENT') return studentLoginMode === 'admissionNo' ? Hash : BookOpenCheck;
    if (role === 'TEACHER') return User;
    if (role === 'PRINCIPAL') return Crown;
    return Shield;
  };

  const FieldIcon = getFieldIcon();
  const currentFact = SCHOOL_FACTS[factIndex];
  const FactIcon = currentFact.icon;

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden" style={animStyles.gradientBg}>

      {/* School Logo Watermark */}
      <div className="resco-watermark">
        <img src="/resco-logo.png" alt="" />
      </div>

      {/* Background Decorative Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-[420px] h-[420px] bg-white/[0.06]" style={animStyles.floatBlob1} />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-white/[0.05]" style={animStyles.floatBlob2} />
        <div className="absolute top-1/3 left-1/4 w-[200px] h-[200px] bg-pink-400/[0.08]" style={animStyles.floatBlob3} />
        <div className="absolute bottom-1/4 right-1/3 w-[160px] h-[160px] bg-cyan-400/[0.08]" style={{ ...animStyles.floatBlob2, animationDelay: '3s' }} />
        <div className="absolute top-[15%] left-[10%] w-3 h-3 rounded-full bg-yellow-300/60" style={animStyles.sparkle1} />
        <div className="absolute top-[25%] right-[15%] w-2 h-2 rounded-full bg-pink-300/70" style={animStyles.sparkle2} />
        <div className="absolute bottom-[30%] left-[20%] w-2.5 h-2.5 rounded-full bg-cyan-300/60" style={animStyles.sparkle3} />
        <div className="absolute top-[60%] right-[8%] w-2 h-2 rounded-full bg-emerald-300/60" style={{ ...animStyles.sparkle1, animationDelay: '2s' }} />
        <div className="absolute bottom-[15%] right-[25%] w-3 h-3 rounded-full bg-violet-300/50" style={{ ...animStyles.sparkle2, animationDelay: '1s' }} />
        <div className="absolute top-[10%] right-[30%] w-8 h-8 border-2 border-white/10 rotate-45 rounded-md" style={animStyles.floatSlow} />
        <div className="absolute bottom-[20%] left-[8%] w-6 h-6 border-2 border-white/10 rounded-full" style={animStyles.floatMed} />
        <div className="absolute top-[50%] right-[10%] w-5 h-5 bg-white/5 rotate-12 rounded-lg" style={animStyles.floatFast} />
      </div>

      {/* Main Container */}
      <div className="relative w-full max-w-md z-10">

        {/* Header / Logo Section */}
        <div className="text-center mb-6" style={{ ...animStyles.fadeInUp, animationDelay: '0.1s' }}>
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl mb-4 overflow-hidden bg-white/15 backdrop-blur-md border border-white/20" style={animStyles.logoFloat}>
            <img src="/resco-logo.png" alt="RESCO Logo" className="w-full h-full object-contain p-2 drop-shadow-lg" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-2" style={animStyles.gradientText}>RESCO CBT</h1>
          <p className="text-blue-200/90 text-base font-medium mb-1">Redeemer&apos;s Schools and College, Owotoro</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Sparkles className="w-4 h-4 text-yellow-300" style={animStyles.sparkle1} />
            <span className="text-blue-300/80 text-sm font-semibold tracking-wide">Computer-Based Testing System</span>
            <Sparkles className="w-4 h-4 text-yellow-300" style={animStyles.sparkle2} />
          </div>
        </div>

        {/* Live Clock */}
        <div className="flex justify-center mb-5" style={animStyles.fadeIn}>
          <LiveClock compact />
        </div>

        {/* Login Card */}
        <div className="bg-white/[0.12] backdrop-blur-2xl rounded-3xl border border-white/20 p-8 shadow-2xl" style={{ ...animStyles.fadeInUp, animationDelay: '0.3s', ...animStyles.glowPulse }}>
          <div className="bg-white/90 rounded-2xl p-6 -m-0">

            {/* Role Tabs */}
            <div className="flex bg-gray-100/80 rounded-xl p-1 mb-6 gap-1">
              {roles.map(({ key, label, icon: Icon, color }) => {
                const isActive = role === key;
                return (
                  <button key={key} type="button" onClick={() => { setRole(key); setError(''); setLoginField(''); }}
                    className={'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 cursor-pointer '
                      + (isActive ? 'bg-gradient-to-r ' + color + ' text-white shadow-lg scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60')}>
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Active role indicator */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200/60">
                {(() => { const Icon = activeRole.icon; const roleColor = role === 'STUDENT' ? '#8b5cf6' : role === 'TEACHER' ? '#3b82f6' : role === 'PRINCIPAL' ? '#d97706' : '#10b981'; const roleLabel = role === 'STUDENT' ? 'Student Login' : role === 'TEACHER' ? 'Teacher Login' : role === 'PRINCIPAL' ? 'Principal Login' : 'Admin Login'; return <><Icon className="w-4 h-4" style={{ color: roleColor }} /><span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{roleLabel}</span></>; })()}
              </div>
            </div>

            {/* Student login mode toggle */}
            {role === 'STUDENT' && (
              <div className="flex items-center justify-center gap-1 mb-4">
                <button type="button" onClick={() => { setStudentLoginMode('name'); setLoginField(''); setError(''); }}
                  className={'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ' + (studentLoginMode === 'name' ? 'bg-violet-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')}>
                  By Name
                </button>
                <span className="text-gray-300 text-xs">|</span>
                <button type="button" onClick={() => { setStudentLoginMode('admissionNo'); setLoginField(''); setError(''); }}
                  className={'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ' + (studentLoginMode === 'admissionNo' ? 'bg-violet-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')}>
                  By Admission No.
                </button>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-medium flex items-start gap-2" style={shaking ? animStyles.shake : undefined}>
                <span className="text-lg leading-none mt-[-1px]">!</span>
                <span>{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div style={animStyles.slideDown}>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">{getFieldLabel()}</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><FieldIcon className="w-4 h-4" /></div>
                  <input type={(role === 'ADMIN' || role === 'PRINCIPAL') ? 'email' : 'text'} value={loginField} onChange={(e) => setLoginField(e.target.value)}
                    className="input-field pl-10" placeholder={getPlaceholder()} required autoComplete="off" />
                </div>
              </div>

              <div style={{ ...animStyles.slideDown, animationDelay: '0.1s' }}>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-10" placeholder="Enter your password" required autoComplete="off" />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 active:scale-[0.97] shadow-lg shadow-violet-500/30 hover:shadow-xl hover:shadow-violet-500/40 focus:outline-none focus:ring-4 focus:ring-violet-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer relative overflow-hidden">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 rounded-full border-[3px] border-white/30 border-t-white" style={{ animation: 'spin 0.8s linear infinite' }} />Signing in...</span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {role === 'STUDENT' && <GraduationCap className="w-5 h-5" />}
                    {role === 'TEACHER' && <BookOpen className="w-5 h-5" />}
                    {role === 'ADMIN' && <Shield className="w-5 h-5" />}
                    {role === 'PRINCIPAL' && <Crown className="w-5 h-5" />}
                    Sign In
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* School Info Marquee */}
        <div style={{ ...animStyles.fadeIn, animationDelay: '0.6s' }} className="mt-5">
          <div style={{
            background: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(8px)',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.15)',
            padding: '10px 16px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              animation: 'fadeIn 0.5s ease both',
            }} key={factIndex}>
              <FactIcon size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
              <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {currentFact.text}
              </span>
            </div>
          </div>
        </div>

        {/* Daily Devotional */}
        <div className="mt-4" style={{ ...animStyles.fadeInUp, animationDelay: '0.8s' }}>
          <DailyDevotional />
        </div>

        {/* School Contact Info */}
        <div style={{ ...animStyles.fadeIn, animationDelay: '1s' }} className="mt-4">
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '6px 14px',
            fontSize: 11,
            color: 'rgba(191,219,254,0.7)',
            fontWeight: 500,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Globe size={11} /> rescoowotoro.schoolsfocus.net
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Phone size={11} /> 08069450697
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Mail size={11} /> redeemerscollegeowotoro@gmail.com
            </span>
          </div>
        </div>

        {/* School Image Banner */}
        <div className="mt-4" style={{ ...animStyles.fadeIn, animationDelay: '1.2s' }}>
          <div style={{
            borderRadius: 16,
            overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.15)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <img
              src="/resco-school1.jpg"
              alt="Redeemer's Schools and College, Owotoro"
              style={{
                width: '100%',
                height: 140,
                objectFit: 'cover',
                display: 'block',
              }}
            />
            <div style={{
              background: 'linear-gradient(135deg, rgba(4,99,37,0.9), rgba(4,189,67,0.85))',
              padding: '10px 16px',
              textAlign: 'center',
            }}>
              <p style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                margin: 0,
                lineHeight: 1.3,
              }}>
                Redeemer&apos;s Schools and College, Owotoro
              </p>
              <p style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.8)',
                margin: '2px 0 0 0',
                fontWeight: 500,
              }}>
                Providing Quality, Value-Driven Education | Saki, Oyo State, Nigeria
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-blue-300/50 text-xs mt-5 font-medium" style={animStyles.fadeIn}>
          &copy; {new Date().getFullYear()} Redeemer&apos;s Schools and College, Owotoro
        </p>
      </div>
    </div>
  );
}
