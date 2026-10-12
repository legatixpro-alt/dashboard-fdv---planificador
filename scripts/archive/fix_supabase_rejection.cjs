const fs = require('fs');
let content = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

content = content.replace(
  `    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkAccess(session.user);
      else setAuthLoading(false);
    });`,
  `    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkAccess(session.user);
      else setAuthLoading(false);
    }).catch(err => {
      console.error("Session fetch error:", err);
      setAuthError("No se pudo conectar con la base de datos.");
      setAuthLoading(false);
    });`
);

content = content.replace(
  `  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(error.message);
      setAuthLoading(false);
    }
  };`,
  `  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error.message);
      }
    } catch (err: any) {
      setAuthError(err.message || "Error de conexión.");
    } finally {
      setAuthLoading(false);
    }
  };`
);

fs.writeFileSync('src/components/CobrosOCR.tsx', content);
