const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');

const importAuthStr = `import { Lock, User as UserIcon, AlertCircle } from 'lucide-react';\nimport { Target`;
if (!app.includes('import { Lock, User as UserIcon')) {
  app = app.replace(`import { Target`, importAuthStr);
}

const loginState = `  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState('');`;

if (!app.includes('const [isLoggedIn, setIsLoggedIn]')) {
  app = app.replace(`const [session, setSession] = useState<any>(null);`, `const [session, setSession] = useState<any>(null);\n${loginState}`);
}

const vendorMap = `
  const vendorEmails: Record<string, string> = {
    'pagos.codizulca@gmail.com': 'ADMIN',
    'mariabricenosala@gmail.com': 'MARIA BRICEÑO',
    'carlos.fuenmayorrp@gmail.com': 'CARLOS FUENMAYOR',
    'lugoyoleida00@gmail.com': 'YOLEIDA LUGO',
    'moremelcobranza@gmail.com': 'ANGELICA MORENO',
    'alij_pm@hotmail.com': 'ALI PEREZ',
    'paab937@gmail.com': 'PEDRO ABREU',
    'sarahreyesrosales@gmail.com': 'SARAH REYES',
    'josegregorio161177@gmail.com': 'JOSE G. GONZALEZ',
    'superremolqueca@gmail.com': 'MARYERY GARCIA',
    'epina3343@gmail.com': 'EDUARDO PIÑA',
    'marianachacinrosas@gmail.com': 'MARIANA CHACIN',
    'araujojuanpabla@gmail.com': 'J PABLO ARAUJO',
    'jh3590055@gmail.com': 'JUAN HERNANDEZ',
    'johnatansoto36@gmail.com': 'JOHNATAN SOTO',
    'luisgustavo127@gmail.com': 'LUIS GUANIPA',
    'cobranzaslauyleo05@gmail.com': 'LEONARDO RIOS',
    'sairu_valles@hotmail.com': 'SAIRU VALLES',
    'oswaldochurioncodizulca@gmail.com': 'OSWALDO CHOURION',
    'adeljaraba0704@gmail.com': 'ADEL JARABA',
    'hernandj81@gmail.com': 'HERNAN PAZ',
    'solerelisab@gmail.com': 'ELISA SOLER'
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    const email = authEmail.toLowerCase().trim();
    if (authPassword !== 'codi.123') {
      setLoginError('Contraseña incorrecta');
      return;
    }
    
    const vendorName = vendorEmails[email];
    if (!vendorName) {
      setLoginError('Correo no autorizado o no encontrado en la base de datos');
      return;
    }

    if (vendorName === 'ADMIN') {
      setUserRole('ADMIN');
      setActiveVendedorId('ADMIN');
    } else {
      setUserRole('VENDEDOR');
      setActiveVendedorId(vendorName);
    }
    
    setIsLoggedIn(true);
  };
`;

if (!app.includes('const handleLogin')) {
  app = app.replace(`const filteredVolumen = useMemo`, `${vendorMap}\n  const filteredVolumen = useMemo`);
}


const loginScreen = `  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500"></div>
          
          <div className="text-center mb-8">
            <h1 className="text-3xl font-sans font-bold text-white mb-2 tracking-tight">Codizulca <span className="text-red-500">Sales</span></h1>
            <p className="text-neutral-500 font-sans text-sm">Ingresa con tu correo de vendedor</p>
          </div>

          {loginError && (
            <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-4 mb-6 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm font-sans text-red-400">{loginError}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-sans font-bold text-neutral-400 uppercase tracking-wider mb-2">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-neutral-500" />
                </div>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-neutral-800 rounded-lg bg-neutral-900 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-colors font-sans text-sm"
                  placeholder="ejemplo@gmail.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-sans font-bold text-neutral-400 uppercase tracking-wider mb-2">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-neutral-500" />
                </div>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-neutral-800 rounded-lg bg-neutral-900 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-colors font-sans text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-sans font-bold text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors mt-8"
            >
              Ingresar al Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }`;

if (!app.includes('if (!isLoggedIn) {')) {
  app = app.replace(`if (loading) {`, `${loginScreen}\n\n  if (loading) {`);
}

// Disable vendor select in header if user is not admin
app = app.replace(
  /<select\s*value=\{activeVendedorId\}\s*onChange=\{\(e\) => setActiveVendedorId\(e\.target\.value\)\}/m,
  `<select 
                    value={activeVendedorId}
                    onChange={(e) => setActiveVendedorId(e.target.value)}
                    disabled={userRole !== 'ADMIN'}
`
);

fs.writeFileSync('src/App.tsx', app);
