const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

const oldLoad = `    async function loadData(force = false) {
      setLoading(true);
      const [vol, act, metas] = await Promise.all([
        fetchVolumenData(force),
        fetchActivacionData(force),
        fetchMetasActivacion(force)
      ]);
      setVolumenData(vol);
      setActivacionData(act);
      setMetasActivacion(metas);
      setLoading(false);
    }

    // Expose loadData to be callable manually
    (window as any).refreshData = () => loadData(true);

    loadData();`;

const newLoad = `    let isMounted = true;
    
    async function loadData(force = false, showLoader = true) {
      if (showLoader) setLoading(true);
      try {
        const [vol, act, metas] = await Promise.all([
          fetchVolumenData(force),
          fetchActivacionData(force),
          fetchMetasActivacion(force)
        ]);
        if (isMounted) {
          setVolumenData(vol);
          setActivacionData(act);
          setMetasActivacion(metas);
        }
      } catch (err) {
        console.error("Error al sincronizar datos automáticamente", err);
      } finally {
        if (isMounted && showLoader) setLoading(false);
      }
    }

    // Expose loadData to be callable manually if needed
    (window as any).refreshData = () => loadData(true, true);

    loadData(false, true);

    // Auto-sync every 60 seconds completely in the background without loader
    const syncInterval = setInterval(() => {
      loadData(false, false);
    }, 60000);`;

app = app.replace(oldLoad, newLoad);

const oldRet = `      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => subscription?.unsubscribe();
    }
  }, []);`;

const newRet = `      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => {
        isMounted = false;
        clearInterval(syncInterval);
        subscription?.unsubscribe();
      };
    }
    
    return () => {
      isMounted = false;
      clearInterval(syncInterval);
    };
  }, []);`;

app = app.replace(oldRet, newRet);

fs.writeFileSync('src/App.tsx', app);
