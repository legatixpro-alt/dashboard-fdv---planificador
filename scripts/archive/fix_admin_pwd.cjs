const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

const oldLogin = `    const email = authEmail.toLowerCase().trim();
    if (authPassword.trim() !== 'codi.123') {
      setLoginError('Contraseña incorrecta');
      return;
    }
    
    const vendorName = vendorEmails[email];
    if (!vendorName) {
      setLoginError('Correo no autorizado o no encontrado en la base de datos');
      return;
    }`;

const newLogin = `    const email = authEmail.toLowerCase().trim();
    
    const vendorName = vendorEmails[email];
    if (!vendorName) {
      setLoginError('Correo no autorizado o no encontrado en la base de datos');
      return;
    }

    const pwd = authPassword.trim();
    if (vendorName === 'ADMIN') {
      if (pwd !== '123') {
        setLoginError('Contraseña incorrecta');
        return;
      }
    } else {
      if (pwd !== 'codi.123') {
        setLoginError('Contraseña incorrecta');
        return;
      }
    }`;

app = app.replace(oldLogin, newLogin);

fs.writeFileSync('src/App.tsx', app);
