/**
 * /login — Pure HTML login page. No React hydration needed.
 * Uses inline onclick + form action for maximum compatibility.
 */
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0b1220] text-white" dir="rtl">
      <header className="px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-lg">G</span>
          </div>
          <span className="font-bold text-lg">GarfiX EOS <span className="text-emerald-400 text-xs font-normal">v4.0</span></span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-white/[0.03] border border-emerald-500/20 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg mx-auto mb-4">
                <span className="text-3xl">🛡️</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">مرحباً بعودتك! 👋</h2>
              <p className="text-sm text-white/50">سجّل دخولك للوصول إلى لوحة التحكم</p>
            </div>

            <form id="login-form" className="space-y-4">
              <div id="login-error" className="hidden p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"></div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-white/80 block">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@garfix.com"
                  required
                  dir="ltr"
                  className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-white/80 block">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  dir="ltr"
                  className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>

              <button
                type="submit"
                id="login-btn"
                className="w-full py-3 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-sm hover:shadow-lg disabled:opacity-50 transition-all min-h-[44px] flex items-center justify-center gap-2"
              >
                تسجيل الدخول →
              </button>
            </form>

            <p className="text-sm text-white/40 text-center mt-6">
              أو مستخدم جديد؟{" "}
              <Link href="/signup" className="text-emerald-400 hover:text-emerald-300 font-medium">
                إنشاء حساب مجاني ←
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="px-6 py-4 border-t border-white/[0.06]">
        <p className="text-center text-xs text-white/30">GarfiX EOS v4.0 — AI-Native Business Platform</p>
      </footer>

      {/* Pure JS — no React needed */}
      <script dangerouslySetInnerHTML={{ __html: `
        // Check if already logged in (from landing redirect or returning user)
        fetch('/api/auth/me', { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then(user => {
            if (user && user.uid) {
              // Already logged in — show dashboard link
              var main = document.querySelector('main');
              if (main) {
                main.innerHTML = '<div class="flex flex-col items-center gap-6">' +
                  '<div class="text-center">' +
                  '<h2 class="text-2xl font-bold text-white mb-2">أهلاً ' + (user.displayName || user.email) + '!</h2>' +
                  '<p class="text-white/60 mb-6">أنت مسجل الدخول بالفول</p>' +
                  '</div>' +
                  '<div class="grid grid-cols-2 gap-3 w-full max-w-md">' +
                  '<a href="/invoices" class="p-4 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-center hover:border-emerald-500/30 transition-all"><div class="text-2xl mb-1">🧾</div><div class="text-xs font-bold">الفواتير</div></a>' +
                  '<a href="/clients" class="p-4 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-center hover:border-emerald-500/30 transition-all"><div class="text-2xl mb-1">👥</div><div class="text-xs font-bold">العملاء</div></a>' +
                  '<a href="/dashboard" class="p-4 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-center hover:border-emerald-500/30 transition-all"><div class="text-2xl mb-1">📊</div><div class="text-xs font-bold">لوحة التحكم</div></a>' +
                  '<a href="/settings" class="p-4 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-center hover:border-emerald-500/30 transition-all"><div class="text-2xl mb-1">⚙️</div><div class="text-xs font-bold">الإعدادات</div></a>' +
                  '<a href="/dashboard" class="p-4 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-center hover:border-emerald-500/30 transition-all"><div class="text-2xl mb-1">📚</div><div class="text-xs font-bold">المحاسبة</div></a>' +
                  '<a href="/dashboard" class="p-4 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-center hover:border-emerald-500/30 transition-all"><div class="text-2xl mb-1">📦</div><div class="text-xs font-bold">المخزون</div></a>' +
                  '<a href="/founder-panel/mission-control" class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center hover:border-emerald-500/40 transition-all"><div class="text-2xl mb-1">🎯</div><div class="text-xs font-bold">لوحة المؤسس</div></a>' +
                  '<button onclick="logout()" class="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-center hover:border-red-500/40 transition-all"><div class="text-2xl mb-1">🚪</div><div class="text-xs font-bold">خروج</div></button>' +
                  '</div></div>';
              }
            }
          })
          .catch(() => {});

        function logout() {
          fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
            .then(() => { window.location.href = '/'; })
            .catch(() => { window.location.href = '/'; });
        }

        document.getElementById('login-form').addEventListener('submit', async function(e) {
          e.preventDefault();
          var btn = document.getElementById('login-btn');
          var errDiv = document.getElementById('login-error');
          var email = document.getElementById('email').value;
          var password = document.getElementById('password').value;

          btn.disabled = true;
          btn.innerHTML = 'جارٍ التسجيل...';
          errDiv.className = 'hidden';

          try {
            var res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ email: email.trim(), password: password })
            });
            var data = await res.json();
            if (res.ok && data.ok) {
              // Reload page — the auth check at top will show dashboard links
              window.location.href = "/dashboard";
            } else {
              errDiv.textContent = data.error || 'فشل تسجيل الدخول';
              errDiv.className = 'block p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm';
              btn.disabled = false;
              btn.innerHTML = 'تسجيل الدخول →';
            }
          } catch(err) {
            errDiv.textContent = 'خطأ في الاتصال';
            errDiv.className = 'block p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm';
            btn.disabled = false;
            btn.innerHTML = 'تسجيل الدخول →';
          }
        });
      `}} />
    </div>
  );
}
