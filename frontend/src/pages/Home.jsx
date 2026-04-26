import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Video,
  Type,
  MessageSquare,
  BookOpen,
  History,
  ArrowRight,
  Sparkles,
  Hand,
  Smile,
  Eye,
  Target,
  Brain,
  Users,
  Calendar,
  PhoneCall,
  WifiOff,
} from "lucide-react";
import { getSignOfTheDay } from "../lib/api";

const FeatureCard = ({ to, icon: Icon, title, description, testId }) => (
  <Link to={to} data-testid={testId} className="group">
    <Card className="h-full p-6 border border-slate-200 bg-white hover:border-[#002FA7] hover:-translate-y-1 hover:shadow-md transition-all duration-200 rounded-xl">
      <div className="w-10 h-10 rounded-md bg-slate-100 group-hover:bg-[#002FA7] group-hover:text-white text-slate-700 flex items-center justify-center mb-4 transition-colors duration-200">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-display text-xl font-semibold text-slate-900 mb-1.5">
        {title}
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed mb-4">
        {description}
      </p>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-[#002FA7]">
        Abrir <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
      </span>
    </Card>
  </Link>
);

export default function Home() {
  const [sotd, setSotd] = useState(null);
  useEffect(() => {
    getSignOfTheDay().then(setSotd).catch(() => {});
  }, []);
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 sm:py-10">
      {/* Sign of the day banner */}
      {sotd && (
        <Card
          data-testid="sign-of-the-day"
          className="mb-8 p-5 sm:p-6 border-0 bg-gradient-to-r from-[#002FA7] to-[#3b5bdb] text-white rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-4 fade-in-up"
        >
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wide opacity-80">
                Signo del día
              </div>
              <div className="font-display text-2xl font-semibold">
                {sotd.word}{" "}
                <Badge className="bg-white/15 text-white border-0 ml-1 text-xs">
                  {sotd.language}
                </Badge>
              </div>
            </div>
          </div>
          <p className="text-sm sm:text-base opacity-90 flex-1">
            {sotd.description}
          </p>
          <Link
            to={`/practica?word=${encodeURIComponent(sotd.word)}`}
            data-testid="sotd-practice-link"
          >
            <Button className="bg-white text-[#002FA7] hover:bg-slate-100 rounded-full">
              Practícalo <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </Card>
      )}
      {/* Hero */}
      <section className="grid lg:grid-cols-12 gap-8 lg:gap-10 items-center mb-12 sm:mb-16">
        <div className="lg:col-span-7 order-2 lg:order-1">
          <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 border-0 mb-4 sm:mb-5 font-medium">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Traducción multimodal con IA
          </Badge>
          <h1
            data-testid="hero-title"
            className="font-display text-3xl sm:text-5xl lg:text-6xl font-semibold text-slate-900 dark:text-slate-100 leading-[1.05] tracking-tight"
          >
            Traduce el lenguaje de signos{" "}
            <span className="text-[#002FA7]">completo</span>
            <span className="text-slate-400">.</span>
          </h1>
          <p className="mt-4 sm:mt-6 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
            No solo reconocemos las manos. Nuestra IA analiza también tus{" "}
            <strong className="text-slate-900 dark:text-slate-100">labios</strong>,{" "}
            <strong className="text-slate-900 dark:text-slate-100">expresiones faciales</strong> y{" "}
            <strong className="text-slate-900 dark:text-slate-100">postura corporal</strong> — porque
            así es como funciona realmente el lenguaje de signos.
          </p>

          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3">
            <Link to="/traducir-en-vivo" data-testid="cta-live">
              <Button className="btn-ikb rounded-full px-6 h-12 w-full sm:w-auto">
                <Video className="w-4 h-4 mr-2" /> Empezar traducción en vivo
              </Button>
            </Link>
            <Link to="/texto-a-signos" data-testid="cta-text-to-sign">
              <Button
                variant="outline"
                className="rounded-full px-6 h-12 border-slate-300 w-full sm:w-auto"
              >
                <Type className="w-4 h-4 mr-2" /> Texto a signos
              </Button>
            </Link>
          </div>

          <div className="mt-8 sm:mt-10 grid grid-cols-3 gap-4 max-w-lg">
            <Stat icon={Hand} label="Manos" />
            <Stat icon={Smile} label="Labios y boca" />
            <Stat icon={Eye} label="Expresión facial" />
          </div>
        </div>

        <div className="lg:col-span-5 order-1 lg:order-2">
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-[4/5] sm:aspect-[4/5] bg-slate-100">
            <img
              src="https://images.unsplash.com/photo-1758599543122-fc551c9b4b1c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwzfHxzaWduJTIwbGFuZ3VhZ2UlMjB0cmFuc2xhdGlvbiUyMHBlcnNvbnxlbnwwfHx8fDE3NzcxNTMxNzF8MA&ixlib=rb-4.1.0&q=85"
              alt="Persona haciendo lenguaje de signos"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
              <div className="bg-black/55 backdrop-blur-md text-white px-4 py-2 rounded-lg text-base sm:text-lg font-semibold">
                "Hola, encantado de conocerte"
              </div>
              <Badge className="bg-white text-slate-900 border-0">LSE</Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="mb-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900">
              Todo lo que necesitas en un solo lugar
            </h2>
            <p className="text-slate-600 mt-1">
              Cinco herramientas profesionales para comunicarte sin barreras.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <FeatureCard
            to="/traducir-en-vivo"
            icon={Video}
            title="Traducir en vivo"
            description="Activa la cámara y la IA traducirá tus señas a texto en tiempo real, considerando manos, boca y expresiones."
            testId="feature-live"
          />
          <FeatureCard
            to="/texto-a-signos"
            icon={Type}
            title="Texto a signos"
            description="Escribe cualquier frase y obtén una guía paso a paso con manos, componentes orales, expresiones y postura."
            testId="feature-text-to-sign"
          />
          <FeatureCard
            to="/conversacion"
            icon={MessageSquare}
            title="Modo conversación"
            description="Pantalla dividida para conversar entre signantes y oyentes en ambas direcciones, sin fricción."
            testId="feature-conversation"
          />
          <FeatureCard
            to="/diccionario"
            icon={BookOpen}
            title="Diccionario de signos"
            description="Explora signos comunes en LSE, LSM, ASL y más, con descripción detallada de cada componente."
            testId="feature-dictionary"
          />
          <FeatureCard
            to="/historial"
            icon={History}
            title="Historial"
            description="Revisa tus traducciones anteriores con fecha, idioma detectado y duración."
            testId="feature-history"
          />
          <FeatureCard
            to="/llamada"
            icon={PhoneCall}
            title="Videollamada con subtítulos"
            description="Llamadas WebRTC 1-a-1 con un código de sala y subtítulos de IA en directo. Sin instalar nada."
            testId="feature-call"
          />
          <Card className="p-6 border border-dashed border-slate-300 bg-slate-50 rounded-xl">
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 mb-3">
              Multilenguaje
            </Badge>
            <h3 className="font-display text-xl font-semibold text-slate-900 mb-1.5">
              Detección automática
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Soporte para LSE, LSM, ASL, LIBRAS y otras variantes con detección
              automática del idioma signado.
            </p>
          </Card>
        </div>
      </section>

      {/* How it works */}
      <section className="rounded-2xl bg-slate-50 border border-slate-200 p-8 sm:p-12 mb-12">
        <div className="grid md:grid-cols-3 gap-8">
          <Step
            n="01"
            title="Activa tu cámara"
            text="Concede permisos y posiciónate frente a la cámara con buena luz."
          />
          <Step
            n="02"
            title="Sigue signando"
            text="Manos, boca y expresiones — la IA observa todo a la vez."
          />
          <Step
            n="03"
            title="Lee la traducción"
            text="Aparece en pantalla en tiempo real con el idioma detectado."
          />
        </div>
      </section>
    </div>
  );
}

const Stat = ({ icon: Icon, label }) => (
  <div className="flex flex-col items-start gap-2">
    <span className="w-10 h-10 rounded-md bg-[#002FA7]/10 text-[#002FA7] flex items-center justify-center">
      <Icon className="w-5 h-5" />
    </span>
    <span className="text-sm font-medium text-slate-700">{label}</span>
  </div>
);

const Step = ({ n, title, text }) => (
  <div>
    <div className="font-display text-3xl text-slate-300 font-semibold">
      {n}
    </div>
    <h3 className="font-display text-lg font-semibold text-slate-900 mt-1">
      {title}
    </h3>
    <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{text}</p>
  </div>
);
