const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  `      supabase.auth.getSession().then(({ data: { session } }) => {\n        setSession(session);\n      });`,
  `      supabase.auth.getSession().then(({ data: { session } }) => {\n        setSession(session);\n      }).catch(err => {\n        console.error("Supabase session error:", err);\n      });`
);

fs.writeFileSync('src/App.tsx', content);
