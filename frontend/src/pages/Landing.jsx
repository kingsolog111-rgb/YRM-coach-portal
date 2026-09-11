import { useNavigate } from "react-router-dom";
import { Crosshair, Target, TrendingUp, Users, ArrowLeft } from "lucide-react";

const HERO = "https://images.unsplash.com/photo-1542751371-adc38448a05e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjd8MHwxfHNlYXJjaHwxfHxlc3BvcnRzJTIwdG91cm5hbWVudCUyMHBsYXllcnxlbnwwfHx8fDE3ODgwMTM5MjN8MA&ixlib=rb-4.1.0&q=85";

const FEATURES = [
  { icon: Target, title: "تقييم 7 محاور", desc: "Aim, Recoil, Movement, Game Sense, Positioning, Communication, Decision Making" },
  { icon: TrendingUp, title: "تتبع التطور", desc: "شوف تطورك بمخططات دقيقة مع مقارنة تقييمك بتقييم المدرب" },
  { icon: Users, title: "Daily Check-in", desc: "سجّل أداءك اليومي وارفع سكرين شوت نتائجك" },
];

export default function Landing() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="absolute top-0 inset-x-0 z-20 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crosshair className="text-gold w-7 h-7 gold-glow" />
          <span className="font-data font-bold text-xl tracking-widest text-gold">YRM</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/login")} className="text-sm text-foreground/80 hover:text-gold transition-colors" data-testid="landing-login-btn">
            تسجيل دخول
          </button>
          <button onClick={() => navigate("/register")} className="bg-gold text-background text-sm font-semibold px-5 py-2 rounded-sm hover:brightness-110 transition-all" data-testid="landing-register-btn">
            حساب جديد
          </button>
        </div>
      </header>

      <section className="relative min-h-screen flex items-center">
        <div className="absolute inset-0">
          <img src={HERO} alt="esports" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-l from-background via-background/90 to-background/50" />
          <div className="absolute inset-0 bg-background/40" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
          <div className="max-w-2xl animate-fade-up">
            <span className="inline-block font-data text-gold border border-gold/40 px-3 py-1 rounded-sm text-xs tracking-[0.3em] mb-6">
              PUBG MOBILE COACHING
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
              طوّر مستواك مع
              <span className="text-gold gold-glow block">YRM Coach Portal</span>
            </h1>
            <p className="text-base sm:text-lg text-foreground/70 mb-8 leading-relaxed">
              منصة تدريب فردية للاعبي الـesports. تقييم دقيق، متابعة يومية، وتحليل تطورك خطوة بخطوة مع مدربك الخاص.
            </p>
            <div className="flex flex-wrap gap-4">
              <button onClick={() => navigate("/register")} className="group flex items-center gap-2 bg-gold text-background font-bold px-7 py-3.5 rounded-sm hover:brightness-110 transition-all" data-testid="hero-cta-btn">
                ابدأ الحين
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              </button>
              <button onClick={() => navigate("/login")} className="border border-gold/40 text-gold font-semibold px-7 py-3.5 rounded-sm hover:bg-gold/10 transition-colors" data-testid="hero-login-btn">
                عندي حساب
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURES.map((f, i) => (
          <div key={i} className="hud-panel rounded-sm p-8 hover:border-gold/50 transition-colors" style={{ animationDelay: `${i * 0.1}s` }} data-testid={`feature-card-${i}`}>
            <f.icon className="text-gold w-9 h-9 mb-4" />
            <h3 className="text-lg font-bold mb-2">{f.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed font-data">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-8 text-center text-muted-foreground text-sm font-data tracking-wider">
        YRM COACH PORTAL — {new Date().getFullYear()}
      </footer>
    </div>
  );
}
